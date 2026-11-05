"""Run `python -m backend.bootstrap` from the repository root."""
import argparse
import os
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.database import make_engine, migrate
from backend.models import User
from backend.security import hash_password
from backend.settings import Settings


def bootstrap(engine):
    with Session(engine) as db, db.begin():
        if engine.dialect.name == "postgresql":
            db.connection().exec_driver_sql("SELECT pg_advisory_xact_lock(714202602)")
        existing = set(db.scalars(select(User.username)).all())
        pending = []
        for username, variable in (("admin", "BOOTSTRAP_ADMIN_PASSWORD"), ("guest", "GUEST_PASSWORD")):
            if username in existing:
                continue  # Never reset an existing password on startup.
            password = os.getenv(variable, "")
            if not 12 <= len(password) <= 256 or password.strip() != password:
                raise ValueError(f"{variable} must privately supply 12–256 characters for initial bootstrap")
            pending.append(User(username=username, role=username, password_hash=hash_password(password)))
        db.add_all(pending)


def main():
    parser = argparse.ArgumentParser(description="Apply migrations and provision missing initial accounts")
    parser.add_argument("--migrate-only", action="store_true")
    args = parser.parse_args()
    engine = make_engine(Settings.from_env().database_url)
    try:
        migrate(engine)
        if not args.migrate_only:
            bootstrap(engine)
    finally:
        engine.dispose()
    print("Database initialization complete (no existing passwords changed).")


if __name__ == "__main__":
    main()
