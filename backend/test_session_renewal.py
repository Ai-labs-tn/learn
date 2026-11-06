"""Sliding session renewal: activity extends the idle window within an absolute ceiling."""
import time

import pytest
from sqlalchemy import select, update

from backend.models import AuthSession
from backend.settings import Settings
from backend.test_api import ORIGIN, client, login, settings  # noqa: F401  (fixtures)

IDLE = 28800
CEILING = 604800


def session_row(client):
    with client.app.state.sessions() as db:
        return db.scalars(select(AuthSession)).one()


def set_session(client, **values):
    with client.app.state.sessions() as db:
        db.execute(update(AuthSession).values(**values))
        db.commit()


def test_login_sets_absolute_ceiling(client):
    login(client)
    row = session_row(client)
    assert row.absolute_expires_at is not None
    assert 0 < row.absolute_expires_at - row.expires_at <= CEILING - IDLE + 5


def test_no_renewal_while_plenty_of_time_remains(client):
    login(client)
    before = session_row(client).expires_at
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert session_row(client).expires_at == before
    assert "set-cookie" not in response.headers


def test_activity_in_the_second_half_renews_and_reissues_cookie(client):
    login(client)
    soon = int(time.time()) + IDLE // 4
    set_session(client, expires_at=soon)
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    renewed = session_row(client).expires_at
    assert renewed > soon
    assert renewed - int(time.time()) >= IDLE - 5
    cookie = response.headers["set-cookie"]
    assert "learn_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert f"Max-Age={IDLE}" in cookie or f"Max-Age={IDLE - 1}" in cookie


def test_renewal_never_passes_the_absolute_ceiling(client):
    login(client)
    now = int(time.time())
    set_session(client, expires_at=now + 100, absolute_expires_at=now + 1000)
    assert client.get("/api/auth/me").status_code == 200
    assert session_row(client).expires_at == now + 1000
    # At the ceiling there is nothing more to give: no further extension, no new cookie.
    response = client.get("/api/auth/me")
    assert session_row(client).expires_at == now + 1000
    assert "set-cookie" not in response.headers


def test_expired_session_is_never_revived(client):
    login(client)
    set_session(client, expires_at=int(time.time()) - 1)
    assert client.get("/api/auth/me").status_code == 401
    assert session_row(client).expires_at <= int(time.time())


def test_sessions_without_a_ceiling_are_not_renewed(client):
    # Sessions created before migration 0005 keep their fixed lifetime.
    login(client)
    soon = int(time.time()) + 60
    set_session(client, expires_at=soon, absolute_expires_at=None)
    assert client.get("/api/auth/me").status_code == 200
    assert session_row(client).expires_at == soon


def test_unauthenticated_requests_never_create_or_extend_anything(client):
    assert client.get("/api/auth/me").status_code == 401
    with client.app.state.sessions() as db:
        assert db.scalars(select(AuthSession)).all() == []


def test_logout_still_revokes_a_renewed_session(client):
    body = login(client).json()
    set_session(client, expires_at=int(time.time()) + IDLE // 4)
    assert client.get("/api/auth/me").status_code == 200
    token = client.cookies.get("learn_session")
    assert client.post("/api/auth/logout", headers={"Origin": ORIGIN, "X-CSRF-Token": body["csrfToken"]}).status_code == 200
    client.cookies.set("learn_session", token)
    assert client.get("/api/auth/me").status_code == 401


@pytest.mark.parametrize("values", [{"session_seconds": 100, "session_absolute_seconds": 99}])
def test_absolute_ceiling_must_cover_the_idle_window(values):
    with pytest.raises(ValueError, match="SESSION_ABSOLUTE_SECONDS"):
        Settings(**values)
