"""WATTWISE DZ AI Agent — Context builder and Groq-powered chat."""

from __future__ import annotations

import json
import logging
import os
import re
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import func, select

from app.ai.energy_optimizer import OptimizationInputs, optimize
from app.ai.pv_detector import compute_health_score
from app.config import settings
from app.database import SessionLocal
from app.models import Alert, PVFault, PVReading, Reading, SolarProduction, SystemSetting
from sqlalchemy import func, select, and_

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"
FALLBACK_MODELS = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"]


def _integrate_energy_kwh(
    points: list[tuple[datetime, float | None]],
    max_gap_seconds: float = 6 * 3600,
) -> float:
    """Trapezoidal integration of power samples (W) into energy (kWh)."""
    ordered: list[tuple[datetime, float]] = []
    for timestamp, value in points:
        if timestamp is None or value is None:
            continue
        ts = timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        ordered.append((ts, float(value)))
    ordered.sort(key=lambda item: item[0])

    energy_wh = 0.0
    for (prev_ts, prev_power), (ts, power) in zip(ordered, ordered[1:]):
        gap = (ts - prev_ts).total_seconds()
        if gap <= 0 or gap > max_gap_seconds:
            continue
        energy_wh += (prev_power + power) / 2.0 * (gap / 3600.0)
    return max(0.0, energy_wh / 1000.0)


