"""{Learn — JVM-Lens} — auth: one-time code + password sign-in and password reset."""

from __future__ import annotations

import random
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Demo user store (in-process). Replace with a persisted, hashed store before production.
_USERS: dict[str, dict[str, object]] = {
    "admin": {"password": "Admin1234", "roles": ["admin"]},
    "user": {"password": "User12345", "roles": ["user"]},
}
_OTP_CODES: dict[str, tuple[str, float]] = {}
_RESET_CODES: dict[str, tuple[str, float]] = {}
_TTL_SECONDS = 300
_DEV_ECHO = True

# Password policy (mirrors AGILER's): length bounds + mixed case + a number.
_MIN_PASSWORD = 8
_MAX_PASSWORD = 72


class LoginRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str

    @property
    def identifier(self) -> str:
        return (self.username or self.email or "").strip()


class IdentifierRequest(BaseModel):
    identifier: str


class OtpVerifyRequest(BaseModel):
    identifier: str
    code: str


class PasswordResetRequest(BaseModel):
    identifier: str
    code: str
    newPassword: str


def _issue_code(store: dict[str, tuple[str, float]], identifier: str) -> dict[str, object]:
    code = f"{random.randint(0, 999999):06d}"
    store[identifier] = (code, time.time() + _TTL_SECONDS)
    body: dict[str, object] = {"sent": True, "expiresIn": _TTL_SECONDS}
    if _DEV_ECHO:
        body["devCode"] = code
    return body


def _consume_code(store: dict[str, tuple[str, float]], identifier: str, code: str) -> None:
    record = store.get(identifier)
    if record is None:
        raise HTTPException(status_code=400, detail="No code requested for this identifier")
    expected, expires_at = record
    if time.time() > expires_at:
        store.pop(identifier, None)
        raise HTTPException(status_code=400, detail="Code expired")
    if code != expected:
        raise HTTPException(status_code=401, detail="Invalid code")
    store.pop(identifier, None)


def _session(identifier: str, roles: list[str]) -> dict[str, object]:
    return {
        "accessToken": f"demo-token-{identifier}",
        "user": {"id": f"u-{identifier}", "username": identifier, "roles": roles},
    }


def password_policy_problem(password: str) -> str | None:
    """Why `password` fails the policy, or None when it passes."""
    if len(password) < _MIN_PASSWORD:
        return f"Password must be at least {_MIN_PASSWORD} characters"
    if len(password) > _MAX_PASSWORD:
        return f"Password must be at most {_MAX_PASSWORD} characters"
    if password.lower() == password:
        return "Password must include an uppercase letter"
    if password.upper() == password:
        return "Password must include a lowercase letter"
    if not any(char.isdigit() for char in password):
        return "Password must include a number"
    return None


@router.post("/login")
def login(payload: LoginRequest) -> dict[str, object]:
    user = _USERS.get(payload.identifier)
    if user is None or user["password"] != payload.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return _session(payload.identifier, list(user["roles"]))  # type: ignore[arg-type]


@router.post("/otp/request")
def otp_request(payload: IdentifierRequest) -> dict[str, object]:
    return _issue_code(_OTP_CODES, payload.identifier)


@router.post("/otp/verify")
def otp_verify(payload: OtpVerifyRequest) -> dict[str, object]:
    _consume_code(_OTP_CODES, payload.identifier, payload.code)
    return _session(payload.identifier, ["user"])


@router.post("/password/forgot")
def password_forgot(payload: IdentifierRequest) -> dict[str, object]:
    # No user enumeration: unknown identifiers still report success, with no code minted.
    if payload.identifier not in _USERS:
        return {"sent": True, "expiresIn": _TTL_SECONDS}
    return _issue_code(_RESET_CODES, payload.identifier)


@router.post("/password/reset")
def password_reset(payload: PasswordResetRequest) -> dict[str, object]:
    problem = password_policy_problem(payload.newPassword)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    if payload.identifier not in _USERS:
        raise HTTPException(status_code=400, detail="No reset was requested for this identifier")
    _consume_code(_RESET_CODES, payload.identifier, payload.code)
    _USERS[payload.identifier]["password"] = payload.newPassword
    return {"reset": True}
