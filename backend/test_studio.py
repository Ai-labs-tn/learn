"""Phase 3 Studio lifecycle; isolated SQLite and opt-in disposable local PG."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Barrier

import pytest
from sqlalchemy import event, select

from backend.content.store import pilot_document
from backend.models import LessonAudit, LessonRevision
from backend.test_api import LOCAL_GUEST, ORIGIN, login, settings  # noqa: F401
from backend.test_content import (  # noqa: F401
    INVALID_VALUES, content_client, content_settings, edit_headers,
    mutate_document, snapshot_without_time,
)

ROOT = "/api/studio/lessons"
PILOT = ROOT + "/boot-pilot"


def new_document():
    return {**pilot_document(), "id": "new-lesson", "title": "Unpublished private title"}


def assert_draft(response, document, version, base):
    assert response.status_code in {200, 201}, response.text
    assert response.headers["etag"] == f'"{version}"'
    assert response.json() == {"document": document, "version": version, "baseRevision": base}


def test_create_save_publish_restore_publish_lifecycle(content_client):
    client = content_client
    headers = edit_headers(client)
    document = new_document()
    path = ROOT + "/" + document["id"]
    assert_draft(client.post(ROOT, json=document, headers=headers), document, 1, None)
    assert client.get(path + "/history").json() == []
    assert client.post(ROOT, json=document, headers=headers).status_code == 409
    assert client.get(path + "/draft").json()["version"] == 1
    assert next(row for row in client.get(ROOT).json() if row["id"] == document["id"])["publishedRevision"] is None
    login(client, "guest", LOCAL_GUEST)
    assert document["id"] not in [row["id"] for row in client.get("/api/lessons").json()]
    assert "Unpublished private" not in client.get("/api/lessons").text
    assert client.get("/api/lessons/" + document["id"]).status_code == 404
    headers = edit_headers(client)
    document["title"] = "First published title"
    assert_draft(client.put(path + "/draft", json=document, headers=headers), document, 2, None)
    published = client.post(path + "/publish", headers={**headers, "If-Match": '"2"'})
    assert published.status_code == 200, published.text
    assert published.headers["etag"] == '"3"'
    assert published.json() == {"document": document, "version": 3, "baseRevision": 1,
                                "revision": 1, "publishedAt": published.json()["publishedAt"]}
    first = deepcopy(document)
    document["title"] = "Second published title"
    assert_draft(client.put(path + "/draft", json=document, headers={**headers, "If-Match": '"3"'}), document, 4, 1)
    second = client.post(path + "/publish", headers={**headers, "If-Match": '"4"'})
    assert second.json()["revision"] == 2 and second.headers["etag"] == '"5"'
    login(client, "guest", LOCAL_GUEST)
    public_before = client.get("/api/lessons/" + document["id"]).json()
    assert public_before["document"] == document and public_before["revision"] == 2
    headers = edit_headers(client, '"5"')
    assert_draft(client.post(path + "/restore", json={"revision": 1}, headers=headers), first, 6, 2)
    assert client.get("/api/lessons/" + document["id"]).json() == public_before
    history_before = client.get(path + "/history").json()
    assert [row["revision"] for row in history_before] == [2, 1]
    assert [row["title"] for row in history_before] == [document["title"], first["title"]]
    assert all(set(row) == {"revision", "title", "publishedAt"} for row in history_before)
    third = client.post(path + "/publish", headers={**headers, "If-Match": '"6"'})
    assert third.status_code == 200 and third.headers["etag"] == '"7"'
    assert third.json()["revision"] == third.json()["baseRevision"] == 3
    assert third.json()["document"] == first
    assert client.get(path + "/history").json()[1:] == history_before
    login(client, "guest", LOCAL_GUEST)
    assert client.get("/api/lessons/" + document["id"]).json()["document"] == first
    with client.app.state.sessions() as db:
        revisions = db.scalars(select(LessonRevision).where(LessonRevision.lesson_id == document["id"]).order_by(LessonRevision.revision)).all()
        assert [row.document for row in revisions] == [first, document, first]
        events = db.scalars(select(LessonAudit).where(LessonAudit.lesson_id == document["id"]).order_by(LessonAudit.id)).all()
        assert [row.action for row in events] == ["draft_created", "draft_updated", "lesson_published", "draft_updated", "lesson_published", "draft_restored", "lesson_published"]
        assert [row.draft_version for row in events] == list(range(1, 8))
        assert all(row.actor_id is not None for row in events)


@pytest.mark.parametrize("operation", ["create", "publish", "restore", "history"])
def test_lifecycle_auth_and_csrf(content_client, operation):
    client = content_client
    path = ROOT if operation == "create" else PILOT + "/" + operation
    body = new_document() if operation == "create" else {"revision": 1} if operation == "restore" else None

    def request(headers=None):
        return client.get(path) if operation == "history" else client.post(path, json=body, headers=headers)

    assert request().status_code == 401
    token = login(client, "guest", LOCAL_GUEST).json()["csrfToken"]
    denied = request({"Origin": ORIGIN, "X-CSRF-Token": token, "If-Match": '"1"'})
    assert denied.status_code == 403 and "document" not in denied.json()
    headers = edit_headers(client)
    before = snapshot_without_time(client.app.state.engine)
    if operation != "history":
        for bad in ({}, {"Origin": ORIGIN}, {"X-CSRF-Token": headers["X-CSRF-Token"]},
                    {**headers, "X-CSRF-Token": "wrong"}, {**headers, "Origin": "https://evil.invalid"},
                    {**headers, "Sec-Fetch-Site": "cross-site"}):
            assert request(bad).status_code == 403
    assert snapshot_without_time(client.app.state.engine) == before


@pytest.mark.parametrize("operation", ["publish", "restore"])
def test_lifecycle_etags_missing_and_stale(content_client, operation):
    client = content_client
    headers = edit_headers(client)
    body = {"revision": 1} if operation == "restore" else None
    before = snapshot_without_time(client.app.state.engine)
    no_match = {key: value for key, value in headers.items() if key != "If-Match"}
    assert client.post(PILOT + "/" + operation, json=body, headers=no_match).status_code == 428
    for tag in ('1', '*', 'W/"1"', '"1", "2"', '"0"', '"01"', '"2"', '"-1"', '"2147483647"', '"' + '9' * 5000 + '"'):
        assert client.post(PILOT + "/" + operation, json=body, headers={**headers, "If-Match": tag}).status_code == 409
    assert client.post(ROOT + "/missing/" + operation, json=body, headers=headers).status_code == 404
    assert snapshot_without_time(client.app.state.engine) == before
    success = client.post(PILOT + "/" + operation, json=body, headers=headers)
    assert success.status_code == 200 and success.headers["etag"] == '"2"'
    assert client.post(PILOT + "/" + operation, json=body, headers=headers).status_code == 409
    assert client.get(PILOT + "/draft").json()["version"] == 2


def test_create_validation_and_restore_strict_body(content_client):
    client = content_client
    headers = edit_headers(client)
    before = snapshot_without_time(client.app.state.engine)
    for path, value in INVALID_VALUES:
        document = pilot_document()
        mutate_document(document, path, value)
        assert client.post(ROOT, json=document, headers=headers).status_code == 422
    for body in ({}, {"revision": 0}, {"revision": -1}, {"revision": True}, {"revision": "1"},
                 {"revision": 1.0}, {"revision": None}, {"revision": 1, "document": {}}, []):
        assert client.post(PILOT + "/restore", json=body, headers=headers).status_code == 422
    assert client.post(PILOT + "/restore", json={"revision": 99}, headers=headers).status_code == 404
    assert client.get(ROOT + "/missing/history").status_code == 404
    assert snapshot_without_time(client.app.state.engine) == before


@pytest.mark.parametrize("operations", [
    ["publish"] * 6, ["publish", "save", "restore"] * 2,
    ["restore"] * 6, ["create"] * 6,
])
def test_concurrent_lifecycle_only_one_wins(content_client, operations):
    client = content_client
    headers = edit_headers(client)
    barrier = Barrier(len(operations))
    before = snapshot_without_time(client.app.state.engine)

    def run(operation):
        barrier.wait(timeout=10)
        if operation == "save":
            document = {**pilot_document(), "title": "Concurrent save"}
            return client.put(PILOT + "/draft", json=document, headers=headers)
        if operation == "create":
            return client.post(ROOT, json=new_document(), headers=headers)
        return client.post(PILOT + "/" + operation,
                           json={"revision": 1} if operation == "restore" else None, headers=headers)

    with ThreadPoolExecutor(max_workers=len(operations)) as pool:
        results = list(pool.map(run, operations))
    success = 201 if operations[0] == "create" else 200
    assert sorted(row.status_code for row in results) == sorted([success] + [409] * (len(operations) - 1))
    after = snapshot_without_time(client.app.state.engine)
    assert len(after["auditEvents"]) == len(before["auditEvents"]) + 1
    if operations[0] != "create":
        winner = next(row.json() for row in results if row.status_code == 200)
        assert client.get(PILOT + "/draft").json() == {key: winner[key] for key in ("document", "version", "baseRevision")}
        assert len(after["revisions"]) == len(before["revisions"]) + (1 if "revision" in winner else 0)


@pytest.mark.parametrize("operation", ["create", "publish", "restore"])
def test_lifecycle_audit_failure_rolls_back_all_writes(content_client, operation):
    client = content_client
    headers = edit_headers(client)
    before = snapshot_without_time(client.app.state.engine)

    def fail_audit(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith("INSERT INTO lesson_audit_events"):
            raise RuntimeError("injected test-only audit failure")

    event.listen(client.app.state.engine, "before_cursor_execute", fail_audit)
    try:
        with pytest.raises(RuntimeError, match="audit failure"):
            if operation == "create":
                client.post(ROOT, json=new_document(), headers=headers)
            else:
                client.post(PILOT + "/" + operation, json={"revision": 1} if operation == "restore" else None, headers=headers)
    finally:
        event.remove(client.app.state.engine, "before_cursor_execute", fail_audit)
    assert snapshot_without_time(client.app.state.engine) == before
    assert client.get(PILOT + "/draft").headers["etag"] == '"1"'