async def get_current_context(device_id: str = "SALLE1") -> str:
    """Build a French summary of current device state for the AI agent.

    Queries the latest reading and active alerts from the database and
    returns a concise French description suitable for injection into an LLM
    system prompt.

    Args:
        device_id: Device identifier to query.

    Returns:
        A French summary string with current power, temperature, occupancy
        and active alert counts.
    """
    async with SessionLocal() as session:
        # Latest reading
        reading_stmt = (
            select(Reading)
            .where(Reading.device_id == device_id)
            .order_by(Reading.timestamp.desc(), Reading.id.desc())
            .limit(1)
        )
        reading = (await session.scalars(reading_stmt)).first()

        # Active alerts (unresolved)
        alert_stmt = (
            select(Alert.type, func.count(Alert.id))
            .where(Alert.device_id == device_id, Alert.resolved.is_(False))
            .group_by(Alert.type)
        )
        alert_rows = (await session.execute(alert_stmt)).all()

        # Eco mode state
        eco_stmt = select(SystemSetting.value).where(SystemSetting.key == "eco_mode")
        eco_val = (await session.scalar(eco_stmt))
        eco_active = str(eco_val).lower() in ("true", "1", "yes")

        # Vacation mode state
        vac_stmt = select(SystemSetting.value).where(SystemSetting.key == "vacation_mode")
        vac_val = (await session.scalar(vac_stmt))
        vac_active = str(vac_val).lower() in ("true", "1", "yes")

        # Latest solar production and 24h average production (legacy model)
        solar_stmt = (
            select(SolarProduction)
            .order_by(SolarProduction.timestamp.desc(), SolarProduction.id.desc())
            .limit(1)
        )
        solar_latest = (await session.scalars(solar_stmt)).first()
        day_ago = datetime.now(timezone.utc) - timedelta(hours=24)
        avg_solar_kw = await session.scalar(
            select(func.avg(SolarProduction.power_kw)).where(
                SolarProduction.timestamp >= day_ago
            )
        )
        solar_daily_kwh = float(avg_solar_kw or 0.0) * 24

        # Advanced PV telemetry, diagnostics and building consumption.
        pv_latest = (
            await session.scalars(
                select(PVReading)
                .order_by(PVReading.timestamp.desc(), PVReading.id.desc())
                .limit(1)
            )
        ).first()
        pv_rows = list(
            (
                await session.scalars(
                    select(PVReading)
                    .where(PVReading.timestamp >= day_ago)
                    .order_by(PVReading.timestamp.asc())
                )
            ).all()
        )
        pv_faults = list(
            (
                await session.scalars(
                    select(PVFault)
                    .where(PVFault.status == "ACTIVE")
                    .order_by(PVFault.last_detected_at.desc())
                )
            ).all()
        )
        building_rows = list(
            (
                await session.scalars(
                    select(Reading)
                    .where(
                        Reading.device_id == device_id,
                        Reading.timestamp >= day_ago,
                    )
                    .order_by(Reading.timestamp.asc())
                )
            ).all()
        )

    solar_power_kw = float(solar_latest.power_kw) if solar_latest else 0.0
    pv_daily_kwh = _integrate_energy_kwh(
        [
            (
                row.timestamp,
                row.actual_power if row.actual_power is not None else row.ac_power,
            )
            for row in pv_rows
        ]
    )
    if pv_daily_kwh <= 0:
        pv_daily_kwh = solar_daily_kwh
    consumption_daily_kwh = _integrate_energy_kwh(
        [(row.timestamp, row.power) for row in building_rows]
    )
    if consumption_daily_kwh <= 0 and reading is not None and reading.power:
        consumption_daily_kwh = max(0.0, float(reading.power) * 24.0 / 1000.0)

    solar_text = (
        f"Production solaire actuelle (modèle historique): {solar_power_kw:.2f} kW. "
        f"Énergie solaire produite sur 24h: {pv_daily_kwh:.1f} kWh."
    )

    if pv_latest is None:
        pv_text = "Aucune mesure photovoltaïque avancée disponible."
        inverter_text = "Télémétrie onduleur indisponible."
        health_text = "État de santé PV: inconnu (aucune mesure)."
    else:
        expected = pv_latest.expected_power
        actual = (
            pv_latest.actual_power
            if pv_latest.actual_power is not None
            else pv_latest.ac_power
        )
        deviation = (
            (actual - expected) / expected * 100.0
            if actual is not None and expected not in (None, 0)
            else None
        )
        pv_text = (
            f"Mesures PV ({pv_latest.data_source}): puissance réelle "
            f"{actual:.0f} W, attendue {expected:.0f} W"
            if actual is not None and expected is not None
            else "Mesures PV disponibles mais puissance réelle/attendue incomplète"
        )
        if deviation is not None:
            pv_text += f", écart {deviation:+.0f} %"
        if pv_latest.irradiance is not None:
            pv_text += f", irradiance {pv_latest.irradiance:.0f} W/m²"
        if pv_latest.panel_temperature is not None:
            pv_text += f", température panneau {pv_latest.panel_temperature:.1f} °C"
        pv_text += "."

        if pv_latest.inverter_efficiency is not None:
            inverter_text = (
                f"Onduleur: rendement {pv_latest.inverter_efficiency:.1f} %, "
                f"température "
                f"{pv_latest.inverter_temperature if pv_latest.inverter_temperature is not None else 'inconnue'} °C, "
                f"statut {pv_latest.inverter_status or 'inconnu'}."
            )
        else:
            inverter_text = (
                "Télémétrie onduleur indisponible : aucun rendement ne peut être affirmé."
            )

        health = compute_health_score(pv_faults)
        if pv_faults:
            fault_descriptions = "; ".join(
                f"{fault.fault_type} [{fault.severity}] {fault.message}"
                for fault in pv_faults[:4]
            )
            health_text = (
                f"État de santé PV: {health['score']}/100 ({health['label']}). "
                f"{len(pv_faults)} anomalie(s) active(s), non confirmées "
                f"physiquement: {fault_descriptions}."
            )
        else:
            health_text = (
                f"État de santé PV: {health['score']}/100 ({health['label']}), "
                "aucune anomalie active."
            )

    try:
        optimization = optimize(
            OptimizationInputs(
                solar_kwh=max(0.0, pv_daily_kwh),
                consumption_kwh=max(0.0, consumption_daily_kwh),
                battery_capacity_kwh=settings.battery_capacity_kwh,
                battery_soc_percent=settings.battery_default_soc_percent,
                battery_min_soc_percent=settings.battery_min_soc_percent,
                battery_max_soc_percent=settings.battery_max_soc_percent,
                battery_charge_limit_kw=settings.battery_charge_limit_kw,
                battery_discharge_limit_kw=settings.battery_discharge_limit_kw,
                battery_round_trip_efficiency=settings.battery_round_trip_efficiency,
                grid_tariff_dzd_per_kwh=settings.grid_tariff_dzd_per_kwh,
                grid_export_enabled=settings.grid_export_enabled,
                grid_export_tariff_dzd_per_kwh=settings.grid_export_tariff_dzd_per_kwh,
            )
        )
        optimization_text = (
            f"Optimisation énergétique (estimation, batterie simulée): "
            f"{optimization['recommendation_text']} "
            f"Répartition: solaire {optimization['solar_used_kwh']:.2f} kWh, "
            f"batterie {optimization['battery_used_kwh']:.2f} kWh, "
            f"réseau {optimization['grid_used_kwh']:.2f} kWh. "
            f"Niveau batterie simulé: {optimization['battery_level_percent']:.0f} %."
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.debug("Energy optimization unavailable for chat: %s", exc)
        optimization_text = "Optimisation énergétique indisponible."

    # Build context string
    if reading is None:
        context = (
            f"Appareil {device_id}. Aucune donnée de lecture disponible. "
            f"Aucune alerte active. Mode Éco: {'ACTIVÉ' if eco_active else 'DÉSACTIVÉ'}. "
            f"Mode Vacances: {'ACTIVÉ' if vac_active else 'DÉSACTIVÉ'}. "
            f"{solar_text} {pv_text} {inverter_text} {health_text} {optimization_text}"
        )
    else:
        power = reading.power
        temperature = reading.temperature
        occupancy = reading.occupancy

        occ_text = "occupé" if occupancy else "inoccupé"
        if occupancy is None:
            occ_text = "inconnu"

        parts = [
            f"Appareil {device_id}.",
            f"Puissance: {power:.0f} W" if power is not None else "Puissance: inconnue",
            f"Température: {temperature:.1f}°C" if temperature is not None else "Température: inconnue",
            f"Occupé: {occ_text}",
            f"Mode Éco: {'ACTIVÉ' if eco_active else 'DÉSACTIVÉ'}.",
            f"Mode Vacances: {'ACTIVÉ' if vac_active else 'DÉSACTIVÉ'}.",
            solar_text,
            pv_text,
            inverter_text,
            health_text,
            optimization_text,
        ]

        if alert_rows:
            alert_parts = []
            for alert_type, count in alert_rows:
                type_label = {
                    "FAN_NO_OCCUPANCY": "ventilateur allumé sans occupation",
                    "HIGH_POWER_NO_OCCUPANCY": "puissance élevée sans occupation",
                    "LIGHTING_CANDIDATE": "éclairage inutile",
                    "LIGHTING_WASTE": "gaspi éclairage",
                    "ISOLATION_FOREST_ANOMALY": "anomalie (forêt d'isolation)",
                    "OVERCONSUMPTION_VS_FORECAST": "surconsommation vs prévision",
                }.get(alert_type, alert_type)
                alert_parts.append(f"{count}x {type_label}")
            alert_text = ", ".join(alert_parts)
            parts.append(f"{len(alert_rows)} alerte(s) active(s) ({alert_text}).")
        else:
            parts.append("Aucune alerte active.")

        context = " ".join(parts)

    return context


async def query_groq(
    messages: list[dict[str, str]],
    api_key: str | None = None,
    model: str = GROQ_MODEL,
    max_tokens: int = 512,
    temperature: float = 0.7,
) -> str:
    """Call the Groq chat completion API.

    Args:
        messages: Chat message list (system/user/assistant).
        api_key: Groq API key (optional, uses settings if not provided).
        model: Groq model name (defaults to llama-3.3-70b-versatile).
        max_tokens: Maximum tokens of the completion.
        temperature: Sampling temperature.

    Returns:
        The assistant's reply text.

    Raises:
        HTTPException: If the API call fails or key is missing.
    """
    key = api_key or settings.groq_api_key or os.environ.get("GROQ_API_KEY", "")
    if not key:
        logger.error("Clé API Groq manquante lors de l'appel à query_groq")
        raise HTTPException(
            status_code=500,
            detail="Clé API Groq manquante. Veuillez définir GROQ_API_KEY.",
        )

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    target_model = model or getattr(settings, "groq_model", GROQ_MODEL) or GROQ_MODEL
    models_to_try = [target_model] + [m for m in FALLBACK_MODELS if m != target_model]

    last_response: httpx.Response | None = None
    for attempt_model in models_to_try:
        payload = {
            "model": attempt_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(GROQ_API_URL, headers=headers, json=payload)
        except Exception as exc:
            logger.error("Erreur lors de l'appel HTTP à l'API Groq: %s", exc, exc_info=True)
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Impossible de contacter l'API Groq : {exc}",
            ) from exc

        last_response = response

        if response.status_code == 200:
            break

        # Fallback if the requested model is not found/deprecated on Groq
        if response.status_code == 404 and "model_not_found" in response.text:
            logger.warning(
                "Modèle Groq '%s' introuvable (404). Tentative de repli sur un autre modèle...",
                attempt_model,
            )
            continue

        break

    if last_response is None or last_response.status_code != 200:
        err_msg = last_response.text if last_response else "Aucune réponse reçue"
        status = last_response.status_code if last_response else 500
        logger.error("Erreur API Groq (HTTP %s): %s", status, err_msg)
        raise HTTPException(
            status_code=500,
            detail=f"Erreur retournée par le service Groq ({status}) : {err_msg}",
        )

    try:
        data = last_response.json()
        return data["choices"][0]["message"]["content"]
    except Exception as exc:
        logger.error("Erreur de décodage de la réponse Groq: %s", exc, exc_info=True)
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Réponse inattendue du service Groq : {exc}",
        ) from exc


