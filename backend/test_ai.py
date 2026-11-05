"""Phase 5 AI-assisted authoring acceptance tests.

No test contacts a real provider: startup model verification is monkeypatched and
chat-completion traffic uses httpx.MockTransport with canned responses only.
"""
import json
import logging
from dataclasses import replace
from datetime import date, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import backend.ai.api as ai_api
import backend.ai.provider as provider
from backend.main import create_app
from backend.models import AiUsage, User
from backend.settings import DEFAULT_AI_MODELS, Settings
from backend.test_api import LOCAL_GUEST, ORIGIN, client, login, settings  # noqa: F401 (fixtures)

ASSIST = "/api/studio/ai/assist"
STATUS = "/api/studio/ai/status"
TEST_KEY = "local-test-only-openrouter-key"
SUGGESTION = "The CPU begins executing firmware instructions."
BODY = {"mode": "improve", "language": "en", "text": "Power arrives from the supply."}


def canned(content=SUGGESTION, calls=None):
    def handle(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}}]})
    return handle


def admin_headers(client):
    return {"Origin": ORIGIN, "X-CSRF-Token": login(client).json()["csrfToken"]}


def usage_rows(client):
    with client.app.state.sessions() as db:
        return db.scalars(select(AiUsage).order_by(AiUsage.id)).all()


@pytest.fixture
def ai_settings(settings, monkeypatch):
    # Startup catalogue verification is replaced; no network access happens in tests.
    monkeypatch.setattr(provider, "free_model_ids", lambda *args, **kwargs: set(DEFAULT_AI_MODELS))
    return replace(settings, open_router_api_key=TEST_KEY)


@pytest.fixture
def ai_client(ai_settings):
    with TestClient(create_app(ai_settings)) as value:
        yield value


def assist(client, body=BODY, headers=None):
    return client.post(ASSIST, json=body, headers=headers if headers is not None else admin_headers(client))


# --- Settings and startup configuration ---

def test_missing_key_disables_feature(monkeypatch):
    monkeypatch.delenv("OPEN_ROUTER_API_KEY", raising=False)
    config = Settings.from_env()
    assert config.open_router_api_key is None
    assert provider.configure_ai(config).enabled is False


def test_present_key_enables_feature(monkeypatch):
    monkeypatch.setenv("OPEN_ROUTER_API_KEY", TEST_KEY)
    monkeypatch.setattr(provider, "free_model_ids", lambda *args, **kwargs: set(DEFAULT_AI_MODELS))
    config = Settings.from_env()
    assert config.open_router_api_key == TEST_KEY
    assert provider.configure_ai(config).enabled is True


def test_models_env_parsing(monkeypatch):
    monkeypatch.setenv("LEARN_AI_MODELS", " vendor/one, vendor/two:free")
    assert Settings.from_env().ai_models == ("vendor/one", "vendor/two:free")
    monkeypatch.setenv("LEARN_AI_MODELS", "vendor/one,,vendor/two")
    with pytest.raises(ValueError, match="LEARN_AI_MODELS"):
        Settings.from_env()
    monkeypatch.delenv("LEARN_AI_MODELS")
    assert Settings.from_env().ai_models == DEFAULT_AI_MODELS


@pytest.mark.parametrize("values", [
    {"ai_daily_limit": 0}, {"ai_timeout_seconds": 0}, {"ai_max_output_chars": 0},
    {"ai_models": ()}, {"ai_models": ("vendor/one", "vendor/one")},
    {"ai_models": ("vendor/ one",)}, {"ai_models": ("x" * 129,)},
    {"open_router_api_key": " padded-key"}, {"open_router_api_key": "x" * 513},
])
def test_invalid_ai_settings(values):
    with pytest.raises(ValueError):
        Settings(environment="test", database_url="sqlite:///:memory:", **values)


def test_free_model_ids_keeps_only_zero_cost_models():
    def handle(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == provider.MODELS_URL
        return httpx.Response(200, json={"data": [
            {"id": "a/free", "pricing": {"prompt": "0", "completion": "0"}},
            {"id": "b/paid", "pricing": {"prompt": "0.001", "completion": "0"}},
            {"id": "c/no-pricing"},
            {"id": None},
        ]})
    free = provider.free_model_ids(TEST_KEY, 5, httpx.MockTransport(handle))
    assert free == {"a/free"}


def test_configure_ai_rejects_unknown_or_non_free_models():
    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [
            {"id": DEFAULT_AI_MODELS[0], "pricing": {"prompt": "0", "completion": "0"}}]})
    config = Settings(environment="test", database_url="sqlite:///:memory:",
                      open_router_api_key=TEST_KEY,
                      ai_models=(DEFAULT_AI_MODELS[0], "vendor/paid", "vendor/unknown"))
    with pytest.raises(ValueError, match="unknown or non-free"):
        provider.configure_ai(config, transport=httpx.MockTransport(handle))


