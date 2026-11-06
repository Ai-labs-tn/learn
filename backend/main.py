"""Learn with Saravana: same-origin API and built frontend."""
from contextlib import asynccontextmanager
from pathlib import Path
import sys

# Preserve the original `cd backend; uvicorn main:app` launch contract while
# keeping package imports consistent for repository-root commands and tests.
if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import anyio
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import sessionmaker
from backend.auth import admin_only, authenticated, router as auth_router
from backend.ai.api import router as ai_router
from backend.ai.provider import configure_ai
from backend.bootstrap import bootstrap
from backend.content.api import router as content_router
from backend.content.store import import_pilot
from backend.database import make_engine, migrate
from backend.profile.api import router as profile_router
from backend.settings import Settings
from backend.throttle_cleanup import run_cleanup


def create_app(settings: Settings | None = None):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        config = settings or Settings.from_env()
        engine = make_engine(config.database_url)
        try:
            migrate(engine)
            bootstrap(engine)
            import_pilot(engine)
            app.state.settings = config
            app.state.engine = engine
            app.state.sessions = sessionmaker(engine, expire_on_commit=False)
            # Startup-fatal when a key exists but models cannot be verified as free.
            app.state.ai = configure_ai(config)
            async with anyio.create_task_group() as maintenance:
                maintenance.start_soon(run_cleanup, engine, config.login_window_seconds)
                try:
                    yield
                finally:
                    maintenance.cancel_scope.cancel()
        finally:
            engine.dispose()

    app = FastAPI(title="Learn with Saravana", lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def prevent_sensitive_caching(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/api/health")
    def health():
        return {"ok": True, "service": "learn-with-saravana"}

    app.include_router(auth_router)
    app.include_router(content_router)
    app.include_router(ai_router)
    app.include_router(profile_router)

    @app.get("/api/studio/status", dependencies=[Depends(admin_only)])
    def studio_status():
        return {"status": "placeholder"}

    features = APIRouter(prefix="/api", dependencies=[Depends(authenticated)])

    @features.get("/simulator-engine")
    @features.get("/boot-os-simulator")
    @features.get("/jvm-runtime-visualizer")
    @features.get("/bytecode-stepper")
    @features.get("/dsa-visualizer")
    @features.get("/code-editor")
    @features.get("/lesson-tracks")
    @features.get("/progress-tracking")
    def placeholder():
        return []

    app.include_router(features)

    # Catch unknown API paths before the SPA fallback (including POST/PUT/DELETE).
    @app.api_route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
    def api_not_found(path: str = ""):
        return JSONResponse({"detail": "Not found"}, status_code=404)

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(request: Request, path: str):
        root = request.app.state.settings.dist_dir.resolve()
        candidate = (root / path).resolve()
        if not candidate.is_relative_to(root):
            raise HTTPException(404, "Not found")
        if candidate.is_file():
            return FileResponse(candidate)
        # Missing assets should not be served HTML with a misleading 200.
        if Path(path).suffix:
            raise HTTPException(404, "Not found")
        index = root / "index.html"
        if index.is_file():
            return FileResponse(index)
        raise HTTPException(404, "Frontend build not found")

    return app


app = create_app()
