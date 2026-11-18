"""WATTY Investigator — explicable AI for a single alert.

Produces exactly three hypotheses, each with a confidence percentage, evidence
gathered from real database values, explicit missing data and a recommended
action. When the Groq API is unavailable the investigation falls back to a
deterministic rules engine so the feature degrades gracefully (demo-safe).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    Alert,
    Equipment,
    PVReading,
    Reading,
    Zone,
)

logger = logging.getLogger(__name__)

MIN_HYPOTHESES = 3


async def _build_alert_context(session: AsyncSession, alert: Alert) -> dict[str, Any]:
    """Collect every useful data point around the alert."""
    equipment: Equipment | None = None
    zone: Zone | None = None
    if alert.equipment_id is not None:
        equipment = (await session.scalars(
            select(Equipment).where(Equipment.id == alert.equipment_id)
        )).first()
        if equipment is not None:
            zone = (await session.scalars(
                select(Zone).where(Zone.id == equipment.zone_id)
            )).first()

    device_id = alert.device_id
    reading: Reading | None = None
    if device_id:
        reading = (await session.scalars(
            select(Reading)
            .where(Reading.device_id == device_id)
            .order_by(Reading.timestamp.desc(), Reading.id.desc())
            .limit(1)
        )).first()

    day_ago = datetime.now(timezone.utc) - timedelta(hours=24)
    recent = []
    if device_id:
        recent = list((await session.scalars(
            select(Reading)
            .where(Reading.device_id == device_id, Reading.timestamp >= day_ago)
            .order_by(Reading.timestamp.desc())
            .limit(50)
        )).all())

    pv_latest = (await session.scalars(
        select(PVReading)
        .order_by(PVReading.timestamp.desc(), PVReading.id.desc())
        .limit(1)
    )).first()

    evidence: dict[str, Any] = {}
    if equipment is not None:
        evidence["equipment"] = {
            "name": equipment.name,
            "type": equipment.type,
            "nominal_power_kw": equipment.nominal_power_kw,
            "current_power_kw": equipment.current_power_kw,
            "status": equipment.status,
            "health_score": equipment.health_score,
        }
    if zone is not None:
        evidence["zone"] = {"name": zone.name, "device_id": zone.device_id}
    if reading is not None:
        evidence["latest_reading"] = {
            "power_w": reading.power,
            "occupancy": reading.occupancy,
            "temperature": reading.temperature,
            "fan_current": reading.fan_current,
            "timestamp": reading.timestamp.isoformat(),
        }
    if recent:
        powers = [r.power for r in recent if r.power is not None]
        occupancies = [r.occupancy for r in recent if r.occupancy is not None]
        if powers:
            evidence["power_stats_24h"] = {
                "avg_w": round(sum(powers) / len(powers), 1),
                "max_w": round(max(powers), 1),
            }
        if occupancies:
            evidence["occupancy_ratio_24h"] = round(
                sum(occupancies) / len(occupancies), 2
            )
    if pv_latest is not None:
        evidence["solar"] = {
            "actual_power_w": (
                pv_latest.actual_power
                if pv_latest.actual_power is not None
                else pv_latest.ac_power
            ),
            "irradiance": pv_latest.irradiance,
            "data_source": pv_latest.data_source,
        }

    return evidence


def _deterministic_hypotheses(
    alert: Alert, evidence: dict[str, Any]
) -> list[dict[str, Any]]:
    """Rules-based fallback when the LLM is unavailable."""
    eq = evidence.get("equipment", {})
    reading = evidence.get("latest_reading", {})
    eq_type = eq.get("type", "Other")
    eq_name = eq.get("name") or alert.device_id
    nominal = eq.get("nominal_power_kw")
    current = eq.get("current_power_kw")
    occupancy = reading.get("occupancy")

    hypotheses: list[dict[str, Any]] = []

    if eq_type == "AC":
        over = (
            isinstance(current, (int, float))
            and isinstance(nominal, (int, float))
            and nominal > 0
            and current > nominal
        )
        hypotheses.append(
            {
                "cause": (
                    f"Le {eq_name} fonctionne à pleine charge en dehors de sa plage "
                    "de dimensionnement (consigne trop basse ou charge thermique élevée)."
                    if over
                    else f"Réglage du thermostat du {eq_name} inadapté à l'occupation réelle."
                ),
                "confidence": 65 if over else 45,
                "evidence": [
                    (
                        f"Puissance actuelle {current} kW > nominale {nominal} kW"
                        if over
                        else f"Puissance actuelle {current} kW (nominale {nominal} kW)"
                    ),
                    f"Occupation actuelle : {occupancy if occupancy is not None else 'inconnue'}",
                ],
                "missing_data": [
                    "Température de consigne réelle de la climatisation",
                    "Historique de maintenance du compresseur",
                ],
                "recommended_action": (
                    "Vérifier la consigne (recommandée : 24 °C) et programmer un arrêt "
                    "automatique hors occupation."
                ),
            }
        )
        hypotheses.append(
            {
                "cause": (
                    "Encrassement des filtres ou dégradation du compresseur "
                    "entraînant une surconsommation pour le même service."
                ),
                "confidence": 30,
                "evidence": [
                    (
                        f"Score de santé équipement : {eq.get('health_score')}/100"
                        if eq.get("health_score") is not None
                        else "Score de santé équipement indisponible"
                    ),
                ],
                "missing_data": [
                    "Photo / inspection visuelle des filtres",
                    "Courant absorbé par phase",
                ],
                "recommended_action": "Planifier une inspection des filtres et du compresseur.",
            }
        )
        hypotheses.append(
            {
                "cause": (
                    "Fausse mesure capteur ou dérive du compteur (valeur isolée "
                    "incohérente avec l'historique)."
                ),
                "confidence": 20,
                "evidence": [
                    (
                        f"Puissance moyenne 24h : "
                        f"{evidence.get('power_stats_24h', {}).get('avg_w', 'inconnue')} W"
                        if evidence.get("power_stats_24h")
                        else "Historique 24h indisponible"
                    ),
                ],
                "missing_data": [
                    "Deuxième lecture de contrôle au même instant",
                    "Vérification du capteur de courant",
                ],
                "recommended_action": "Recouper avec une seconde lecture avant d'agir sur le matériel.",
            }
        )
    elif eq_type == "Light":
        hypotheses.extend(
            [
                {
                    "cause": "Éclairage allumé sans occupants (oubli ou détecteur défaillant).",
                    "confidence": 60,
                    "evidence": [
                        f"Occupation actuelle : {occupancy if occupancy is not None else 'inconnue'}",
                    ],
                    "missing_data": ["Présence réelle confirmée par un second capteur"],
                    "recommended_action": "Éteindre l'éclairage et vérifier la détection de présence.",
                },
                {
                    "cause": "Horaire d'allumage automatique trop large (programme horaire).",
                    "confidence": 25,
                    "evidence": ["Éclairage actif en dehors des heures d'occupation typiques"],
                    "missing_data": ["Configuration du programmateur horaire"],
                    "recommended_action": "Resserrer le programme horaire de l'éclairage.",
                },
                {
                    "cause": "Consommation de veille du ballast / driver LED.",
                    "confidence": 15,
                    "evidence": ["Puissance résiduelle mesurée à faible niveau"],
                    "missing_data": ["Mesure de nuit hors période d'usage"],
                    "recommended_action": "Couper l'alimentation du circuit hors heures d'usage.",
                },
            ]
        )
    else:
        hypotheses.extend(
            [
                {
                    "cause": "Utilisation intensive prolongée de l'équipement informatique.",
                    "confidence": 50,
                    "evidence": [
                        f"Puissance actuelle : {current if current is not None else 'inconnue'} kW",
                    ],
                    "missing_data": ["Politique de mise en veille actuelle"],
                    "recommended_action": "Activer la mise en veille automatique hors heures d'usage.",
                },
                {
                    "cause": "Équipement laissé allumé sans occupation.",
                    "confidence": 35,
                    "evidence": [
                        f"Occupation actuelle : {occupancy if occupancy is not None else 'inconnue'}",
                    ],
                    "missing_data": ["Inventaire des postes actifs la nuit"],
                    "recommended_action": "Éteindre les postes non utilisés en fin de journée.",
                },
                {
                    "cause": "Dérive de mesure du capteur.",
                    "confidence": 15,
                    "evidence": ["Comparaison limitée avec l'historique disponible"],
                    "missing_data": ["Contre-mesure immédiate"],
                    "recommended_action": "Recouper la mesure avant toute action corrective.",
                },
            ]
        )

    return hypotheses[:MIN_HYPOTHESES]


def _validate_hypotheses(raw: Any) -> list[dict[str, Any]] | None:
    """Validate an LLM-produced hypotheses list; None if unusable."""
    if not isinstance(raw, list) or len(raw) < 1:
        return None
    cleaned: list[dict[str, Any]] = []
    for item in raw[:MIN_HYPOTHESES]:
        if not isinstance(item, dict):
            continue
        cause = str(item.get("cause", "")).strip()
        if not cause:
            continue
        try:
            confidence = int(float(item.get("confidence", 50)))
        except (TypeError, ValueError):
            confidence = 50
        cleaned.append(
            {
                "cause": cause,
                "confidence": max(0, min(100, confidence)),
                "evidence": [str(e) for e in (item.get("evidence") or [])][:8],
                "missing_data": [str(m) for m in (item.get("missing_data") or [])][:8],
                "recommended_action": str(
                    item.get("recommended_action") or "Enquêter sur place."
                ).strip(),
            }
        )
    return cleaned or None


def _parse_llm_json(text: str) -> Any:
    """Extract the first JSON object/array from an LLM response."""
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    start = text.find("{")
    if start == -1:
        return None
    end = text.rfind("}")
    if end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


async def investigate_alert(
    alert: Alert, session: AsyncSession, use_llm: bool = True
) -> dict[str, Any]:
    """Investigate one alert and return three explicable hypotheses.

    Args:
        alert: The alert ORM object (``analysis`` is NOT persisted here).
        session: Injected async database session.
        use_llm: Try the Groq LLM first (falls back to rules on failure).

    Returns:
        Dict matching ``InvestigationResult`` (without ``status``/timestamps).
    """
    evidence = await _build_alert_context(session, alert)

    hypotheses: list[dict[str, Any]] | None = None
    source = "rules"
    api_key = settings.groq_api_key or os.environ.get("GROQ_API_KEY", "")
    if use_llm and api_key:
        try:
            # Local import avoids a circular dependency with app.ai.agent.
            from app.ai.agent import query_groq

            context_text = json.dumps(evidence, ensure_ascii=False, default=str)
            system_prompt = (
                "Tu es WATTY, enquêteur énergétique de WATTWISE DZ. Tu réponds "
                "UNIQUEMENT avec un JSON valide, sans texte autour, au format :\n"
                "{\"hypotheses\": [\n"
                "  {\"cause\": \"...\", \"confidence\": 0-100, "
                "\"evidence\": [\"...\"], \"missing_data\": [\"...\"], "
                "\"recommended_action\": \"...\"}\n"
                "]}\n"
                "Donne exactement 3 hypothèses classées par confiance décroissante. "
                "Les hypothèses doivent expliquer l'alerte à partir des données "
                "fournies. Ne JAMAIS inventer de mesure absente : place les "
                "données inconnues dans 'missing_data'. Réponds en français.\n\n"
                f"Alerte :\n{alert.message}\n\nDonnées :\n{context_text}"
            )
            reply = await query_groq(
                [{"role": "system", "content": system_prompt}],
                api_key=api_key,
                max_tokens=1024,
            )
            parsed = _parse_llm_json(reply)
            if isinstance(parsed, dict):
                parsed = parsed.get("hypotheses")
            hypotheses = _validate_hypotheses(parsed)
            if hypotheses:
                source = "llm"
        except Exception as exc:  # pragma: no cover - network / key issues
            logger.warning("WATTY LLM investigation failed (%s); falling back to rules", exc)
            hypotheses = None

    if hypotheses is None:
        hypotheses = _deterministic_hypotheses(alert, evidence)

    top = hypotheses[0]
    summary = (
        f"Hypothèse principale ({top['confidence']} %) : {top['cause']} "
        f"Action recommandée : {top['recommended_action']}"
    )
    return {
        "alert_id": alert.id,
        "hypotheses": hypotheses,
        "summary": summary,
        "source": source,
        "evidence_context": evidence,
    }