def test_startup_fails_when_configured_model_is_not_free(ai_settings, monkeypatch):
    monkeypatch.setattr(provider, "free_model_ids", lambda *args, **kwargs: {"other/model:free"})
    with pytest.raises(ValueError, match="unknown or non-free"):
        with TestClient(create_app(ai_settings)):
            pass


# --- Endpoint authentication, CSRF and disabled behaviour ---

def test_assist_authentication_and_csrf(ai_client):
    mock = canned()
    ai_client.app.state.ai.transport = httpx.MockTransport(mock)
    assert ai_client.post(ASSIST, json=BODY).status_code == 401
    assert ai_client.get(STATUS).status_code == 401
    token = login(ai_client, "guest", LOCAL_GUEST).json()["csrfToken"]
    assert assist(ai_client, headers={"Origin": ORIGIN, "X-CSRF-Token": token}).status_code == 403
    assert ai_client.get(STATUS).status_code == 403
    token = login(ai_client).json()["csrfToken"]
    for headers in ({}, {"Origin": ORIGIN}, {"X-CSRF-Token": token},
                    {"Origin": ORIGIN, "X-CSRF-Token": "wrong"},
                    {"Origin": "https://evil.invalid", "X-CSRF-Token": token},
                    {"Origin": ORIGIN, "X-CSRF-Token": token, "Sec-Fetch-Site": "cross-site"}):
        assert assist(ai_client, headers=headers).status_code == 403
    assert usage_rows(ai_client) == []  # No provider call or usage row for denied requests.


def test_disabled_without_key_returns_503_and_never_fails_open(client):
    assert assist(client).status_code == 503
    assert "not configured" in client.post(ASSIST, json=BODY, headers=admin_headers(client)).json()["detail"]
    status = client.get(STATUS)
    assert status.status_code == 200
    assert status.json() == {"enabled": False, "models": list(DEFAULT_AI_MODELS), "remainingToday": 100}
    with client.app.state.sessions() as db:
        assert db.scalar(select(AiUsage)) is None


def test_studio_status_placeholder_unchanged(client):
    login(client)
    assert client.get("/api/studio/status").status_code == 200
    assert client.get("/api/studio/status").json() == {"status": "placeholder"}


# --- Strict body validation ---

INVALID_BODIES = [
    {}, {"mode": "improve"}, {"mode": "improve", "language": "en"},
    {"mode": "summarize", "language": "en", "text": "Power arrives."},
    {"mode": "improve", "language": "fr", "text": "Power arrives."},
    {"mode": "improve", "text": "Power arrives."},
    {"mode": 123, "language": "en", "text": "Power arrives."},
    {"mode": "improve", "language": "en", "text": 5},
    {"mode": "improve", "language": "en", "text": None},
    {"mode": "improve", "language": "en", "text": ""},
    {"mode": "improve", "language": "en", "text": " "},
    {"mode": "improve", "language": "en", "text": "x" * 4001},
    {"mode": "improve", "language": "en", "text": "Uses <b>markup</b>."},
    {"mode": "improve", "language": "en", "text": "See https://example.invalid for details."},
    {"mode": "improve", "language": "en", "text": "See www.example.invalid for details."},
    {"mode": "improve", "language": "en", "text": "javascript:alert(1)"},
    {"mode": "improve", "language": "en", "text": "data:text/plain,hello"},
    {"mode": "improve", "language": "en", "text": "bad\x00control"},
    {"mode": "improve", "language": "en", "text": "Power arrives.", "extra": 1},
    {"mode": "improve", "language": "en", "text": "Power arrives.", "maxBeats": 0},
    {"mode": "improve", "language": "en", "text": "Power arrives.", "maxBeats": 25},
    {"mode": "improve", "language": "en", "text": "Power arrives.", "maxBeats": "8"},
    {"mode": "improve", "language": "en", "text": "Power arrives.", "lessonTitle": None},
    {"mode": "improve", "language": "en", "text": "Power arrives.", "lessonTitle": "x" * 161},
    {"mode": "improve", "language": "en", "text": "Power arrives.", "lessonTitle": "Bad <title>"},
    {"mode": "improve", "language": "en", "text": "Power arrives.", "sceneContext": None},
    {"mode": "storyboard", "language": "en"},
    {"mode": "storyboard", "language": "en", "sceneContext": None},
    {"mode": "storyboard", "language": "en", "text": "Power arrives."},
    {"mode": "storyboard", "language": "en", "text": "Power arrives.",
     "sceneContext": {"title": "POST", "beats": [{"id": "b1", "narrationEn": "Checks begin."}]}},
    {"mode": "storyboard", "language": "en", "sceneContext": {}},
    {"mode": "storyboard", "language": "en", "sceneContext": {"beats": [{"id": "b1", "narrationEn": "Checks."}]}},
    {"mode": "storyboard", "language": "en", "sceneContext": {"title": "POST", "beats": []}},
    {"mode": "storyboard", "language": "en", "sceneContext": {"title": "POST", "beats": [
        {"id": f"beat-{n}", "narrationEn": "Step."} for n in range(25)]}},
    {"mode": "storyboard", "language": "en", "sceneContext": {"title": "POST", "beats": [
        {"id": "Bad-ID", "narrationEn": "Checks."}]}},
    {"mode": "storyboard", "language": "en", "sceneContext": {"title": "POST", "beats": [
        {"id": "b1", "narrationEn": "<script>"}]}},
    {"mode": "storyboard", "language": "en", "sceneContext": {"title": "POST", "beats": [
        {"id": "b1", "narrationEn": "x" * 2001}]}},
    {"mode": "storyboard", "language": "en", "sceneContext": {"title": "POST", "beats": [
        {"id": "b1", "narrationEn": "Checks.", "narrationTa": "சோதனை."}]}},
    {"mode": "storyboard", "language": "en", "sceneContext": {"title": "POST", "summary": None, "beats": [
        {"id": "b1", "narrationEn": "Checks."}]}},
    {"mode": "storyboard", "language": "en", "sceneContext": {"title": "POST", "summary": 5, "beats": [
        {"id": "b1", "narrationEn": "Checks."}]}},
    {"mode": "checkpoint", "language": "ta", "sceneContext": {"title": "POST", "beats": [
        {"id": "b1", "narrationEn": "Checks."}], "summary": "x" * 1001}},
]


