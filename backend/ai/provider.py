"""OpenRouter provider access. Credentials stay server-side and out of every log."""
import httpx

MODELS_URL = "https://openrouter.ai/api/v1/models"
CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
# Optional OpenRouter attribution headers: without them this app's traffic shows up as "Unknown".
APP_HEADERS = {"HTTP-Referer": "https://learn-with-saravana.onrender.com", "X-Title": "Learn with Saravana"}


class AiProviderError(Exception):
    """Provider-side failure surfaced to the API as a 502 with a clear message."""

    def __init__(self, detail, model=""):
        super().__init__(detail)
        self.detail = detail
        self.model = model


def _is_free(entry):
    pricing = entry.get("pricing") or {}
    try:
        return float(pricing.get("prompt", "1")) == 0.0 and float(pricing.get("completion", "1")) == 0.0
    except (TypeError, ValueError):
        return False


def free_model_ids(api_key, timeout, transport=None):
    """Fetch the provider catalogue once and return only zero-cost model ids."""
    try:
        with httpx.Client(timeout=timeout, transport=transport) as client:
            response = client.get(MODELS_URL, headers={"Authorization": f"Bearer {api_key}", **APP_HEADERS})
    except httpx.HTTPError as error:
        raise ValueError("Could not verify AI model pricing with the provider at startup") from error
    if response.status_code != 200:
        raise ValueError(f"Could not verify AI model pricing with the provider at startup (HTTP {response.status_code})")
    try:
        data = response.json()
    except ValueError as error:
        raise ValueError("The AI model catalogue was not valid JSON") from error
    return {entry.get("id") for entry in data.get("data", [])
            if isinstance(entry, dict) and isinstance(entry.get("id"), str) and _is_free(entry)}


def _retryable_status(status_code, body):
    # Budget/quota exhaustion and model unavailability fall through to the next
    # configured model. Every other status fails immediately with 502: a single
    # attempt per model, never a blanket retry loop.
    if status_code in (402, 429, 404):
        return True
    lowered = body.lower()
    return status_code == 400 and "model" in lowered and "not found" in lowered


class AiFeature:
    """Runtime AI state attached to app.state.ai; transport is injectable for tests."""

    def __init__(self, settings, free_models=None, transport=None):
        self.api_key = settings.open_router_api_key
        self.models = list(settings.ai_models)
        self.daily_limit = settings.ai_daily_limit
        self.timeout_seconds = settings.ai_timeout_seconds
        self.max_output_chars = settings.ai_max_output_chars
        self.free_models = free_models
        self.transport = transport

    @property
    def enabled(self):
        return bool(self.api_key)

    def chat(self, system_prompt, user_prompt, max_tokens):
        """One POST per model in configured order; returns (text, model)."""
        if not self.enabled:
            raise AiProviderError("AI assistance is not configured")
        attempted = ""
        for model in self.models:
            attempted = model
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "max_tokens": max_tokens,
                "temperature": 0.3,
            }
            try:
                with httpx.Client(timeout=self.timeout_seconds, transport=self.transport) as client:
                    response = client.post(CHAT_URL, headers={"Authorization": f"Bearer {self.api_key}", **APP_HEADERS},
                                           json=payload)
            except httpx.HTTPError:
                raise AiProviderError("The AI provider timed out or could not be reached", model)
            if response.status_code == 200:
                try:
                    content = response.json()["choices"][0]["message"]["content"]
                except (ValueError, KeyError, IndexError, TypeError):
                    raise AiProviderError("The AI provider returned a malformed response", model)
                if not isinstance(content, str) or not content.strip():
                    raise AiProviderError("The AI provider returned empty output", model)
                return content, model
            if not _retryable_status(response.status_code, response.text):
                raise AiProviderError(
                    f"The AI provider rejected the request with HTTP {response.status_code}", model)
        raise AiProviderError("Every configured AI model is currently unavailable", attempted)


def configure_ai(settings, transport=None):
    """Startup wiring. Absent key disables the feature; a present key must verify
    that every configured model is known to the provider and free of charge."""
    if not settings.open_router_api_key:
        return AiFeature(settings, free_models=None, transport=transport)
    free = free_model_ids(settings.open_router_api_key, settings.ai_timeout_seconds, transport)
    rejected = [model for model in settings.ai_models if model not in free]
    if rejected:
        raise ValueError("LEARN_AI_MODELS contains unknown or non-free models: " + ", ".join(rejected))
    return AiFeature(settings, free_models=free, transport=transport)
