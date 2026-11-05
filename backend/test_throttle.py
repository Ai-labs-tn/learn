"""Throttle review regressions; PostgreSQL cases use only an opt-in local test DB."""
from concurrent.futures import ThreadPoolExecutor
import os
from types import SimpleNamespace
from urllib.parse import urlsplit
from uuid import uuid4

import anyio
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import delete, event, inspect, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.auth import throttle
from backend.database import make_engine, migrate
from backend.main import create_app
from backend.models import LoginAttempt
from backend.security import digest
from backend.settings import Settings
from backend.throttle_cleanup import cleanup_expired, cleanup_statement

# Negative test timestamps isolate cleanup fixtures from any other test's live buckets.
NOW = -1_000_000
WINDOW = 300


@pytest.fixture(params=["sqlite", "postgresql"])
def buckets(request, tmp_path):
    if request.param == "postgresql":
        url = os.getenv("TEST_POSTGRES_URL")
        if not url:
            pytest.skip("Disposable PostgreSQL not configured locally")
        parsed = urlsplit(url.replace("postgresql+psycopg://", "postgresql://"))
        assert parsed.hostname in {"localhost", "127.0.0.1"}, "Refusing a nonlocal test database"
        assert parsed.path == "/learn_acceptance", "Use the disposable acceptance database only"
    else:
        url = f"sqlite:///{tmp_path / 'throttle.db'}"
    config = Settings(environment="test", database_url=url, login_limit=3, login_window_seconds=WINDOW)
    engine = make_engine(url)
    migrate(engine)
    prefix = "review_" + uuid4().hex
    keys = set()

    def make_request(ip="one", username="admin"):
        ip = prefix + ip
        username = prefix + username
        keys.update((digest("ip:" + ip), digest("user:" + username)))
        return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=config)),
                               client=SimpleNamespace(host=ip)), username

    def attempt(ip="one", username="admin"):
        req, name = make_request(ip, username)
        with Session(engine) as db:
            try:
                throttle(req, db, name)
                return 200
            except HTTPException as error:
                assert error.status_code == 429
                return error.status_code

    def seed(suffix, timestamp):
        key = digest(prefix + suffix)
        keys.add(key)
        with Session(engine) as db, db.begin():
            db.add(LoginAttempt(key=key, count=1, window_start=timestamp))
        return key

    try:
        yield SimpleNamespace(engine=engine, config=config, request=make_request, attempt=attempt,
                              seed=seed, keys=keys)
    finally:
        with Session(engine) as db, db.begin():
            db.execute(delete(LoginAttempt).where(LoginAttempt.key.in_(keys)))
        engine.dispose()


def test_blocked_ip_does_not_create_username_buckets(buckets):
    for number in range(3):
        assert buckets.attempt(username=f"before_{number}") == 200
    for number in range(20):
        assert buckets.attempt(username=f"after_{number}") == 429
    req, _ = buckets.request()
    ip_key = digest("ip:" + req.client.host)
    with Session(buckets.engine) as db:
        rows = db.scalars(select(LoginAttempt).where(LoginAttempt.key.in_(buckets.keys))).all()
        assert len(rows) == 4  # One IP and only three accepted username buckets.
        assert db.get(LoginAttempt, ip_key).count == 23  # Commits precede every 429.


def test_username_limit_commits_both_counters(buckets):
    for number in range(3):
        assert buckets.attempt(ip=str(number)) == 200
    assert buckets.attempt(ip="blocked") == 429
    req, username = buckets.request(ip="blocked")
    with Session(buckets.engine) as db:
        assert db.get(LoginAttempt, digest("ip:" + req.client.host)).count == 1
        assert db.get(LoginAttempt, digest("user:" + username)).count == 4


def test_concurrent_ip_limit_bounds_username_growth(buckets):
    # Pre-register keys to avoid mutating the fixture's bookkeeping from worker threads.
    requests = [buckets.request(username=f"parallel_{number}") for number in range(12)]

    def attempt(pair):
        req, name = pair
        with Session(buckets.engine) as db:
            try:
                throttle(req, db, name)
                return 200
            except HTTPException as error:
                return error.status_code

    with ThreadPoolExecutor(max_workers=6) as pool:
        codes = list(pool.map(attempt, requests))
    assert codes.count(200) == 3 and codes.count(429) == 9
    with Session(buckets.engine) as db:
        assert len(db.scalars(select(LoginAttempt).where(LoginAttempt.key.in_(buckets.keys))).all()) == 4