@pytest.mark.parametrize("body", INVALID_BODIES)
def test_strict_body_validation(ai_client, body):
    ai_client.app.state.ai.transport = httpx.MockTransport(canned())
    assert assist(ai_client, body).status_code == 422
    assert usage_rows(ai_client) == []


# --- Successful assistance, provider contract and usage recording ---

def test_assist_success_contract_and_usage_row(ai_client):
    calls = []
    ai_client.app.state.ai.transport = httpx.MockTransport(canned(calls=calls))
    response = assist(ai_client)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"suggestion", "model", "requestId"}
    assert body["suggestion"] == SUGGESTION
    assert body["model"] == DEFAULT_AI_MODELS[0]
    request = calls[0]
    assert str(request.url) == provider.CHAT_URL
    assert request.headers["authorization"] == f"Bearer {TEST_KEY}"
    payload = json.loads(request.content)
    assert payload["model"] == DEFAULT_AI_MODELS[0]
    assert payload["temperature"] == 0.3
    assert payload["max_tokens"] == ai_api.derive_max_tokens(6000)
    assert [message["role"] for message in payload["messages"]] == ["system", "user"]
    assert "bilingual" in payload["messages"][0]["content"]
    assert "plain text" in payload["messages"][0]["content"]
    assert BODY["text"] in payload["messages"][1]["content"]
    assert "improve" in payload["messages"][1]["content"].lower() or "Rewrite" in payload["messages"][1]["content"]
    with ai_client.app.state.sessions() as db:
        row = db.scalar(select(AiUsage))
        assert row.mode == "improve" and row.status == "ok"
        assert row.model == DEFAULT_AI_MODELS[0]
        assert row.input_chars == len(BODY["text"]) and row.output_chars == len(SUGGESTION)
        assert row.actor_id == db.scalar(select(User.id).where(User.username == "admin"))
        assert row.occurred_at.endswith("Z")
        assert int(body["requestId"]) == row.id


def test_scene_context_modes_and_max_beats_prompt(ai_client):
    captured = {}

    def handle(request: httpx.Request) -> httpx.Response:
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "Focus the CPU."}}]})

    ai_client.app.state.ai.transport = httpx.MockTransport(handle)
    body = {"mode": "visual-suggestions", "language": "ta", "lessonTitle": "Power on",
            "sceneContext": {"title": "POST", "summary": "Checks begin.",
                             "beats": [{"id": f"beat-{n}", "narrationEn": f"Step {n}."} for n in range(10)]},
            "maxBeats": 3}
    response = assist(ai_client, body)
    assert response.status_code == 200, response.text
    content = captured["payload"]["messages"][1]["content"]
    assert "Tamil" in content and "Power on" in content and "POST" in content and "Checks begin." in content
    assert "beat-0" in content and "beat-2" in content
    assert "beat-3" not in content and "beat-9" not in content


