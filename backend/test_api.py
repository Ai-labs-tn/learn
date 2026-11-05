"""Local-only, temporary-database acceptance tests. No deployment credentials."""
from dataclasses import replace
import os
from pathlib import Path
import subprocess
import sys
import time

import pytest
from fastapi import Depends
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from backend.auth import admin_only
from backend.bootstrap import bootstrap
from backend.main import create_app
from backend.models import AuthSession, LoginAttempt, User
from backend.security import digest, verify_password
from backend.settings import Settings

# Deliberately public, test-only values, used exclusively with tmp_path SQLite.
LOCAL_ADMIN = "local-test-admin-password"
LOCAL_GUEST = "local-test-guest-password"
ORIGIN = "http://localhost:5173"


@pytest.fixture
def settings(tmp_path, monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", LOCAL_ADMIN)
    monkeypatch.setenv("GUEST_PASSWORD", LOCAL_GUEST)
    return Settings(environment="test", database_url=f"sqlite:///{tmp_path / 'test.db'}", dist_dir=tmp_path / "dist")


@pytest.fixture
def client(settings):
    app = create_app(settings)

    def mutation(user=Depends(admin_only)):
        return {"success": True}

    # Test-only mutation proving the reusable admin dependency secures future writes.
    app.router.routes.insert(0, APIRoute("/api/studio/test-write", mutation, methods=["POST"]))
    with TestClient(app) as value:
        yield value


def login(client, username="admin", password=LOCAL_ADMIN, **kwargs):
    return client.post("/api/auth/login", json={"username": username, "password": password},
                       headers={"Origin": ORIGIN, **kwargs})


def test_health_public_and_no_cache(client):
    response = client.get("/api/health")
    assert response.status_code == 200 and response.json()["ok"] is True
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("path", ["auth/me", "studio/status", "simulator-engine", "boot-os-simulator",
                                  "jvm-runtime-visualizer", "bytecode-stepper", "dsa-visualizer",
                                  "code-editor", "lesson-tracks", "progress-tracking"])
def test_anonymous_api_denied(client, path):
    assert client.get("/api/" + path).status_code == 401


@pytest.mark.parametrize("username,password,studio", [("admin", LOCAL_ADMIN, 200), ("guest", LOCAL_GUEST, 403)])
def test_roles_cookie_refresh_and_gated_reads(client, username, password, studio):
    response = login(client, username, password)
    assert response.status_code == 200
    assert response.json()["user"] == {"username": username, "role": username}
    assert len(response.json()["csrfToken"]) >= 40
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/" in cookie
    assert "Secure" not in cookie
    assert "accessToken" not in response.json()
    assert client.get("/api/auth/me").json() == response.json()
    assert client.get("/api/studio/status").status_code == studio
    assert client.get("/api/lesson-tracks").status_code == 200


def test_digest_only_storage_and_password_hashes(client):
    login(client)
    raw = client.cookies.get("learn_session")
    with client.app.state.sessions() as db:
        record = db.scalar(select(AuthSession))
        assert record.token_digest == digest(raw) and record.token_digest != raw
        for user in db.scalars(select(User)):
            password = LOCAL_ADMIN if user.role == "admin" else LOCAL_GUEST
            assert user.password_hash.startswith("scrypt$") and password not in user.password_hash
            assert verify_password(password, user.password_hash)
            assert not verify_password("wrong-password", user.password_hash)


@pytest.mark.parametrize("username,password", [("admin", "bad-password"), ("unknown", LOCAL_ADMIN), ("guest", LOCAL_ADMIN)])
def test_generic_invalid_credentials(client, username, password):
    response = login(client, username, password)
    assert response.status_code == 401 and response.json() == {"detail": "Invalid credentials"}
    assert not client.cookies


@pytest.mark.parametrize("headers", [{}, {"Origin": "https://evil.example"}, {"Origin": "null"},
                                     {"Origin": ORIGIN, "Sec-Fetch-Site": "cross-site"}])
def test_login_origin_required(client, headers):
    response = client.post("/api/auth/login", json={"username": "admin", "password": LOCAL_ADMIN}, headers=headers)
    assert response.status_code == 403
    with client.app.state.sessions() as db:
        assert db.scalar(select(AuthSession)) is None


def test_login_role_injection_rejected(client):
    assert client.post("/api/auth/login", json={"username": "guest", "password": LOCAL_GUEST, "role": "admin"},
                       headers={"Origin": ORIGIN}).status_code == 422


def test_logout_csrf_and_invalidation(client):
    token = login(client).json()["csrfToken"]
    old_cookie = client.cookies.get("learn_session")
    for headers in ({"Origin": ORIGIN}, {"X-CSRF-Token": token},
                    {"Origin": ORIGIN, "X-CSRF-Token": "wrong"},
                    {"Origin": ORIGIN, "X-CSRF-Token": b"\xc3\xa9"},
                    {"Origin": "https://evil.example", "X-CSRF-Token": token}):
        assert client.post("/api/auth/logout", headers=headers).status_code == 403
        assert client.get("/api/auth/me").status_code == 200
    response = client.post("/api/auth/logout", headers={"Origin": ORIGIN, "X-CSRF-Token": token})
    assert response.status_code == 200 and response.json() == {"success": True}
    assert not client.cookies
    assert client.get("/api/auth/me").status_code == 401
    client.cookies.set("learn_session", old_cookie)
    assert client.get("/api/auth/me").status_code == 401


def test_admin_mutation_dependency(client):
    token = login(client).json()["csrfToken"]
    assert client.post("/api/studio/test-write", headers={"Origin": ORIGIN}).status_code == 403
    assert client.post("/api/studio/test-write", headers={"Origin": ORIGIN, "X-CSRF-Token": token}).status_code == 200
    token = login(client, "guest", LOCAL_GUEST).json()["csrfToken"]
    assert client.post("/api/studio/test-write", headers={"Origin": ORIGIN, "X-CSRF-Token": token}).status_code == 403


def test_session_rotation_and_csrf_binding(client):
    first = login(client).json()["csrfToken"]
    old = client.cookies.get("learn_session")
    second = login(client).json()["csrfToken"]
    assert first != second and old != client.cookies.get("learn_session")
    assert client.post("/api/auth/logout", headers={"Origin": ORIGIN, "X-CSRF-Token": first}).status_code == 403
    with client.app.state.sessions() as db:
        assert db.get(AuthSession, digest(old)) is None


def test_expiry(client):
    login(client)
    with client.app.state.sessions() as db:
        db.execute(update(AuthSession).values(expires_at=int(time.time()) - 1))
        db.commit()
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/studio/status").status_code == 401
    assert client.post("/api/auth/logout", headers={"Origin": ORIGIN, "X-CSRF-Token": "anything"}).status_code == 401


def test_forged_and_legacy_tokens(client):
    for cookie in ("demo-token-admin", "random-forged-token", "x" * 129):
        client.cookies.set("learn_session", cookie)
        assert client.get("/api/auth/me").status_code == 401
    client.cookies.clear()
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer demo-token-admin"}).status_code == 401


@pytest.mark.parametrize("path", ["otp/request", "otp/verify", "password/forgot", "password/reset"])
def test_legacy_flows_disabled(client, path):
    response = client.post("/api/auth/" + path, json={"identifier": "admin", "code": "000000"})
    assert response.status_code == 404 and "devCode" not in response.text


def test_throttle_persistent_and_window_resets(settings):
    settings = replace(settings, login_limit=2)
    with TestClient(create_app(settings)) as first:
        assert login(first, password="wrong").status_code == 401
        assert login(first, username="unknown", password="wrong").status_code == 401
    with TestClient(create_app(settings)) as second:
        blocked = login(second)
        assert blocked.status_code == 429 and int(blocked.headers["Retry-After"]) > 0
        with second.app.state.sessions() as db:
            db.execute(update(LoginAttempt).values(window_start=int(time.time()) - 301))
            db.commit()
        assert login(second).status_code == 200


def test_session_and_accounts_persist_restart(settings, monkeypatch):
    with TestClient(create_app(settings)) as first:
        body = login(first).json()
        cookie = first.cookies.get("learn_session")
        with first.app.state.sessions() as db:
            original = db.scalar(select(User.password_hash).where(User.username == "admin"))
    monkeypatch.delenv("BOOTSTRAP_ADMIN_PASSWORD")
    monkeypatch.delenv("GUEST_PASSWORD")
    with TestClient(create_app(settings)) as second:
        second.cookies.set("learn_session", cookie)
        assert second.get("/api/auth/me").json() == body
        with second.app.state.sessions() as db:
            assert db.scalar(select(User.password_hash).where(User.username == "admin")) == original
        assert login(second).status_code == 200


def test_bootstrap_missing_secret_atomic(settings, monkeypatch):
    monkeypatch.delenv("GUEST_PASSWORD")
    with pytest.raises(ValueError, match="GUEST_PASSWORD"):
        with TestClient(create_app(settings)):
            pass
    monkeypatch.setenv("GUEST_PASSWORD", LOCAL_GUEST)
    with TestClient(create_app(settings)) as value:
        with value.app.state.sessions() as db:
            assert len(db.scalars(select(User)).all()) == 2


def test_bootstrap_never_resets_existing_password(client, monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "changed-local-only-password")
    bootstrap(client.app.state.engine)
    assert login(client).status_code == 200


@pytest.mark.parametrize("values", [
    {"environment": "wrong"}, {"app_origin": "https://example.com/"},
    {"app_origin": "https://user:pass@example.com"}, {"app_origin": "http://example.com"},
    {"app_origin": "https://example.com:invalid"}, {"app_origin": "https://bad host"},
    {"session_seconds": 0}, {"login_limit": 0}, {"database_url": "mysql://db"},
    {"environment": "production", "app_origin": "https://example.com"},
    {"environment": "production", "database_url": "postgresql+psycopg://localhost/db"},
])
def test_invalid_configuration(values):
    with pytest.raises(ValueError):
        Settings(**values)


def test_render_auto_production_and_url_normalization(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.delenv("APP_ORIGIN", raising=False)
    with pytest.raises(ValueError, match="APP_ORIGIN"):
        Settings.from_env()
    monkeypatch.setenv("APP_ORIGIN", "https://learn.example.com")
    monkeypatch.setenv("DATABASE_URL", "postgres://local-test:local-test@localhost/local-test")
    config = Settings.from_env()
    assert config.production and config.database_url.startswith("postgresql+psycopg://")


def test_render_rejects_local_mode(monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("APP_ENV", "local")
    with pytest.raises(ValueError, match="Render requires"):
        Settings.from_env()


def test_secure_cookie_policy(client):
    # Exercise production cookie policy against the local test DB, not a deployment.
    client.app.state.settings = replace(client.app.state.settings, environment="production",
                                       app_origin=ORIGIN.replace("http:", "https:"),
                                       database_url="postgresql+psycopg://localhost/test")
    response = client.post("/api/auth/login", json={"username": "admin", "password": LOCAL_ADMIN},
                           headers={"Origin": ORIGIN.replace("http:", "https:")})
    cookie = response.headers["set-cookie"]
    assert "__Host-learn_session=" in cookie and "Secure" in cookie and "HttpOnly" in cookie
    assert "Domain=" not in cookie


def test_spa_and_api_fallback(client, settings):
    settings.dist_dir.mkdir()
    (settings.dist_dir / "index.html").write_text("<html>local-test-build</html>")
    (settings.dist_dir / "asset.js").write_text("// local-test-build")
    assert client.get("/").status_code == 200
    assert "local-test-build" in client.get("/studio").text
    assert client.get("/asset.js").status_code == 200
    assert client.get("/missing.js").status_code == 404
    for method in ("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"):
        assert client.request(method, "/api/unknown").status_code == 404
    assert client.get("/api").status_code == 404
    assert client.get("/..%2Foutside.txt").status_code == 404


def test_missing_frontend_is_404(client):
    assert client.get("/").status_code == 404


def test_throttle_concurrent_requests(settings):
    from concurrent.futures import ThreadPoolExecutor
    settings = replace(settings, login_limit=3)
    with TestClient(create_app(settings)) as value:
        with ThreadPoolExecutor(max_workers=6) as pool:
            codes = list(pool.map(lambda _: login(value, password="wrong").status_code, range(6)))
        assert codes.count(401) == 3
        assert codes.count(429) == 3


def test_migration_schema_and_revision(client):
    from sqlalchemy import inspect, text
    inspector = inspect(client.app.state.engine)
    assert {"users", "auth_sessions", "login_attempts", "alembic_version"} <= set(inspector.get_table_names())
    with client.app.state.engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0004_ai_usage"
    assert any(index["column_names"] == ["expires_at"] for index in inspector.get_indexes("auth_sessions"))
    assert any(index["column_names"] == ["occurred_at", "status"] for index in inspector.get_indexes("ai_usage"))


def test_postgresql_ddl_and_throttle_compile(settings):
    # Dialect smoke only; deliberately no external service or credentials.
    from types import SimpleNamespace
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateTable
    from backend.auth import throttle
    from backend.models import Base
    dialect = postgresql.dialect()
    for table in Base.metadata.sorted_tables:
        assert "CREATE TABLE" in str(CreateTable(table).compile(dialect=dialect))
    statements = []

    class CompileDB:
        bind = SimpleNamespace(dialect=dialect)

        def execute(self, statement):
            statements.append(str(statement.compile(dialect=dialect)))
            return SimpleNamespace(scalar_one=lambda: 1)

        def commit(self):
            pass

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=settings)),
                              client=SimpleNamespace(host="127.0.0.1"))
    throttle(request, CompileDB(), "admin")
    assert len(statements) == 2
    assert all("ON CONFLICT" in sql and "RETURNING" in sql for sql in statements)
    # Maintenance must never join the login/upsert transaction.
    assert all("DELETE" not in sql for sql in statements)