def test_cleanup_is_bounded_indexed_and_preserves_current_rows(buckets):
    expired = [buckets.seed(f"old_{i}", NOW - WINDOW * 2 - 1 - i) for i in range(5)]
    boundary = buckets.seed("boundary", NOW - WINDOW * 2)
    current = buckets.seed("current", NOW)
    assert cleanup_expired(buckets.engine, WINDOW, now=NOW, batch_size=2) == 2
    assert cleanup_expired(buckets.engine, WINDOW, now=NOW, batch_size=2) == 2
    assert cleanup_expired(buckets.engine, WINDOW, now=NOW, batch_size=2) == 1
    assert cleanup_expired(buckets.engine, WINDOW, now=NOW, batch_size=2) == 0
    with Session(buckets.engine) as db:
        assert all(db.get(LoginAttempt, key) is None for key in expired)
        assert db.get(LoginAttempt, boundary) and db.get(LoginAttempt, current)
    indexes = inspect(buckets.engine).get_indexes("login_attempts")
    assert any(index["column_names"] == ["window_start", "key"] for index in indexes)
    if buckets.engine.dialect.name == "sqlite":
        sql = str(cleanup_statement("sqlite", NOW - WINDOW * 2, 2)
                  .compile(dialect=buckets.engine.dialect, compile_kwargs={"literal_binds": True}))
        with buckets.engine.connect() as connection:
            plan = connection.execute(text("EXPLAIN QUERY PLAN " + sql)).all()
        assert any("COVERING INDEX ix_login_attempts_window_start_key" in str(row) for row in plan)


def test_cleanup_rollback_and_retry(buckets):
    old = buckets.seed("rollback", NOW - WINDOW * 2 - 1)

    def fail_after_delete(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith("DELETE FROM login_attempts"):
            raise SQLAlchemyError("injected local-test maintenance failure")

    event.listen(buckets.engine, "after_cursor_execute", fail_after_delete)
    try:
        with pytest.raises(SQLAlchemyError):
            cleanup_expired(buckets.engine, WINDOW, now=NOW)
    finally:
        event.remove(buckets.engine, "after_cursor_execute", fail_after_delete)
    with Session(buckets.engine) as db:
        assert db.get(LoginAttempt, old) is not None
    assert cleanup_expired(buckets.engine, WINDOW, now=NOW) == 1


def test_cleanup_and_logins_run_concurrently(buckets):
    old = [buckets.seed(f"concurrent_{i}", NOW - WINDOW * 2 - 1) for i in range(24)]
    requests = [buckets.request(username=f"name_{i}") for i in range(12)]

    def work(index):
        if index < 12:
            req, name = requests[index]
            with Session(buckets.engine) as db:
                try:
                    throttle(req, db, name)
                    return "allowed"
                except HTTPException as error:
                    assert error.status_code == 429
                    return "blocked"
        return cleanup_expired(buckets.engine, WINDOW, now=NOW, batch_size=3)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(work, i) for i in range(24)]
        results = [future.result(timeout=15) for future in futures]
    assert results[:12].count("allowed") == 3
    assert results[:12].count("blocked") == 9
    assert sum(results[12:]) == 24
    with Session(buckets.engine) as db:
        assert all(db.get(LoginAttempt, key) is None for key in old)
        assert len(db.scalars(select(LoginAttempt).where(LoginAttempt.key.in_(buckets.keys))).all()) == 4


def test_postgresql_cleanup_skips_locked_rows(buckets):
    if buckets.engine.dialect.name != "postgresql":
        pytest.skip("Row-lock semantics apply only to PostgreSQL")
    locked = buckets.seed("locked", NOW - WINDOW * 2 - 2)
    unlocked = buckets.seed("unlocked", NOW - WINDOW * 2 - 1)
    with ThreadPoolExecutor(max_workers=1) as pool:
        with Session(buckets.engine) as locker:
            locker.execute(select(LoginAttempt).where(LoginAttempt.key == locked).with_for_update()).all()
            try:
                future = pool.submit(cleanup_expired, buckets.engine, WINDOW, NOW, 1)
                assert future.result(timeout=5) == 1  # Cannot wait on the held oldest row.
            finally:
                locker.rollback()
    with Session(buckets.engine) as db:
        assert db.get(LoginAttempt, locked) is not None
        assert db.get(LoginAttempt, unlocked) is None
    assert cleanup_expired(buckets.engine, WINDOW, now=NOW, batch_size=1) == 1


