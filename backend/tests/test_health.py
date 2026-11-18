"""Health endpoint tests."""

from __future__ import annotations

from httpx import AsyncClient


async def test_health_returns_ok(client: AsyncClient) -> None:
    """GET /api/health must report an operational application and database."""
    response = await client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    # MQTT is not started in tests (no lifespan), so either state is valid here.
    assert body["mqtt"] in {"ok", "error"}
