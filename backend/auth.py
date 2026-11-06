"""Same-origin, database-backed authentication. No OTP/reset bypass routes."""
import hmac
import re
import secrets
import time
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import case, delete, select, update
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import AuthSession, LoginAttempt, User
from backend.security import DUMMY_HASH, digest, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        # Account identifiers are lowercase ASCII names. Unknown but well-formed
        # names still get the same generic response and dummy hash as wrong passwords.
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", value):
            raise ValueError("Invalid username format")
        return value


def require_origin(request: Request):
    if request.headers.get("origin") != request.app.state.settings.app_origin:
        raise HTTPException(403, "Invalid request origin")
    if request.headers.get("sec-fetch-site") not in {None, "same-origin", "none"}:
        raise HTTPException(403, "Cross-site request denied")


def renew_session(request: Request, response: Response, db: Session, record: AuthSession, now: int):
    """Sliding idle window: activity extends the session, never past its absolute ceiling.

    Renews at most once per half-window, so most requests are read-only. The extension is a
    compare-and-swap on the expiry we read, so concurrent requests cannot stack extensions.
    """
    settings = request.app.state.settings
    ceiling = record.absolute_expires_at
    if ceiling is None or record.expires_at - now > settings.session_seconds // 2:
        return
    renewed = min(now + settings.session_seconds, ceiling)
    if renewed <= record.expires_at:
        return
    changed = db.execute(update(AuthSession).where(
        AuthSession.token_digest == record.token_digest, AuthSession.expires_at == record.expires_at,
    ).values(expires_at=renewed)).rowcount
    db.commit()
    if changed:
        db.refresh(record)
        token = request.cookies.get(settings.cookie_name, "")
        response.set_cookie(settings.cookie_name, token, max_age=renewed - now, httponly=True,
                            secure=settings.production, samesite="lax", path="/")


def authenticated(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(request.app.state.settings.cookie_name, "")
    record = db.get(AuthSession, digest(token)) if token and len(token) <= 128 else None
    now = int(time.time())
    if record is None or record.expires_at <= now:
        raise HTTPException(401, "Authentication required")
    user = db.get(User, record.user_id)
    if user is None:
        raise HTTPException(401, "Authentication required")
    renew_session(request, response, db, record, now)
    request.state.auth_session = record
    return user


def csrf_protected(request: Request, user: User = Depends(authenticated)):
    require_origin(request)
    supplied = request.headers.get("x-csrf-token", "")
    if not hmac.compare_digest(supplied.encode("utf-8"), request.state.auth_session.csrf_token.encode("utf-8")):
        raise HTTPException(403, "Invalid CSRF token")
    return user


def admin_only(request: Request, user: User = Depends(authenticated)):
    if user.role != "admin":
        raise HTTPException(403, "Administrator access required")
    # Applying this dependency to future admin writes automatically enforces CSRF.
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        csrf_protected(request, user)
    return user


def session_body(user, record):
    return {"user": {"username": user.username, "role": user.role}, "csrfToken": record.csrf_token}


def throttle(request, db, username):
    """Atomic fixed windows across workers; count all attempts to bound hash CPU use."""
    settings = request.app.state.settings
    now = int(time.time())
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    # Always acquire the IP bucket before the username bucket in every worker.
    # An already-limited IP must never allocate arbitrary username buckets.
    keys = (digest("ip:" + (request.client.host if request.client else "unknown")), digest("user:" + username))
    blocked = False
    for key in keys:
        stale = LoginAttempt.window_start <= now - settings.login_window_seconds
        statement = insert(LoginAttempt).values(key=key, count=1, window_start=now)
        statement = statement.on_conflict_do_update(index_elements=[LoginAttempt.key], set_={
            "count": case((stale, 1), else_=LoginAttempt.count + 1),
            "window_start": case((stale, now), else_=LoginAttempt.window_start),
        }).returning(LoginAttempt.count)
        if db.execute(statement).scalar_one() > settings.login_limit:
            blocked = True
            break
    # Persist the counter even for a denied request, before raising 429.
    db.commit()
    if blocked:
        raise HTTPException(429, "Too many login attempts", headers={"Retry-After": str(settings.login_window_seconds)})


@router.post("/login", dependencies=[Depends(require_origin)])
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    throttle(request, db, payload.username)
    user = db.scalar(select(User).where(User.username == payload.username))
    valid = verify_password(payload.password, user.password_hash if user else DUMMY_HASH)
    if not valid or user is None:
        raise HTTPException(401, "Invalid credentials")
    settings = request.app.state.settings
    token = secrets.token_urlsafe(32)
    record = AuthSession(token_digest=digest(token), user_id=user.id,
                         csrf_token=secrets.token_urlsafe(32), expires_at=int(time.time()) + settings.session_seconds,
                         absolute_expires_at=int(time.time()) + settings.session_absolute_seconds)
    # Rotate an existing browser session rather than retaining a fixed session identifier.
    old = request.cookies.get(settings.cookie_name, "")
    db.execute(delete(AuthSession).where((AuthSession.token_digest == digest(old)) | (AuthSession.expires_at <= int(time.time()))))
    db.add(record)
    db.commit()
    response.set_cookie(settings.cookie_name, token, max_age=settings.session_seconds,
                        httponly=True, secure=settings.production, samesite="lax", path="/")
    return session_body(user, record)


@router.get("/me")
def me(request: Request, user: User = Depends(authenticated)):
    return session_body(user, request.state.auth_session)


@router.post("/logout")
def logout(request: Request, response: Response, user: User = Depends(csrf_protected), db: Session = Depends(get_db)):
    db.delete(request.state.auth_session)
    db.commit()
    settings = request.app.state.settings
    response.delete_cookie(settings.cookie_name, path="/", secure=settings.production, httponly=True, samesite="lax")
    return {"success": True}


@router.api_route("/otp/request", methods=["GET", "POST"])
@router.api_route("/otp/verify", methods=["GET", "POST"])
@router.api_route("/password/forgot", methods=["GET", "POST"])
@router.api_route("/password/reset", methods=["GET", "POST"])
def disabled_legacy_auth():
    raise HTTPException(404, "Not found")