@pytest.mark.parametrize("username", ["admin\x00", "\x00", "admin\n", "admin\r", "admin\t", "a\x1fb",
                                      "admin\x7f", " admin", "admin ", "ADMIN", "admín", "admin/guest",
                                      "admin@local", "admin.guest", "a\u2028b", "", "a" * 65])
def test_malformed_username_never_reaches_database(tmp_path, monkeypatch, username):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "local-review-admin-password")
    monkeypatch.setenv("GUEST_PASSWORD", "local-review-guest-password")
    config = Settings(environment="test", database_url=f"sqlite:///{tmp_path / 'http.db'}")
    with TestClient(create_app(config)) as client:
        statements = []

        def capture(connection, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        event.listen(client.app.state.engine, "before_cursor_execute", capture)
        try:
            response = client.post("/api/auth/login", json={"username": username, "password": "wrong"},
                                   headers={"Origin": config.app_origin})
            assert response.status_code == 422
            assert statements == []  # Not even a throttle/database statement.
        finally:
            event.remove(client.app.state.engine, "before_cursor_execute", capture)


def test_cleanup_sql_has_bounded_skip_locked_selection():
    from sqlalchemy.dialects import postgresql, sqlite
    pg_sql = str(cleanup_statement("postgresql", 100, 7).compile(dialect=postgresql.dialect(),
                 compile_kwargs={"literal_binds": True}))
    sqlite_sql = str(cleanup_statement("sqlite", 100, 7).compile(dialect=sqlite.dialect(),
                     compile_kwargs={"literal_binds": True}))
    assert "LIMIT 7" in pg_sql and "FOR UPDATE SKIP LOCKED" in pg_sql
    assert "window_start < 100" in pg_sql
    assert "LIMIT 7" in sqlite_sql and "FOR UPDATE" not in sqlite_sql
    with pytest.raises(ValueError):
        cleanup_statement("sqlite", 100, 0)


def test_cleanup_runs_on_interval_and_retries_safely(monkeypatch, caplog):
    from backend import throttle_cleanup
    calls = []

    class StopMaintenance(Exception):
        pass

    async def fake_sleep(seconds):
        assert seconds == throttle_cleanup.CLEANUP_INTERVAL_SECONDS
        calls.append("sleep")
        if calls.count("sleep") == 3:
            raise StopMaintenance

    def fake_cleanup(engine, window_seconds):
        calls.append("cleanup")
        if calls.count("cleanup") == 1:
            raise SQLAlchemyError("private-driver-detail-must-not-be-logged")
        return 1

    monkeypatch.setattr(throttle_cleanup.anyio, "sleep", fake_sleep)
    monkeypatch.setattr(throttle_cleanup, "cleanup_expired", fake_cleanup)
    with pytest.raises(StopMaintenance):
        anyio.run(throttle_cleanup.run_cleanup, object(), WINDOW)
    assert calls == ["sleep", "cleanup", "sleep", "cleanup", "sleep"]
    assert "will retry" in caplog.text
    assert "private-driver-detail" not in caplog.text


def test_additive_migration_preserves_old_buckets(tmp_path):
    from alembic import command
    from alembic.config import Config
    from pathlib import Path
    engine = make_engine(f"sqlite:///{tmp_path / 'upgrade.db'}")
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "0001_auth")
        with Session(engine) as db, db.begin():
            db.add(LoginAttempt(key="local-test-old-bucket", count=9, window_start=123))
        migrate(engine)
        migrate(engine)
        with Session(engine) as db:
            assert db.get(LoginAttempt, "local-test-old-bucket").count == 9
        assert any(index["column_names"] == ["window_start", "key"]
                   for index in inspect(engine).get_indexes("login_attempts"))
    finally:
        engine.dispose()
