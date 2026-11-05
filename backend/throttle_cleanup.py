"""Bounded, independently committed maintenance of expired throttle buckets."""
import logging
import time

import anyio
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from backend.models import LoginAttempt

logger = logging.getLogger(__name__)
CLEANUP_BATCH_SIZE = 128
CLEANUP_INTERVAL_SECONDS = 60


def cleanup_statement(dialect_name: str, cutoff: int, batch_size: int = CLEANUP_BATCH_SIZE):
    if batch_size < 1:
        raise ValueError("Cleanup batch size must be positive")
    expired = (select(LoginAttempt.key)
               .where(LoginAttempt.window_start < cutoff)
               .order_by(LoginAttempt.window_start, LoginAttempt.key)
               .limit(batch_size))
    if dialect_name == "postgresql":
        # Lock only selected old buckets, never wait for busy login rows or other
        # cleanup workers. Held until the surrounding independent transaction ends.
        expired = expired.with_for_update(skip_locked=True)
    elif dialect_name != "sqlite":
        raise ValueError("Unsupported database dialect")
    # Repeat the cutoff on DELETE to guard against a row being refreshed before
    # deletion. SQLite uses a single DELETE statement and serializes writers.
    return (delete(LoginAttempt)
            .where(LoginAttempt.key.in_(expired), LoginAttempt.window_start < cutoff)
            .execution_options(synchronize_session=False))


def cleanup_expired(engine, window_seconds: int, now: int | None = None, batch_size: int = CLEANUP_BATCH_SIZE) -> int:
    cutoff = (int(time.time()) if now is None else now) - window_seconds * 2
    with Session(engine) as db, db.begin():
        result = db.execute(cleanup_statement(engine.dialect.name, cutoff, batch_size))
        return result.rowcount


async def run_cleanup(engine, window_seconds: int):
    """Perform one indexed bounded batch per interval, without blocking the event loop."""
    while True:
        await anyio.sleep(CLEANUP_INTERVAL_SECONDS)
        try:
            # AnyIO shields an in-flight worker until its transaction finishes;
            # shutdown waits for it before disposing the application's engine.
            await anyio.to_thread.run_sync(cleanup_expired, engine, window_seconds)
        except SQLAlchemyError:
            # Maintenance failure must not bypass throttling or terminate the service.
            # Avoid logging SQL/parameters, which may contain operational details.
            logger.warning("Throttle cleanup failed; will retry on the next interval")
