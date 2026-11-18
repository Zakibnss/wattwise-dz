"""One-off CLI script to delete "test" alerts from the database.

Usage:
    docker compose exec backend python -m scripts.cleanup_test_alerts

Deletes all alerts whose ``message`` contains the word "test" (case-insensitive),
which is useful for cleaning up the database before a jury demo.
"""

from __future__ import annotations

import asyncio
import logging
from sqlalchemy import delete, func

from app.database import SessionLocal
from app.models import Alert

logger = logging.getLogger(__name__)


async def cleanup_test_alerts() -> int:
    """Delete alerts where message contains "test" (case-insensitive).

    Returns:
        The number of deleted alerts.
    """
    async with SessionLocal() as session:
        stmt = delete(Alert).where(
            func.lower(Alert.message).like("%test%")
        )
        result = await session.execute(stmt)
        await session.commit()
        deleted = result.rowcount or 0
        logger.info("Deleted %d test alert(s)", deleted)
        return deleted


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    deleted = asyncio.run(cleanup_test_alerts())
    print(f"Cleanup complete: {deleted} test alert(s) deleted.")


if __name__ == "__main__":
    main()
