"""Profile API acceptance tests using only temporary, local SQLite databases."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from threading import Barrier

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, select, text

from backend.bootstrap import bootstrap
from backend.database import make_engine, migrate
from backend.models import Profile, User
from backend.test_api import LOCAL_GUEST, ORIGIN, client, login, settings  # noqa: F401

PUBLIC = "/api/profile"
STUDIO = "/api/studio/profile"


def document():
    # Synthetic values only; distinctive markers make accidental disclosure visible.
    return {
        "schemaVersion": 1,
        "identity": {"name": "Example Person", "headline": "Engineer", "titles": ["Developer"], "region": "Example region"},
        "contact": {"email": "public@example.invalid", "linkedin": "https://www.linkedin.com/in/example-person",
                    "phone": "+1 555 123 4567", "address": "Private Address Marker",
                    "website": "https://example.invalid/portfolio"},
        "summary": "Example summary", "highlights": ["Example highlight"],
        "skills": [{"name": "Python", "level": 4, "group": "Programming"}],
        "certifications": [{"name": "Certificate", "issuer": "Example", "validUntil": "2028-01-31"}],
        "awards": [{"title": "Award", "date": "2025-02-01", "description": "Recognition"}],
        "experience": [{"id": "example-role", "role": "Engineer", "company": "Example Co",
                        "location": "Example region", "start": "2020-01", "end": "2024-12",
                        "achievements": ["Built the public example"]}],
        "education": [{"level": "University", "institution": "Public University", "location": "Example region",
                       "start": "2012-01", "end": "2016-01", "isSchool": False},
                      {"level": "School", "institution": "Private School Marker", "location": "Example region",
                       "start": "2000-01", "end": "2011-01", "isSchool": True}],
        "projects": [{"id": "example-project", "name": "Example project", "domain": "Education",
                      "summary": "Example project summary", "techStack": ["Python"],
                      "roles": [{"title": "Developer", "description": "Built the project"}]}],
        "domains": ["Education"], "interests": ["Public interest example"],
        "references": [{"name": "Private Reference Marker", "title": "Manager", "company": "Example Co",
                        "email": "private-reference@example.invalid", "phone": "+1 555 000 0000"}],
        "narration": {"tagline": "Example tagline", "elevatorPitch": "Example pitch", "about": "About example",
                      "careerStory": "Career story", "strengths": [{"title": str(i), "text": "Strength"} for i in range(3)],
                      "projectStories": {"example-project": "A project story"}},
    }


def payload(is_public=False):
    return {"document": document(), "isPublic": is_public, "sourceSha256": "a" * 64, "aiModel": "example/model"}


def admin_headers(client, version=None):
    headers = {"Origin": ORIGIN, "X-CSRF-Token": login(client).json()["csrfToken"]}
    if version is not None:
        headers["If-Match"] = version
    return headers


def profile_rows(client):
    with client.app.state.sessions() as db:
        return [(row.id, deepcopy(row.entities), row.is_public, row.version, row.source_sha256,
                 row.ai_model, row.updated_at, row.updated_by) for row in db.scalars(select(Profile)).all()]


def test_private_to_public_lifecycle_and_projection(client):
    assert client.get(PUBLIC).status_code == 404
    headers = admin_headers(client)
    assert client.get(STUDIO).status_code == 404
    body = payload()
    created = client.post(STUDIO, json=body, headers=headers)
    assert created.status_code == 201, created.text
    assert created.headers["etag"] == '"1"'
    result = created.json()
    assert set(result) == {"profileId", "version", "isPublic", "document", "sourceSha256", "aiModel", "updatedAt"}
    assert result["profileId"].startswith("prf-") and result["version"] == 1
    assert result["isPublic"] is False and result["sourceSha256"] == body["sourceSha256"]
    assert result["aiModel"] == body["aiModel"]
    assert result["document"]["contact"] == body["document"]["contact"]
    assert result["document"]["references"] == body["document"]["references"]
    assert client.get(STUDIO).json() == result
    assert client.get(STUDIO).headers["etag"] == '"1"'
    assert client.get(PUBLIC).status_code == 404
    before = profile_rows(client)
    assert client.post(STUDIO, json=body, headers=headers).status_code == 409
    assert profile_rows(client) == before

    body["isPublic"] = True
    published = client.put(STUDIO, json=body, headers={**headers, "If-Match": '"1"'})
    assert published.status_code == 200 and published.headers["etag"] == '"2"'
    client.cookies.clear()  # Public means genuinely anonymous, not merely admin access.
    response = client.get(PUBLIC)
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    data = response.json()
    assert set(data) == {"profileId", "version", "updatedAt", "profile"}
    assert data["profileId"] == result["profileId"] and data["version"] == 2
    view = data["profile"]
    assert set(view) == {"schemaVersion", "identity", "summary", "highlights", "skills", "certifications", "awards",
                         "experience", "education", "projects", "domains", "interests", "narration", "contact"}
    assert view["contact"] == {"email": "public@example.invalid", "linkedin": "https://www.linkedin.com/in/example-person",
                               "website": "https://example.invalid/portfolio"}
    assert view["experience"][0]["achievements"] == ["Built the public example"] and view["interests"] == ["Public interest example"]
    assert [item["institution"] for item in view["education"]] == ["Public University"]
    for secret in ("Private Address Marker", "+1 555 123 4567", "Private School Marker", "Private Reference Marker",
                   "private-reference@example.invalid", "example/model", "a" * 64, "showPhone"):
        assert secret not in response.text

    headers = admin_headers(client, '"2"')
    body["isPublic"] = False
    assert client.put(STUDIO, json=body, headers=headers).headers["etag"] == '"3"'
    client.cookies.clear()
    assert client.get(PUBLIC).status_code == 404


@pytest.mark.parametrize("flag,expected", [
    ("showPhone", "phone"), ("showAddress", "address"),
    ("showSchoolEducation", "education"), ("showReferences", "references"),
])
def test_public_privacy_flags_are_independent(client, flag, expected):
    body = payload(True)
    body["document"]["privacy"] = {flag: True}
    response = client.post(STUDIO, json=body, headers=admin_headers(client))
    assert response.status_code == 201, response.text
    client.cookies.clear()
    view = client.get(PUBLIC).json()["profile"]
    assert ("phone" in view["contact"]) == (flag == "showPhone")
    assert ("address" in view["contact"]) == (flag == "showAddress")
    assert ("references" in view) == (flag == "showReferences")
    assert len(view["education"]) == (2 if flag == "showSchoolEducation" else 1)
    if expected in {"phone", "address"}:
        assert view["contact"][expected] == body["document"]["contact"][expected]
    elif expected == "references":
        assert view["references"] == body["document"]["references"]


@pytest.mark.parametrize("method", ["GET", "POST", "PUT"])
def test_studio_profile_requires_admin(client, method):
    # Seed a private profile and ensure denied calls do not reveal or alter it.
    body = payload()
    assert client.post(STUDIO, json=body, headers=admin_headers(client)).status_code == 201
    before = profile_rows(client)
    client.cookies.clear()
    response = client.request(method, STUDIO, json=body, headers={"Origin": ORIGIN, "If-Match": '"1"'})
    assert response.status_code == 401 and "Private Address Marker" not in response.text
    token = login(client, "guest", LOCAL_GUEST).json()["csrfToken"]
    response = client.request(method, STUDIO, json=body,
                              headers={"Origin": ORIGIN, "X-CSRF-Token": token, "If-Match": '"1"'})
    assert response.status_code == 403 and "Private Address Marker" not in response.text
    assert profile_rows(client) == before


@pytest.mark.parametrize("method", ["POST", "PUT"])
def test_profile_writes_require_origin_and_session_bound_csrf(client, method):
    headers = admin_headers(client, '"1"')
    if method == "PUT":
        assert client.post(STUDIO, json=payload(), headers=headers).status_code == 201
    before = profile_rows(client)
    for bad in ({}, {"Origin": ORIGIN}, {"X-CSRF-Token": headers["X-CSRF-Token"]},
                {**headers, "X-CSRF-Token": "incorrect"}, {**headers, "Origin": "https://evil.invalid"},
                {**headers, "Sec-Fetch-Site": "cross-site"}):
        assert client.request(method, STUDIO, json=payload(True), headers=bad).status_code == 403
    old_token = headers["X-CSRF-Token"]
    new_headers = admin_headers(client, '"1"')
    assert old_token != new_headers["X-CSRF-Token"]
    assert client.request(method, STUDIO, json=payload(True),
                          headers={**new_headers, "X-CSRF-Token": old_token}).status_code == 403
    assert profile_rows(client) == before


def test_if_match_required_and_stale_updates_do_not_mutate(client):
    headers = admin_headers(client)
    assert client.put(STUDIO, json=payload(), headers={**headers, "If-Match": '"1"'}).status_code == 404
    assert client.post(STUDIO, json=payload(), headers=headers).status_code == 201
    before = profile_rows(client)
    assert client.put(STUDIO, json=payload(True), headers=headers).status_code == 428
    for tag in ('1', '*', 'W/"1"', '"1", "2"', '"0"', '"01"', '"2"', '"-1"', '"2147483647"', '"' + '9' * 5000 + '"'):
        assert client.put(STUDIO, json=payload(True), headers={**headers, "If-Match": tag}).status_code == 409
    assert profile_rows(client) == before
    first = client.put(STUDIO, json=payload(True), headers={**headers, "If-Match": '"1"'})
    assert first.status_code == 200 and first.headers["etag"] == '"2"'
    after = profile_rows(client)
    assert client.put(STUDIO, json=payload(), headers={**headers, "If-Match": '"1"'}).status_code == 409
    assert profile_rows(client) == after
    assert client.get(PUBLIC).json()["version"] == 2


def test_concurrent_profile_updates_have_one_winner(client):
    headers = admin_headers(client, '"1"')
    assert client.post(STUDIO, json=payload(), headers=headers).status_code == 201
    barrier = Barrier(5)

    def save(index):
        body = payload(True)
        body["document"]["summary"] = f"Concurrent winner {index}"
        barrier.wait(timeout=10)
        return client.put(STUDIO, json=body, headers=headers)

    with ThreadPoolExecutor(max_workers=5) as pool:
        responses = list(pool.map(save, range(5)))
    assert sorted(response.status_code for response in responses) == [200, 409, 409, 409, 409]
    winner = next(response for response in responses if response.status_code == 200)
    assert winner.headers["etag"] == '"2"'
    assert client.get(STUDIO).json() == winner.json()
    assert client.get(PUBLIC).json()["profile"]["summary"] == winner.json()["document"]["summary"]
    assert len(profile_rows(client)) == 1 and profile_rows(client)[0][3] == 2


@pytest.mark.parametrize("method", ["POST", "PUT"])
def test_invalid_profile_documents_are_rejected_without_writes(client, method):
    headers = admin_headers(client, '"1"')
    if method == "PUT":
        assert client.post(STUDIO, json=payload(), headers=headers).status_code == 201
    before = profile_rows(client)
    mutations = [
        (("document", "schemaVersion"), 2), (("document", "schemaVersion"), True),
        (("document", "identity", "name"), "<script>bad</script>"),
        (("document", "summary"), "javascript:alert(1)"), (("document", "summary"), "www.example.invalid"),
        (("document", "summary"), "bad\x00text"), (("document", "identity", "name"), " "),
        (("document", "identity", "name"), "x" * 121), (("document", "contact", "email"), "bad email"),
        (("document", "contact", "linkedin"), "https://evil.invalid/in/example"),
        (("document", "contact", "website"), "http://example.invalid"), (("document", "contact", "website"), "https://example.invalid/<x>"),
        (("document", "experience", 0, "achievements"), ["x" * 501]), (("document", "experience", 0, "achievements"), ["a"] * 9),
        (("document", "interests"), "not a list"), (("document", "interests"), ["javascript:alert(1)"]),
        (("document", "skills", 0, "level"), True), (("document", "skills", 0, "level"), 6),
        (("document", "experience", 0, "start"), "2020-13"),
        (("document", "projects", 0, "id"), "Invalid Slug"),
        (("document", "privacy"), {"showPhone": "true"}),
        (("document", "narration", "strengths"), []),
        (("sourceSha256",), "A" * 64), (("sourceSha256",), "a" * 63), (("aiModel",), "x" * 129),
        (("document", "unexpected"), "private injection"), (("unexpected",), True),
    ]
    for path, value in mutations:
        body = payload(True)
        target = body
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value
        response = client.request(method, STUDIO, json=body, headers=headers)
        assert response.status_code == 422, (path, response.text)
    assert client.request(method, STUDIO, json={"document": {}}, headers=headers).status_code == 422
    assert profile_rows(client) == before


def test_profile_migration_upgrades_existing_data_and_is_idempotent(settings):
    engine = make_engine(settings.database_url)
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "0005_session_absolute_expiry")
        bootstrap(engine)
        with engine.connect() as connection:
            users = connection.execute(select(User.__table__)).all()
        assert "profiles" not in inspect(engine).get_table_names()
        migrate(engine)
        migrate(engine)
        inspector = inspect(engine)
        assert "profiles" in inspector.get_table_names()
        assert {column["name"] for column in inspector.get_columns("profiles")} == {
            "id", "entities", "is_public", "version", "source_sha256", "ai_model", "created_at", "updated_at", "updated_by"}
        assert any(key["constrained_columns"] == ["updated_by"] and key["referred_table"] == "users"
                   for key in inspector.get_foreign_keys("profiles"))
        assert any(check["name"] == "positive_profile_version" for check in inspector.get_check_constraints("profiles"))
        with engine.connect() as connection:
            assert connection.execute(select(User.__table__)).all() == users
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0006_profiles"
    finally:
        engine.dispose()