def test_migrate_only_cli_without_secrets(settings, monkeypatch):
    monkeypatch.delenv("BOOTSTRAP_ADMIN_PASSWORD")
    monkeypatch.delenv("GUEST_PASSWORD")
    result = subprocess.run([sys.executable, "-m", "backend.bootstrap", "--migrate-only"],
                            cwd=Path(__file__).resolve().parents[1],
                            env={**os.environ, "APP_ENV": "test", "DATABASE_URL": settings.database_url},
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("module,subdir", [("backend.main:app", ""), ("main:app", "backend")])
def test_uvicorn_http_smoke(settings, module, subdir):
    import socket
    import httpx
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    origin = f"http://127.0.0.1:{port}"
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", module, "--host", "127.0.0.1", "--port", str(port)],
        cwd=Path(__file__).resolve().parents[1] / subdir,
        env={**os.environ, "APP_ENV": "test", "APP_ORIGIN": origin, "DATABASE_URL": settings.database_url},
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    try:
        with httpx.Client(base_url=origin, timeout=2, trust_env=False) as http:
            for _ in range(100):
                try:
                    if http.get("/api/health").status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                if process.poll() is not None:
                    pytest.fail("Uvicorn exited before readiness")
                time.sleep(0.1)
            else:
                pytest.fail("Uvicorn readiness timeout")
            guest = http.post("/api/auth/login", json={"username": "guest", "password": LOCAL_GUEST},
                              headers={"Origin": origin})
            assert guest.status_code == 200
            assert http.get("/api/auth/me").json() == guest.json()
            assert http.get("/api/studio/status").status_code == 403
            assert http.post("/api/auth/logout", headers={"Origin": origin,
                             "X-CSRF-Token": guest.json()["csrfToken"]}).status_code == 200
            assert http.get("/api/auth/me").status_code == 401
            assert http.post("/api/auth/login", json={"username": "admin", "password": LOCAL_ADMIN},
                             headers={"Origin": origin}).status_code == 200
            assert http.get("/api/studio/status").status_code == 200
    finally:
        process.terminate()
        output, _ = process.communicate(timeout=15)
    assert LOCAL_ADMIN not in output and LOCAL_GUEST not in output


def test_bootstrap_cli_smoke(settings):
    result = subprocess.run([sys.executable, "-m", "backend.bootstrap"], cwd=Path(__file__).resolve().parents[1],
                            env={**os.environ, "APP_ENV": "test", "DATABASE_URL": settings.database_url},
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
    assert LOCAL_ADMIN not in result.stdout + result.stderr
    with TestClient(create_app(settings)) as value:
        assert login(value).status_code == 200
