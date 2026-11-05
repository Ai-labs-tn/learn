from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from fastapi import Request


def make_engine(url):
    parsed = make_url(url)
    if parsed.drivername == "sqlite" and parsed.database not in {None, ":memory:"}:
        Path(parsed.database).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30} if parsed.drivername == "sqlite" else {}, pool_pre_ping=True)
    if parsed.drivername == "sqlite":
        @event.listens_for(engine, "connect")
        def sqlite_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
    return engine


def migrate(engine):
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    with engine.begin() as connection:
        # Serialize migrations/bootstrap across PostgreSQL workers on startup.
        if engine.dialect.name == "postgresql":
            connection.exec_driver_sql("SELECT pg_advisory_xact_lock(714202601)")
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def get_db(request: Request):
    with request.app.state.sessions() as session:
        yield session
