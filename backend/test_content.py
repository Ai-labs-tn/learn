"""Phase 2 acceptance: temporary SQLite or explicitly opt-in disposable local PG."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from dataclasses import replace
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import delete, event, func, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError

from backend.content.schema import LessonDocument, SIGNALS
from backend.content.store import export_content, import_pilot, pilot_document, timestamp
from backend.database import make_engine, migrate
from backend.main import create_app
from backend.models import Lesson, LessonAudit, LessonDraft, LessonRevision
from backend.test_api import LOCAL_GUEST, ORIGIN, login, settings  # noqa: F401 (pytest fixture)

DRAFT = "/api/studio/lessons/boot-pilot/draft"
PUBLISHED = "/api/lessons/boot-pilot"


@pytest.fixture(params=["sqlite", "postgresql"])
def content_settings(request, settings):
    if request.param == "sqlite":
        yield settings
        return
    url = os.getenv("TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Disposable PostgreSQL not configured locally")
    parsed = make_url(url)
    assert parsed.host in {"localhost", "127.0.0.1"}, "Refusing a nonlocal database"
    assert parsed.database == "learn_acceptance", "Use disposable learn_acceptance only"
    # Isolated schema avoids touching other acceptance tests' rows or auth accounts.
    schema = "phase2_" + uuid4().hex
    engine = make_engine(url)
    with engine.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    try:
        isolated = parsed.update_query_dict({"options": f"-csearch_path={schema}"})
        yield replace(settings, database_url=isolated.render_as_string(hide_password=False))
    finally:
        with engine.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        engine.dispose()


@pytest.fixture
def content_client(content_settings):
    with TestClient(create_app(content_settings)) as value:
        yield value


def edit_headers(client, version='"1"'):
    token = login(client).json()["csrfToken"]
    return {"Origin": ORIGIN, "X-CSRF-Token": token, "If-Match": version}


def snapshot_without_time(engine):
    snapshot = export_content(engine)
    snapshot.pop("exportedAt")
    return snapshot


def mutate_document(document, path, value):
    target = document
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value


INVALID_VALUES = [
    (("schemaVersion",), value) for value in [0, 2, "1", True, 1.0, None]
] + [
    (("id",), "Boot-pilot"), (("id",), "x" * 65), (("title",), " "),
    (("title",), "x" * 161), (("description",), "x" * 1001),
    (("title",), "<script>alert(1)</script>"), (("description",), "https://example.invalid"),
    (("description",), "javascript:alert(1)"), (("description",), "data:text/plain,hi"),
    (("description",), "www.example.invalid"), (("description",), "bad\x00text"),
    (("title",), 123), (("scenes",), []),
    (("scenes", 0, "id"), "boot-pilot"), (("scenes", 0, "title"), ""),
    (("scenes", 0, "beats"), []),
    (("scenes", 0, "beats", 0, "narration"), {"en": "English only"}),
    (("scenes", 0, "beats", 0, "narration"), {"en": "English", "ta": " "}),
    (("scenes", 0, "beats", 0, "narration", "en"), "x" * 2001),
    (("scenes", 0, "beats", 0, "captions"), {}),
    (("scenes", 0, "beats", 0, "captions"), None),
    (("scenes", 0, "beats", 0, "captions"), {"en": None}),
    (("scenes", 0, "beats", 0, "captions"), {"en": "ok", "fr": "non"}),
    (("scenes", 0, "beats", 0, "visual", "component"), "script"),
    (("scenes", 0, "beats", 0, "visual", "focus"), "gpu"),
    (("scenes", 0, "beats", 0, "visual", "action"), "execute"),
    (("scenes", 0, "beats", 0, "visual", "from"), None),
    (("scenes", 0, "beats", 0, "visual", "url"), "https://example.invalid"),
    (("scenes", 0, "beats", 0, "narration", "code"), "alert(1)"),
    (("scenes", 0, "initialState"), {}),
    (("scenes", 0, "beats", 0, "checkpoint"), {}),
    (("script",), "alert(1)"),
]


@pytest.mark.parametrize("path,value", INVALID_VALUES)
def test_schema_invalid_inputs(path, value):
    document = pilot_document()
    mutate_document(document, path, value)
    with pytest.raises(ValidationError):
        LessonDocument.model_validate(document)


@pytest.mark.parametrize("visual", [
    {"component": "boot-machine", "focus": "cpu", "action": "signal", "from": "cpu", "to": "cpu"},
    {"component": "boot-machine", "focus": "power", "action": "signal", "from": "cpu", "to": "ram"},
    {"component": "boot-machine", "focus": "cpu", "action": "signal", "from": "cpu"},
    {"component": "boot-machine", "focus": "cpu", "action": "signal", "from": "overview", "to": "cpu"},
    {"component": "boot-machine", "focus": "cpu", "action": "signal", "from": "cpu", "to": "ram", "status": "passed"},
    {"component": "boot-machine", "focus": "overview", "action": "status", "status": "passed"},
    {"component": "boot-machine", "focus": "ram", "action": "status"},
    {"component": "boot-machine", "focus": "ram", "action": "status", "status": "failed"},
    {"component": "boot-machine", "focus": "ram", "action": "status", "status": "idle", "from": "cpu"},
    {"component": "boot-machine", "focus": "cpu", "action": "focus", "status": None},
])
def test_schema_rejects_visual_combinations(visual):
    document = pilot_document()
    document["scenes"][0]["beats"][0]["visual"] = visual
    with pytest.raises(ValidationError):
        LessonDocument.model_validate(document)


def test_schema_valid_registries_captions_and_bilingual_roundtrip():
    document = pilot_document()
    beat = document["scenes"][0]["beats"][0]
    for source, destination in SIGNALS:
        beat["visual"] = {"component": "boot-machine", "focus": destination, "action": "signal",
                          "from": source, "to": destination}
        assert LessonDocument.model_validate(document).document() == document
    for focus in ("power", "firmware", "cpu", "ram", "storage", "overview"):
        beat["visual"] = {"component": "boot-machine", "focus": focus, "action": "focus"}
        assert LessonDocument.model_validate(document)
        if focus != "overview":
            for status in ("idle", "checking", "passed"):
                beat["visual"].update(action="status", status=status)
                assert LessonDocument.model_validate(document)
    beat["captions"] = {"ta": "மின்சாரம் வருகிறது."}
    result = LessonDocument.model_validate_json(json.dumps(document, ensure_ascii=False)).document()
    assert result == document
    assert "en" not in result["scenes"][0]["beats"][0]["captions"]


def test_schema_duplicate_ids_and_aggregate_bounds():
    document = pilot_document()
    document["scenes"][1]["beats"][0]["id"] = document["scenes"][0]["beats"][0]["id"]
    with pytest.raises(ValidationError, match="unique"):
        LessonDocument.model_validate(document)
    template = pilot_document()["scenes"][0]["beats"][0]

    def large_document(scenes, beats, text="Text"):
        doc = pilot_document()
        doc["scenes"] = []
        for scene in range(scenes):
            values = []
            for beat in range(beats):
                item = deepcopy(template)
                item.update(id=f"beat-{scene}-{beat}", narration={"en": text, "ta": text})
                values.append(item)
            doc["scenes"].append({"id": f"scene-{scene}", "title": "Scene", "beats": values})
        return doc

    assert LessonDocument.model_validate(large_document(12, 10))  # 120 beats / 12 scenes.
    assert LessonDocument.model_validate(large_document(5, 24))
    for scenes, beats in [(13, 1), (1, 25), (6, 21)]:
        with pytest.raises(ValidationError):
            LessonDocument.model_validate(large_document(scenes, beats))
    with pytest.raises(ValidationError, match="256 KiB"):
        LessonDocument.model_validate(large_document(5, 24, "த" * 1000))


def test_anonymous_and_guest_cannot_obtain_or_write_drafts(content_client):
    client = content_client
    for path in ("/api/lessons", PUBLISHED, "/api/studio/lessons", DRAFT):
        assert client.get(path).status_code == 401
    assert client.put(DRAFT, json=pilot_document()).status_code == 401
    token = login(client, "guest", LOCAL_GUEST).json()["csrfToken"]
    for path in ("/api/studio/lessons", DRAFT):
        response = client.get(path)
        assert response.status_code == 403 and "document" not in response.json()
    assert client.put(DRAFT, json=pilot_document(), headers={"Origin": ORIGIN, "X-CSRF-Token": token,
                                                          "If-Match": '"1"'}).status_code == 403
    for path in ("/api/lessons/boot-pilot/draft", "/api/lessons/boot-pilot/revisions/1",
                 "/api/studio/lessons/boot-pilot/revisions/1", "/api/lesson_revisions/1"):
        assert client.get(path).status_code == 404
    assert client.get(PUBLISHED).json()["document"] == pilot_document()
    metadata = client.get("/api/lessons").json()[0]
    assert set(metadata) == {"id", "title", "description", "revision", "publishedAt"}
    assert client.get(PUBLISHED).headers["cache-control"] == "no-store"
    assert client.get("/api/lessons/missing").status_code == 404


def test_admin_csrf_preconditions_and_validation(content_client):
    client = content_client
    headers = edit_headers(client)
    assert client.get("/api/studio/status").json() == {"status": "placeholder"}
    draft = client.get(DRAFT)
    assert draft.headers["etag"] == '"1"'
    assert set(draft.json()) == {"document", "version", "baseRevision"}
    document = draft.json()["document"]
    for bad_headers in ({}, {"Origin": ORIGIN}, {"X-CSRF-Token": headers["X-CSRF-Token"]},
                        {**headers, "X-CSRF-Token": "wrong"}, {**headers, "Origin": "https://evil.invalid"},
                        {**headers, "Sec-Fetch-Site": "cross-site"}):
        assert client.put(DRAFT, json=document, headers=bad_headers).status_code == 403
    no_match = {key: value for key, value in headers.items() if key != "If-Match"}
    assert client.put(DRAFT, json=document, headers=no_match).status_code == 428
    for tag in ('1', '*', 'W/"1"', '"1", "2"', '"0"', '"01"', '"2"', '"-1"', '"2147483647"', '"' + '9' * 5000 + '"'):
        assert client.put(DRAFT, json=document, headers={**headers, "If-Match": tag}).status_code == 409
    for path, value in INVALID_VALUES:
        invalid = deepcopy(document)
        mutate_document(invalid, path, value)
        assert client.put(DRAFT, json=invalid, headers=headers).status_code == 422
    mismatched = {**document, "id": "different"}
    assert client.put(DRAFT, json=mismatched, headers=headers).status_code == 422
    assert client.put("/api/studio/lessons/different/draft", json=mismatched, headers=headers).status_code == 404
    assert client.get(DRAFT).json() == draft.json()
    assert client.get("/api/studio/lessons/missing/draft").status_code == 404


def test_edit_isolated_from_publication_and_stale_conflict(content_client):
    client = content_client
    headers = edit_headers(client)
    published = client.get(PUBLISHED).json()
    document = client.get(DRAFT).json()["document"]
    document["title"] = "Private changed title"
    document["description"] = "Private draft description"
    document["scenes"][0]["beats"][0]["narration"]["ta"] = "புதிய தமிழ் உரை."
    result = client.put(DRAFT, json=document, headers=headers)
    assert result.status_code == 200, result.text
    assert result.headers["etag"] == '"2"'
    assert result.json() == {"document": document, "version": 2, "baseRevision": 1}
    assert client.get(DRAFT).json() == result.json()
    assert client.put(DRAFT, json=pilot_document(), headers=headers).status_code == 409
    studio = client.get("/api/studio/lessons").json()[0]
    assert studio["title"] == document["title"] and studio["version"] == 2
    login(client, "guest", LOCAL_GUEST)
    assert client.get(PUBLISHED).json() == published
    assert client.get("/api/lessons").json()[0]["title"] == published["document"]["title"]
    assert "Private" not in client.get("/api/lessons").text
    with client.app.state.sessions() as db:
        events = db.scalars(select(LessonAudit).where(LessonAudit.action == "draft_updated")).all()
        assert len(events) == 1 and events[0].draft_version == 2 and events[0].actor_id is not None


def test_concurrent_saves_only_one_wins(content_client):
    client = content_client
    headers = edit_headers(client)
    barrier = Barrier(6)

    def save(index):
        document = pilot_document()
        document["title"] = f"Concurrent edit {index}"
        barrier.wait(timeout=10)
        return client.put(DRAFT, json=document, headers=headers)

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(save, range(6)))
    assert [item.status_code for item in results].count(200) == 1
    assert [item.status_code for item in results].count(409) == 5
    winner = next(item.json() for item in results if item.status_code == 200)
    assert client.get(DRAFT).json() == winner
    with client.app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(LessonAudit).where(LessonAudit.action == "draft_updated")) == 1


def test_edit_and_audit_rollback_together(content_client):
    client = content_client
    headers = edit_headers(client)
    before = snapshot_without_time(client.app.state.engine)

    def fail_audit(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith("INSERT INTO lesson_audit_events"):
            raise RuntimeError("injected test-only audit failure")

    event.listen(client.app.state.engine, "before_cursor_execute", fail_audit)
    try:
        with pytest.raises(RuntimeError, match="audit failure"):
            client.put(DRAFT, json=pilot_document(), headers=headers)
    finally:
        event.remove(client.app.state.engine, "before_cursor_execute", fail_audit)
    assert snapshot_without_time(client.app.state.engine) == before


def test_history_immutable_and_foreign_keys_enforced(content_client):
    engine = content_client.app.state.engine
    for table in (LessonRevision, LessonAudit):
        for statement in (update(table).values(lesson_id="boot-pilot"), delete(table)):
            with pytest.raises(DBAPIError, match="append-only"):
                with engine.begin() as connection:
                    connection.execute(statement)
        if engine.dialect.name == "postgresql":
            with pytest.raises(DBAPIError, match="append-only"):
                with engine.begin() as connection:
                    connection.exec_driver_sql(f"TRUNCATE {table.__tablename__} CASCADE")
        else:
            with pytest.raises(DBAPIError, match="append-only"):
                with engine.begin() as connection:
                    connection.exec_driver_sql(f"INSERT OR REPLACE INTO {table.__tablename__} "
                                               f"SELECT * FROM {table.__tablename__}")
    with pytest.raises(DBAPIError):
        with engine.begin() as connection:
            connection.execute(update(Lesson).values(published_revision=99))
    with pytest.raises(DBAPIError):
        with engine.begin() as connection:
            connection.execute(update(LessonDraft).values(base_revision=99))
    with pytest.raises(DBAPIError):
        with engine.begin() as connection:
            connection.execute(update(LessonDraft).values(version=0))


def test_import_restart_idempotence_and_concurrent_import(content_settings):
    engine = make_engine(content_settings.database_url)
    try:
        migrate(engine)
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: import_pilot(engine), range(4)))
        initial = snapshot_without_time(engine)
        assert len(initial["lessons"]) == len(initial["revisions"]) == len(initial["drafts"]) == 1
        assert len(initial["auditEvents"]) == 2
    finally:
        engine.dispose()
    with TestClient(create_app(content_settings)) as first:
        headers = edit_headers(first)
        document = pilot_document()
        document["title"] = "Keep my authored changes"
        assert first.put(DRAFT, json=document, headers=headers).status_code == 200
        before = snapshot_without_time(first.app.state.engine)
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: import_pilot(first.app.state.engine), range(4)))
        assert snapshot_without_time(first.app.state.engine) == before
        cookie = first.cookies.get("learn_session")
    with TestClient(create_app(content_settings)) as second:
        second.cookies.set("learn_session", cookie)
        assert second.get(DRAFT).json()["document"] == document
        assert second.get(DRAFT).json()["version"] == 2
        assert snapshot_without_time(second.app.state.engine) == before


def test_import_preserves_later_publication_and_repairs_only_missing_draft(content_client):
    engine = content_client.app.state.engine
    document = pilot_document()
    document["title"] = "Later published title"
    with content_client.app.state.sessions() as db, db.begin():
        db.add(LessonRevision(lesson_id="boot-pilot", revision=2, document=document,
                              published_at=timestamp(), created_by=None))
        db.flush()
        db.execute(update(Lesson).values(published_revision=2))
    import_pilot(engine)
    with content_client.app.state.sessions() as db:
        assert db.get(Lesson, "boot-pilot").published_revision == 2
        assert db.get(LessonDraft, "boot-pilot").base_revision == 1
    with engine.begin() as connection:
        connection.execute(delete(LessonDraft))
    import_pilot(engine)
    with content_client.app.state.sessions() as db:
        draft = db.get(LessonDraft, "boot-pilot")
        assert draft.document == document and draft.base_revision == 2 and draft.version == 1
    before = snapshot_without_time(engine)
    import_pilot(engine)
    assert snapshot_without_time(engine) == before


def test_export_cli_roundtrip_no_secrets_or_overwrite(content_client, content_settings, tmp_path):
    client = content_client
    headers = edit_headers(client)
    document = pilot_document()
    document["title"] = "Private export title"
    assert client.put(DRAFT, json=document, headers=headers).status_code == 200
    output = tmp_path / "private-content-backup.json"
    command = [sys.executable, "-m", "backend.content.cli", "export", "--output", str(output)]
    env = {**os.environ, "APP_ENV": "test", "DATABASE_URL": content_settings.database_url}
    before = snapshot_without_time(client.app.state.engine)
    result = subprocess.run(command, cwd=Path(__file__).resolve().parents[1], env=env,
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
    data = json.loads(output.read_text(encoding="utf-8"))
    data.pop("exportedAt")
    assert data == before
    assert data["backupVersion"] == 1
    for section in ("drafts", "revisions"):
        for row in data[section]:
            assert LessonDocument.model_validate(row["document"]).document() == row["document"]
    raw = output.read_text(encoding="utf-8")
    assert "மின்சாரம்" in raw
    for secret in (client.cookies.get("learn_session"), headers["X-CSRF-Token"], "password_hash", "token_digest", "scrypt$"):
        assert secret not in raw
    assert snapshot_without_time(client.app.state.engine) == before
    second = subprocess.run(command, cwd=Path(__file__).resolve().parents[1], env=env,
                            capture_output=True, text=True, timeout=30)
    assert second.returncode != 0
    assert output.read_text(encoding="utf-8") == raw
    imported = subprocess.run([sys.executable, "-m", "backend.content.cli", "import-pilot"],
                              cwd=Path(__file__).resolve().parents[1], env=env,
                              capture_output=True, text=True, timeout=30)
    assert imported.returncode == 0, imported.stderr
    assert snapshot_without_time(client.app.state.engine) == before


def test_additive_content_migration_preserves_auth_rows(settings):
    from alembic import command
    from alembic.config import Config
    from backend.bootstrap import bootstrap
    from backend.models import AuthSession, LoginAttempt, User
    from backend.security import digest
    engine = make_engine(settings.database_url)
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "0002_throttle_cleanup_index")
        bootstrap(engine)
        with engine.begin() as connection:
            connection.execute(AuthSession.__table__.insert().values(token_digest=digest("local-only"),
                user_id=1, csrf_token="local-csrf", expires_at=2000000000))
            connection.execute(LoginAttempt.__table__.insert().values(key="local-old", count=4, window_start=123))
            users = connection.execute(select(User.__table__)).all()
        migrate(engine)
        migrate(engine)
        with engine.connect() as connection:
            assert connection.execute(select(User.__table__)).all() == users
            assert connection.scalar(select(AuthSession.csrf_token)) == "local-csrf"
            assert connection.scalar(select(LoginAttempt.count)) == 4
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0006_profiles"
    finally:
        engine.dispose()