def test_status_endpoint_counts_remaining(ai_client):
    ai_client.app.state.ai.transport = httpx.MockTransport(canned())
    login(ai_client)
    assert ai_client.get(STATUS).json() == {"enabled": True, "models": list(DEFAULT_AI_MODELS), "remainingToday": 100}
    assert assist(ai_client).status_code == 200
    assert ai_client.get(STATUS).json()["remainingToday"] == 99


# --- Provider failover, failure and output validation ---

@pytest.mark.parametrize("first_status", [402, 429, 404])
def test_failover_to_next_model(ai_client, first_status):
    attempts = []

    def handle(request: httpx.Request) -> httpx.Response:
        model = json.loads(request.content)["model"]
        attempts.append(model)
        if model == DEFAULT_AI_MODELS[0]:
            return httpx.Response(first_status, json={"error": {"message": "unavailable"}})
        if model == DEFAULT_AI_MODELS[1]:
            return httpx.Response(400, json={"error": {"message": "Model not found: deprecated"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": SUGGESTION}}]})

    ai_client.app.state.ai.transport = httpx.MockTransport(handle)
    response = assist(ai_client)
    assert response.status_code == 200, response.text
    assert response.json()["model"] == DEFAULT_AI_MODELS[2]
    assert attempts == list(DEFAULT_AI_MODELS)  # exactly one attempt per model, in order


def test_all_models_exhausted_returns_502_and_error_row(ai_client):
    attempts = []

    def handle(request: httpx.Request) -> httpx.Response:
        attempts.append(json.loads(request.content)["model"])
        return httpx.Response(429, json={"error": {"message": "rate limited"}})

    ai_client.app.state.ai.transport = httpx.MockTransport(handle)
    response = assist(ai_client)
    assert response.status_code == 502
    assert "unavailable" in response.json()["detail"]
    assert attempts == list(DEFAULT_AI_MODELS)
    rows = usage_rows(ai_client)
    assert [row.status for row in rows] == ["error"]


def test_non_retryable_status_returns_502_without_failover(ai_client):
    attempts = []

    def handle(request: httpx.Request) -> httpx.Response:
        attempts.append(json.loads(request.content)["model"])
        return httpx.Response(401, json={"error": {"message": "bad key"}})

    ai_client.app.state.ai.transport = httpx.MockTransport(handle)
    response = assist(ai_client)
    assert response.status_code == 502 and "HTTP 401" in response.json()["detail"]
    assert attempts == [DEFAULT_AI_MODELS[0]]


def test_timeout_returns_502_and_error_row(ai_client):
    def handle(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("simulated provider timeout")

    ai_client.app.state.ai.transport = httpx.MockTransport(handle)
    response = assist(ai_client)
    assert response.status_code == 502
    assert "timed out" in response.json()["detail"]
    rows = usage_rows(ai_client)
    assert [row.status for row in rows] == ["error"]


def test_malformed_and_empty_provider_responses(ai_client):
    for payload in ({"choices": []}, {"choices": [{"message": {}}]},
                    {"unexpected": True}, {"choices": [{"message": {"content": "   "}}]}):
        ai_client.app.state.ai.transport = httpx.MockTransport(
            lambda request, payload=payload: httpx.Response(200, json=payload))
        assert assist(ai_client).status_code == 502
    assert [row.status for row in usage_rows(ai_client)] == ["error"] * 4


@pytest.mark.parametrize("content", [
    "Read https://example.invalid now",
    "<script>alert(1)</script>",
    "bold with <b>tags</b>",
    "see www.example.invalid",
    "javascript:alert(1)",
    "data:text/plain,hello",
    "vbscript:msgbox",
    "x" * 6001,
])
def test_invalid_provider_output_rejected_as_blocked(ai_client, content):
    ai_client.app.state.ai.transport = httpx.MockTransport(canned(content))
    response = assist(ai_client)
    assert response.status_code == 502, content
    assert "rejected" in response.json()["detail"]
    rows = usage_rows(ai_client)
    assert [row.status for row in rows] == ["blocked"]
    assert rows[0].output_chars == 0
    # The rejected text must never be echoed back to the client.
    assert content[:20] not in response.text


def test_control_characters_stripped_from_output(ai_client):
    ai_client.app.state.ai.transport = httpx.MockTransport(canned("Power\x0b arrives.\x07"))
    response = assist(ai_client)
    assert response.status_code == 200
    assert response.json()["suggestion"] == "Power arrives."


def test_output_length_limit_configurable(ai_settings):
    with TestClient(create_app(replace(ai_settings, ai_max_output_chars=5))) as short:
        short.app.state.ai.transport = httpx.MockTransport(canned("A short reply."))
        assert assist(short).status_code == 502
        short.app.state.ai.transport = httpx.MockTransport(canned("Ok."))
        response = assist(short)
        assert response.status_code == 200 and response.json()["suggestion"] == "Ok."


# --- Daily budget with date injection ---

def test_daily_limit_enforced_and_resets_next_day(ai_settings, monkeypatch):
    config = replace(ai_settings, ai_daily_limit=1)
    with TestClient(create_app(config)) as client:
        calls = []
        client.app.state.ai.transport = httpx.MockTransport(canned(calls=calls))
        headers = admin_headers(client)
        first = client.post(ASSIST, json=BODY, headers=headers)
        assert first.status_code == 200, first.text
        second = client.post(ASSIST, json=BODY, headers=headers)
        assert second.status_code == 429
        assert "Daily AI request limit" in second.json()["detail"]
        assert "tomorrow" in second.json()["detail"]
        assert len(calls) == 1  # The over-limit request never reached the provider.
        assert client.get(STATUS).json()["remainingToday"] == 0
        rows = usage_rows(client)
        assert [row.status for row in rows] == ["ok", "blocked"]
        assert rows[1].output_chars == 0 and rows[1].model == ""
        # Provider errors do not consume budget, but successes do; fake next day.
        tomorrow = date.today() + timedelta(days=1)
        monkeypatch.setattr(ai_api, "today_utc", lambda: tomorrow)
        monkeypatch.setattr(ai_api, "timestamp", lambda: tomorrow.isoformat() + "T12:00:00.000Z")
        assert client.get(STATUS).json()["remainingToday"] == 1
        assert client.post(ASSIST, json=BODY, headers=headers).status_code == 200
        assert client.post(ASSIST, json=BODY, headers=headers).status_code == 429
        monkeypatch.undo()
        assert client.get(STATUS).json()["remainingToday"] == 0


def test_provider_error_does_not_consume_budget(ai_settings):
    config = replace(ai_settings, ai_daily_limit=1)
    with TestClient(create_app(config)) as client:
        def unavailable(request: httpx.Request) -> httpx.Response:
            return httpx.Response(402, json={"error": {"message": "no funds"}})

        client.app.state.ai.transport = httpx.MockTransport(unavailable)
        for _ in range(3):
            assert assist(client).status_code == 502
        rows = usage_rows(client)
        assert [row.status for row in rows] == ["error"] * 3
        assert client.get(STATUS).json()["remainingToday"] == 1


# --- Privacy: no key, prompt or response material in logs or stored rows ---

def test_logs_and_storage_contain_no_secrets_or_text(ai_client, caplog):
    caplog.set_level(logging.INFO, logger="backend.ai.api")
    marker = "Unique secret marker 7f3a for prompt privacy."
    ai_client.app.state.ai.transport = httpx.MockTransport(canned(SUGGESTION))
    body = {"mode": "review", "language": "en", "text": marker}
    success = assist(ai_client, body)
    assert success.status_code == 200

    def failing(request: httpx.Request) -> httpx.Response:
        return httpx.Response(402, json={"error": {"message": "no funds"}})

    ai_client.app.state.ai.transport = httpx.MockTransport(failing)
    failure = assist(ai_client, body)
    assert failure.status_code == 502

    captured = caplog.text + success.text + failure.text
    assert TEST_KEY not in captured
    assert marker not in caplog.text
    assert SUGGESTION not in caplog.text
    assert "mode=review" in caplog.text and "status=ok" in caplog.text and "status=error" in caplog.text
    assert "model=" in caplog.text and "input_chars=" in caplog.text and "output_chars=" in caplog.text

    with ai_client.app.state.sessions() as db:
        stored = db.scalars(select(AiUsage)).all()
        assert len(stored) == 2
        for row in stored:
            values = [str(value) for value in (row.id, row.actor_id, row.mode, row.model, row.status,
                                               row.input_chars, row.output_chars, row.occurred_at)]
            joined = " ".join(values)
            assert TEST_KEY not in joined and marker not in joined and SUGGESTION not in joined
            assert set(AiUsage.__table__.columns.keys()) == {
                "id", "actor_id", "mode", "model", "status", "input_chars", "output_chars", "occurred_at"}
