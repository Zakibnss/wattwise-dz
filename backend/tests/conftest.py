"""Shared pytest fixtures: dedicated test database, schema and API client."""

from __future__ import annotations

import os

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://wattwise:wattwise_dev@localhost:5433/wattwise_test",
)

from collections.abc import AsyncGenerator  # noqa: E402

import asyncpg  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

TEST_DATABASE_URL = os.environ["DATABASE_URL"]


async def _ensure_test_database() -> None:
    """Create the test database if it does not exist yet."""
    url = make_url(TEST_DATABASE_URL)
    connection = await asyncpg.connect(
        host=url.host,
        port=url.port or 5432,
        user=url.username,
        password=url.password,
        database="postgres",
    )
    try:
        exists = await connection.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", url.database
        )
        if not exists:
            await connection.execute(f'CREATE DATABASE "{url.database}"')
    finally:
        await connection.close()

    # Reset the public schema so ``create_all`` reflects the CURRENT models.
    # A stale schema from an older model version would otherwise linger and
    # miss newly added columns (e.g. alerts.stage in V3).
    connection = await asyncpg.connect(
        host=url.host,
        port=url.port or 5432,
        user=url.username,
        password=url.password,
        database=url.database,
    )
    try:
        await connection.execute("DROP SCHEMA IF EXISTS public CASCADE")
        await connection.execute("CREATE SCHEMA public")
    finally:
        await connection.close()


@pytest_asyncio.fixture(autouse=True)
async def prepared_database() -> AsyncGenerator[None, None]:
    """Create tables before each test and clean up afterwards.

    The engine is disposed after every test because pytest-asyncio uses a
    fresh event loop per test; pooled asyncpg connections cannot be shared
    across loops.
    """
    await _ensure_test_database()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    try:
        yield
    finally:
        try:
            async with engine.begin() as connection:
                await connection.execute(
                    text(
                        "TRUNCATE TABLE savings, alerts, readings, model_runs, solar_production, system_settings, "
                        "pv_readings, pv_faults "
                        "RESTART IDENTITY CASCADE"
                    )
                )
        finally:
            await engine.dispose()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """HTTP client bound to the FastAPI app (lifespan is intentionally off)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client
