"""Action Center — six-stage workflow and WATTY investigation (V3).

Workflow: DETECTED -> ANALYSED -> PROPOSED -> APPROVED -> EXECUTED -> VERIFIED.

Each transition is sequential: attempting to skip or go backwards returns 409.
``POST /api/alerts/{id}/verify`` records the verified savings in the
``savings`` table (DZD conversion uses the configured flat tariff).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.investigator import investigate_alert
from app.config import settings
from app.database import get_session
from app.models import Alert, Equipment, Saving, Zone
from app.schemas import (
    ActionCreateRequest,
    ActionProposeRequest,
    ActionTransitionResponse,
    AlertRead,
    InvestigationResult,
    InvestigateRequest,
    WORKFLOW_STAGES,
    WORKFLOW_STAGE_LABELS,
    WorkflowResponse,
    WorkflowStageCount,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["actions"])


def _stage_index(stage: str | None) -> int:
    """Index of a stage in the canonical workflow order."""
    return WORKFLOW_STAGES.index(stage) if stage in WORKFLOW_STAGES else 0


def _label(stage: str) -> str:
    """French label of a stage."""
    return WORKFLOW_STAGE_LABELS.get(stage, stage)


async def _load_alert(session: AsyncSession, alert_id: int) -> Alert:
    """Fetch one alert or raise 404."""
    alert = await session.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


def _check_transition(alert: Alert, expected_stage: str) -> None:
    """Raise 409 unless the alert sits exactly at ``expected_stage``."""
    if alert.stage != expected_stage:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Transition impossible : l'alerte est à l'étape "
                f"« {_label(alert.stage)} » (attendu : « {_label(expected_stage)} »)."
            ),
        )


async def _load_equipment_for_alert(
    session: AsyncSession, alert: Alert
) -> Equipment | None:
    """Equipment linked to an alert (may be absent for legacy MQTT alerts)."""
    if alert.equipment_id is None:
        return None
    return (await session.scalars(
        select(Equipment).where(Equipment.id == alert.equipment_id)
    )).first()


# ---------------------------------------------------------------------------
# WATTY investigation (Étape 5)
# ---------------------------------------------------------------------------


@router.post("/watty/investigate", response_model=InvestigationResult)
async def investigate(
    payload: InvestigateRequest,
    session: AsyncSession = Depends(get_session),
) -> InvestigationResult:
    """Run a WATTY investigation on one alert (no state change).

    Returns three hypotheses with confidence, evidence, missing data and a
    recommended action each. Falls back to deterministic rules when the Groq
    API is unavailable.

    Raises:
        HTTPException: 404 when the alert does not exist.
    """
    alert = await _load_alert(session, payload.alert_id)
    result = await investigate_alert(alert, session)
    return InvestigationResult(
        alert_id=alert.id,
        hypotheses=result["hypotheses"],
        summary=result["summary"],
        source=result["source"],
        generated_at=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# Six-stage workflow (Étape 4)
# ---------------------------------------------------------------------------


@router.get("/actions/workflow", response_model=WorkflowResponse)
async def action_workflow(
    session: AsyncSession = Depends(get_session),
) -> WorkflowResponse:
    """Count active (unresolved) alerts at each workflow stage."""
    rows = (
        await session.execute(
            select(Alert.stage, func.count(Alert.id))
            .where(Alert.resolved.is_(False))
            .group_by(Alert.stage)
        )
    ).all()
    counts = {stage: 0 for stage in WORKFLOW_STAGES}
    for stage, count in rows:
        counts[stage if stage in counts else "DETECTED"] = int(count)
    stages = [
        WorkflowStageCount(stage=stage, label=_label(stage), count=counts[stage])
        for stage in WORKFLOW_STAGES
    ]
    return WorkflowResponse(stages=stages, total_active=sum(counts.values()))


@router.post("/actions", response_model=AlertRead)
async def create_action(
    payload: ActionCreateRequest,
    session: AsyncSession = Depends(get_session),
) -> Alert:
    """Create a new action (alert) bound to an equipment.

    Used by the building plan ("Créer une action") and the demo mode.

    Raises:
        HTTPException: 404 when the equipment does not exist.
    """
    equipment = (await session.scalars(
        select(Equipment).where(Equipment.id == payload.equipment_id)
    )).first()
    if equipment is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    zone = (await session.scalars(
        select(Zone).where(Zone.id == equipment.zone_id)
    )).first()

    message = payload.message or (
        f"{equipment.name} : intervention requise "
        f"(santé {equipment.health_score}/100, "
        f"puissance {equipment.current_power_kw:.1f} kW)."
    )
    alert = Alert(
        device_id=(zone.device_id if zone else None) or f"EQ{equipment.id}",
        timestamp=datetime.now(timezone.utc),
        type=payload.type,
        severity=payload.severity,
        message=message,
        confidence=0.85,
        stage="DETECTED",
        equipment_id=equipment.id,
    )
    session.add(alert)
    await session.commit()
    await session.refresh(alert)
    return alert


@router.post("/alerts/{alert_id}/analyze", response_model=ActionTransitionResponse)
async def analyze_alert(
    alert_id: int,
    session: AsyncSession = Depends(get_session),
) -> ActionTransitionResponse:
    """DETECTED -> ANALYSED: run (and persist) the WATTY investigation."""
    alert = await _load_alert(session, alert_id)
    _check_transition(alert, "DETECTED")

    result = await investigate_alert(alert, session)
    alert.analysis = json.dumps(
        {
            "hypotheses": result["hypotheses"],
            "summary": result["summary"],
            "source": result["source"],
            "evidence_context": result["evidence_context"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        ensure_ascii=False,
    )
    alert.stage = "ANALYSED"
    alert.analyzed_at = datetime.now(timezone.utc)
    await session.commit()

    return ActionTransitionResponse(
        alert_id=alert.id,
        stage=alert.stage,
        stage_label=_label(alert.stage),
        message=result["summary"] or "Analyse WATTY terminée.",
    )


@router.post("/alerts/{alert_id}/propose", response_model=ActionTransitionResponse)
async def propose_alert(
    alert_id: int,
    payload: ActionProposeRequest | None = None,
    session: AsyncSession = Depends(get_session),
) -> ActionTransitionResponse:
    """ANALYSED -> PROPOSED: store the proposed action (and its estimate)."""
    alert = await _load_alert(session, alert_id)
    _check_transition(alert, "ANALYSED")

    if payload is None or not payload.proposed_action:
        payload = ActionProposeRequest(
            proposed_action=(
                "Appliquer l'action recommandée par WATTY puis vérifier la consommation."
            ),
        )

    alert.proposed_action = payload.proposed_action
    if payload.estimated_savings_kwh is not None:
        alert.estimated_savings_kwh = payload.estimated_savings_kwh
    alert.stage = "PROPOSED"
    alert.proposed_at = datetime.now(timezone.utc)
    await session.commit()

    return ActionTransitionResponse(
        alert_id=alert.id,
        stage=alert.stage,
        stage_label=_label(alert.stage),
        message=f"Action proposée : {alert.proposed_action}",
    )


@router.post("/alerts/{alert_id}/approve", response_model=ActionTransitionResponse)
async def approve_alert(
    alert_id: int,
    session: AsyncSession = Depends(get_session),
) -> ActionTransitionResponse:
    """PROPOSED -> APPROVED: manager approval, prepares the savings record."""
    alert = await _load_alert(session, alert_id)
    _check_transition(alert, "PROPOSED")

    alert.stage = "APPROVED"
    alert.approved_at = datetime.now(timezone.utc)
    await session.commit()

    return ActionTransitionResponse(
        alert_id=alert.id,
        stage=alert.stage,
        stage_label=_label(alert.stage),
        message="Action approuvée, prête à être exécutée.",
    )


def _computed_savings(alert: Alert, equipment: Equipment | None) -> tuple[float, float]:
    """Deterministic (baseline_kwh, saved_kwh) for the verification step."""
    if equipment is not None:
        daily_baseline_kwh = 24.0 * float(max(equipment.nominal_power_kw, equipment.current_power_kw))
        if alert.estimated_savings_kwh is not None:
            saved_kwh = float(alert.estimated_savings_kwh)
        else:
            saved_kwh = 24.0 * max(0.0, float(equipment.current_power_kw) - float(equipment.nominal_power_kw))
    else:
        daily_baseline_kwh = 24.0 * float(alert.estimated_savings_kwh or 1.0)
        saved_kwh = float(alert.estimated_savings_kwh or 0.0)
    return round(daily_baseline_kwh, 2), round(max(0.0, saved_kwh), 2)


@router.post("/alerts/{alert_id}/execute", response_model=ActionTransitionResponse)
async def execute_alert(
    alert_id: int,
    session: AsyncSession = Depends(get_session),
) -> ActionTransitionResponse:
    """APPROVED -> EXECUTED: apply the action to the equipment.

    Executing restores the linked equipment to a healthy online state so the
    next measurement confirms the fix (demo-friendly deterministic behaviour).
    """
    alert = await _load_alert(session, alert_id)
    _check_transition(alert, "APPROVED")

    equipment = await _load_equipment_for_alert(session, alert)
    equipment_name = None
    if equipment is not None:
        equipment.status = "online"
        equipment.health_score = min(100, max(int(equipment.health_score), 80))
        equipment.current_power_kw = float(equipment.nominal_power_kw)
        equipment_name = equipment.name

    alert.stage = "EXECUTED"
    alert.executed_at = datetime.now(timezone.utc)
    await session.commit()

    message = (
        f"Action exécutée sur {equipment_name} (statut ramené à « online »)."
        if equipment_name
        else "Action exécutée."
    )
    return ActionTransitionResponse(
        alert_id=alert.id,
        stage=alert.stage,
        stage_label=_label(alert.stage),
        message=message,
    )


@router.post("/alerts/{alert_id}/verify", response_model=ActionTransitionResponse)
async def verify_alert(
    alert_id: int,
    session: AsyncSession = Depends(get_session),
) -> ActionTransitionResponse:
    """EXECUTED -> VERIFIED: compute and persist the verified savings."""
    alert = await _load_alert(session, alert_id)
    _check_transition(alert, "EXECUTED")

    equipment = await _load_equipment_for_alert(session, alert)
    baseline_kwh, saved_kwh = _computed_savings(alert, equipment)
    actual_kwh = round(max(0.0, baseline_kwh - saved_kwh), 2)
    saved_percent = round((saved_kwh / baseline_kwh * 100.0) if baseline_kwh > 0 else 0.0, 2)

    saving = Saving(
        alert_id=alert.id,
        device_id=alert.device_id,
        timestamp=datetime.now(timezone.utc),
        action_applied=alert.proposed_action or "Action vérifiée",
        baseline_kwh=baseline_kwh,
        actual_kwh=actual_kwh,
        saved_kwh=saved_kwh,
        saved_percent=saved_percent,
        confidence=0.9,
    )
    session.add(saving)

    alert.stage = "VERIFIED"
    alert.verified_at = datetime.now(timezone.utc)
    await session.commit()

    saved_dzd = round(saved_kwh * settings.dzd_per_kwh, 2)
    return ActionTransitionResponse(
        alert_id=alert.id,
        stage=alert.stage,
        stage_label=_label(alert.stage),
        message=(
            f"Économie vérifiée : {saved_kwh:.1f} kWh/jour "
            f"({saved_dzd:.0f} DZD/jour au tarif {settings.dzd_per_kwh} DZD/kWh)."
        ),
        saved_kwh=saved_kwh,
        saved_dzd=saved_dzd,
    )