def extract_action(response_text: str) -> tuple[dict[str, Any] | None, str]:
    """Extract a JSON action block from the AI response and return clean text.

    Args:
        response_text: Raw AI response text.

    Returns:
        Tuple of (action_dict or None, cleaned_text_without_json).
    """
    match = re.search(r"\{[\s\S]*\"action\"[\s\S]*\}", response_text)
    if not match:
        return None, response_text.strip()

    candidate = match.group(0)
    action: dict[str, Any] | None = None
    clean_text = response_text

    try:
        data = json.loads(candidate)
        if isinstance(data, dict) and "action" in data and isinstance(data["action"], dict):
            action = data["action"]
            clean_text = response_text.replace(candidate, "").strip()
    except Exception:
        start = response_text.find("{")
        end = response_text.rfind("}")
        if start != -1 and end != -1 and end > start:
            sub = response_text[start : end + 1]
            try:
                data = json.loads(sub)
                if isinstance(data, dict) and "action" in data:
                    action = data["action"]
                    clean_text = (response_text[:start] + response_text[end + 1 :]).strip()
            except Exception:
                pass

    # Clean leftover markdown or braces
    clean_text = re.sub(r"```(?:json)?", "", clean_text)
    clean_text = clean_text.strip("{} \n\r\t")

    return action, clean_text


