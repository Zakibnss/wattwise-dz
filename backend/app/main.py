"""FastAPI application entry point and lifespan management."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from fastapi.middleware.cors import CORSMiddleware

from fastapi import FastAPI

from app.config import get_settings, setup_logging
from app.database import close_db, init_db
from app.mqtt_client import MQTTIngestor
from app.routes import (
    actions,
    ai,
    buildings,
    chat,
    demo,
    health,
    intelligence,
    readings,
    reports,
    savings,
    solar,
    stats,
    system,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialise database and MQTT resources, then release them on exit."""
    setup_logging(get_settings().log_level)

    await init_db()

    ingestor = MQTTIngestor()
    ingestor.start(asyncio.get_running_loop())
    app.state.mqtt = ingestor

    logger.info("WATTWISE DZ backend started")
    try:
        yield
    finally:
        ingestor.stop()
        app.state.mqtt = None
        await close_db()
        logger.info("WATTWISE DZ backend stopped")


app = FastAPI(
    title="WATTWISE DZ API",
    description=(
        "Energy Intelligence Platform for Algerian buildings — V3: "
        "building hierarchy, six-stage action workflow, WATTY investigator, "
        "Energy Brain and jury demo mode."
    ),
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",   # Vite dev server
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(readings.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(savings.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(solar.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(buildings.router, prefix="/api")
app.include_router(actions.router, prefix="/api")
app.include_router(intelligence.router, prefix="/api")
app.include_router(demo.router, prefix="/api")
