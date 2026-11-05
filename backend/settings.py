"""Validated deployment configuration; bootstrap secrets are read only by bootstrap."""
from dataclasses import dataclass
import os
from pathlib import Path
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Settings:
    environment: str = "local"
    database_url: str = f"sqlite:///{Path(__file__).parent / 'data' / 'learn.db'}"
    app_origin: str = "http://localhost:5173"
    session_seconds: int = 28800
    login_limit: int = 10
    login_window_seconds: int = 300
    dist_dir: Path = Path(__file__).resolve().parents[1] / "dist"

    def __post_init__(self):
        if self.environment not in {"local", "test", "production"}:
            raise ValueError("APP_ENV must be local, test or production")
        origin = urlsplit(self.app_origin)
        # Accessing port also validates malformed/non-numeric or out-of-range ports.
        origin.port
        if (origin.scheme not in {"http", "https"} or not origin.hostname
                or any(char.isspace() for char in self.app_origin)
                or origin.username or origin.password or origin.path or origin.query or origin.fragment):
            raise ValueError("APP_ORIGIN must be an exact origin without a trailing slash")
        if not self.database_url.startswith(("sqlite:///", "postgresql+psycopg://")):
            raise ValueError("DATABASE_URL must use SQLite or PostgreSQL (psycopg)")
        if self.production and (origin.scheme != "https" or not self.database_url.startswith("postgresql+psycopg://")):
            raise ValueError("Production requires HTTPS APP_ORIGIN and PostgreSQL DATABASE_URL")
        if not self.production and self.environment != "test" and origin.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("Public deployments must set APP_ENV=production")
        if min(self.session_seconds, self.login_limit, self.login_window_seconds) < 1:
            raise ValueError("Session and throttle settings must be positive")

    @property
    def production(self):
        return self.environment == "production"

    @property
    def cookie_name(self):
        return "__Host-learn_session" if self.production else "learn_session"

    @classmethod
    def from_env(cls):
        url = os.getenv("DATABASE_URL", cls.database_url)
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                url = "postgresql+psycopg://" + url[len(prefix):]
                break
        environment = os.getenv("APP_ENV", "production" if os.getenv("RENDER") else "local")
        if os.getenv("RENDER") and environment != "production":
            raise ValueError("Render requires APP_ENV=production")
        origin = os.getenv("APP_ORIGIN")
        if environment == "production" and not origin:
            raise ValueError("APP_ORIGIN is required in production")
        return cls(environment=environment, database_url=url, app_origin=origin or cls.app_origin,
                   session_seconds=int(os.getenv("SESSION_SECONDS", "28800")),
                   login_limit=int(os.getenv("LOGIN_LIMIT", "10")),
                   login_window_seconds=int(os.getenv("LOGIN_WINDOW_SECONDS", "300")),
                   dist_dir=Path(os.getenv("DIST_DIR", str(cls.dist_dir))))
