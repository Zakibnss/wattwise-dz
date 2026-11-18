"""Alembic 0002 reversibility test on a throw-away PostgreSQL database."""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from pathlib import Path

import asyncpg
from sqlalchemy.engine import make_url

BACKEND_ROOT = Path(__file__).resolve().parents[1]


async def _connect(url, database: str):
    """Open an asyncpg connection to the given database on the test server."""
    return await asyncpg.connect(
        host=url.host,
        port=url.port or 5432,
        user=url.username,
        password=url.password,
        database=database,
    )


async def _table_exists(url, database: str, table: str) -> bool:
    """Return whether ``table`` exists in the public schema."""
    connection = await _connect(url, database)
    try:
        value = await connection.fetchval(
            "SELECT to_regclass($1)", f"public.{table}"
        )
    finally:
        await connection.close()
    return value is not None


async def test_migration_0002_upgrade_and_downgrade_are_reversible() -> None:
    """Upgrade creates model_runs; downgrade drops it; upgrade re-creates it."""
    url = make_url(os.environ["DATABASE_URL"])
    database_name = f"wattwise_migration_{uuid.uuid4().hex[:8]}"

    admin = await _connect(url, "postgres")
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
    finally:
        await admin.close()

    temporary_url = url.set(database=database_name)
    environment = {
        **os.environ,
        "DATABASE_URL": temporary_url.render_as_string(hide_password=False),
    }

    def alembic(*arguments: str) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", *arguments],
            cwd=BACKEND_ROOT,
            env=environment,
            capture_output=True,
            text=True,
            timeout=300,
        )
        assert result.returncode == 0, (
            f"alembic {' '.join(arguments)} failed:\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )

    try:
        alembic("upgrade", "head")
        assert await _table_exists(url, database_name, "model_runs")

        alembic("downgrade", "0001_initial_schema")
        assert not await _table_exists(url, database_name, "model_runs")

        alembic("upgrade", "head")
        assert await _table_exists(url, database_name, "model_runs")
    finally:
        admin = await _connect(url, "postgres")
        try:
            await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}" WITH (FORCE)')
        finally:
            await admin.close()