async def chat_with_watty(
    message: str,
    device_id: str = "SALLE1",
    groq_api_key: str | None = None,
) -> dict[str, Any]:
    """Run the full WATTY chat pipeline.

    Args:
        message: User message.
        device_id: Target device.
        groq_api_key: Groq API key (read from settings/env if not provided).

    Returns:
        Dict with 'reply' (str) and optional 'action' (dict).
    """
    key = groq_api_key or settings.groq_api_key or os.environ.get("GROQ_API_KEY", "")

    if not key:
        return {
            "reply": (
                "Je suis WATTY, votre assistant énergie. Cependant, je ne peux "
                "pas fonctionner sans clé API Groq configurée. Veuillez définir "
                "GROQ_API_KEY dans le backend .env."
            ),
            "action": None,
        }

    # Build context from live data
    context = await get_current_context(device_id)

    system_prompt = (
        "Tu es WATTY, l'assistant IA de WATTWISE DZ. Tu parles français. "
        "Tu es un expert en énergie et en gestion technique de bâtiments en Algérie. "
        "Fonctionnalités de la plateforme :\n"
        "- Wattwise Score : note globale d'efficacité énergétique de 0 à 100 avec lettre A-F.\n"
        "- Top Consommateurs : classement des zones/appareils les plus énergivores.\n"
        "- Comparaison Voisins : benchmark de consommation vs voisinage.\n"
        "- Mode Éco (Demand Response) : réduction de consommation lors des heures de pointe (18h-20h).\n"
        "- Mode Vacances : agent autonome qui coupe le chauffage et les appareils non-essentiels.\n"
        "- Bilan Carbone : kWh économisés, CO2 évité (facteur 0.45 kg CO2/kWh Sonelgaz) et arbres équivalents.\n"
        "- Simulateur ROI : Digital Twin pour tester des scénarios (Isolation, LED, Climatisation).\n"
        "- Diagnostic FDD : Détection des causes physiques (Climatisation surchargée, Équipement défaillant, Éclairage oublié).\n"
        "- Intégration Solaire Photovoltaïque : Suivi de la production solaire et de l'autoconsommation.\n"
        "- Surveillance PV avancée : tension/courant DC, puissances DC/AC, irradiance, températures, "
        "production réelle vs attendue, source de données (simulateur ou capteur physique).\n"
        "- Diagnostic PV : anomalies de performance (salissure/ombrage possible), surchauffe "
        "panneau, chute de production, cohérence capteurs. Ce sont des anomalies par règles, "
        "PAS des défauts physiques confirmés.\n"
        "- Surveillance onduleur : rendement DC→AC, température, historique, alertes de dégradation.\n"
        "- Optimisation énergétique : répartition solaire / batterie / réseau, économies estimées. "
        "La batterie est simulée tant qu'aucun BMS n'est connecté.\n"
        "- Rapport Hebdomadaire PDF : rapport imprimable de la consommation hebdomadaire.\n\n"
        f"Voici les données actuelles :\n{context}\n\n"
        "Instructions :\n"
        "1. Réponds toujours en français de manière claire, concise et professionnelle.\n"
        "2. Base tes réponses uniquement sur les données fournies ci-dessus.\n"
        "3. Ne prétends jamais qu'un défaut photovoltaïque est confirmé : parle d'anomalie "
        "détectée, de cause possible, et recommande une inspection.\n"
        "4. N'invente jamais de mesure capteur, de tarif Sonelgaz, d'économie réalisée ni de "
        "date de maintenance. Si une donnée manque, dis-le explicitement.\n"
        "5. Distingue toujours les données SIMULÉES des mesures de capteurs physiques.\n"
        "6. Si l'utilisateur demande d'agir, propose un bloc JSON contenant une action appropriée :\n"
        '   - Résoudre les alertes : { "action": { "type": "RESOLVE_ALERTS", "label": "Résoudre les alertes" } }\n'
        '   - Activer ou désactiver le Mode Éco : { "action": { "type": "TOGGLE_ECO_MODE", "label": "Basculer le Mode Éco" } }\n'
        '   - Activer ou désactiver le Mode Vacances : { "action": { "type": "TOGGLE_VACATION_MODE", "label": "Basculer le Mode Vacances" } }\n'
        '   - Afficher ou générer le Bilan Carbone : { "action": { "type": "SHOW_CARBON_REPORT", "label": "Voir le Bilan Carbone" } }\n'
        '   - Afficher la production solaire, les diagnostics PV ou l\'optimisation : { "action": { "type": "SHOW_SOLAR", "label": "Voir la Production Solaire" } }\n'
        '   - Ouvrir le simulateur : { "action": { "type": "OPEN_SIMULATOR", "label": "Ouvrir le Simulateur" } }\n'
        '   - Ouvrir le Rapport Hebdomadaire : { "action": { "type": "OPEN_WEEKLY_REPORT", "label": "Voir le Rapport Hebdomadaire" } }\n'
        "7. Sinon, donne une réponse textuelle utile et concise.\n"
        "Ne invente pas de données qui ne sont pas dans le contexte."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message},
    ]

    ai_text = await query_groq(messages, api_key=key, model=GROQ_MODEL)

    # extract_action returns (action_dict | None, clean_text_without_json)
    action, clean_text = extract_action(ai_text)

    # Heuristic fallback if LLM omitted JSON action block but user requested it
    if action is None:
        low = message.lower()
        if "mode éco" in low or "mode eco" in low:
            action = {"type": "TOGGLE_ECO_MODE", "label": "Basculer le Mode Éco"}
        elif "mode vacances" in low or "vacances" in low or "je pars" in low:
            action = {"type": "TOGGLE_VACATION_MODE", "label": "Basculer le Mode Vacances"}
        elif "bilan carbone" in low or "carbone" in low or "co2" in low:
            action = {"type": "SHOW_CARBON_REPORT", "label": "Voir le Bilan Carbone"}
        elif "simulateur" in low or "simulation" in low or "roi" in low:
            action = {"type": "OPEN_SIMULATOR", "label": "Ouvrir le Simulateur"}
        elif (
            "solaire" in low
            or "photovolta" in low
            or "production" in low
            or "panneau" in low
            or "onduleur" in low
            or "batterie" in low
            or "rendement" in low
            or "ombrage" in low
            or "salissure" in low
            or "source d'énergie" in low
        ):
            action = {"type": "SHOW_SOLAR", "label": "Voir la Production Solaire"}
        elif "alerte" in low and ("résou" in low or "supprim" in low or "effac" in low):
            action = {"type": "RESOLVE_ALERTS", "label": "Résoudre les alertes"}
        elif "rapport hebdomadaire" in low or "rapport" in low or "pdf" in low:
            action = {"type": "OPEN_WEEKLY_REPORT", "label": "Voir le Rapport Hebdomadaire"}

    # If the model answered with only a JSON action block, keep a short text reply
    if not clean_text:
        clean_text = (
            "C'est noté. Je vous propose d'appliquer cette action."
            if action
            else "Je n'ai pas de réponse à formuler pour le moment."
        )

    return {
        "reply": clean_text,
        "action": action,
    }
