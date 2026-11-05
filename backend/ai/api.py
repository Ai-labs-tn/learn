"""Admin-only AI assistance endpoints. Suggestions are advisory plain text only."""
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field, field_validator, model_validator
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from backend.ai.provider import AiProviderError
from backend.auth import admin_only
from backend.content.schema import StrictModel, plain_text
from backend.content.store import timestamp
from backend.database import get_db
from backend.models import AiUsage, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/studio/ai", tags=["ai"])

MODES = ("improve", "review", "translate", "shorten", "visual-suggestions", "storyboard", "checkpoint")
TEXT_MODES = frozenset({"improve", "review", "shorten", "translate"})
CONTEXT_MODES = frozenset(MODES) - TEXT_MODES
CHARGED_STATUSES = ("ok", "blocked")

SYSTEM_PROMPT = (
    "You are an assistant for bilingual English and Tamil computer-science lesson authoring. "
    "You help teachers improve narration clarity, review technical accuracy, translate, shorten, "
    "storyboard scenes, suggest visual actions and draft checkpoint questions. Reply with plain "
    "text only: no HTML or other markup, no URLs or links, no code to execute and no structured "
    "JSON. Never claim to change anything; the administrator decides what to keep."
)

MODE_INSTRUCTIONS = {
    "improve": "Rewrite the supplied lesson text with clearer and technically accurate phrasing, "
               "preserving meaning and the original language.",
    "review": "Review the supplied lesson text for technical accuracy and clarity. List concrete, "
              "actionable issues; do not rewrite the text.",
    "translate": "Translate the supplied lesson text into the requested target language. Use natural "
                 "technical Tamil rather than transliteration when the target is Tamil.",
    "shorten": "Shorten the supplied lesson text while keeping every technical fact. Return only the "
               "shortened text.",
    "visual-suggestions": "For each supplied scene beat, suggest a plain-text visual action using only the "
                          "registered vocabulary: component boot-machine; focus power, firmware, cpu, ram, "
                          "storage or overview; actions focus, signal (with a registered directed pair) or "
                          "status (idle, checking, passed). One short line per beat.",
    "storyboard": "Draft a short plain-text storyboard for the supplied scene beats: beat id, one "
                  "narration-style sentence and a suggested visual action from the registered vocabulary.",
    "checkpoint": "Draft one prediction checkpoint question with expected and distractor answers in plain "
                  "text, based on the supplied scene beats.",
}

# Strip control characters (keeping tab/newline) before applying lesson text rules.
CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class BeatContext(StrictModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9-]*$")
    narrationEn: str = Field(min_length=1, max_length=2000)
    _plain = field_validator("narrationEn")(plain_text)


class SceneContext(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    beats: list[BeatContext] = Field(min_length=1, max_length=24)
    summary: str | None = Field(default=None, min_length=1, max_length=1000)
    _plain = field_validator("title")(plain_text)

    @model_validator(mode="after")
    def no_null_summary(self):
        if "summary" in self.model_fields_set:
            if self.summary is None:
                raise ValueError("Omit summary instead of supplying null")
            plain_text(self.summary)
        return self


class AssistRequest(StrictModel):
    mode: Literal["improve", "review", "translate", "shorten", "visual-suggestions", "storyboard", "checkpoint"]
    language: Literal["en", "ta"]
    text: str | None = Field(default=None, min_length=1, max_length=4000)
    sceneContext: SceneContext | None = None
    lessonTitle: str | None = Field(default=None, min_length=1, max_length=160)
    maxBeats: int = Field(default=8, ge=1, le=24)
    _plain_title = field_validator("lessonTitle")(lambda value: plain_text(value) if value is not None else value)
    _plain_text = field_validator("text")(lambda value: plain_text(value) if value is not None else value)

    @model_validator(mode="after")
    def mode_requirements(self):
        supplied = self.model_fields_set
        for key in ("text", "sceneContext", "lessonTitle"):
            if key in supplied and getattr(self, key) is None:
                raise ValueError(f"Omit {key} instead of supplying null")
        if self.mode in TEXT_MODES:
            if self.text is None:
                raise ValueError(f"mode {self.mode} requires text")
        else:
            if self.sceneContext is None:
                raise ValueError(f"mode {self.mode} requires sceneContext")
            if self.text is not None:
                raise ValueError(f"mode {self.mode} does not accept text")
        return self


def today_utc():
    return datetime.now(timezone.utc).date()


def daily_window(day):
    # occurred_at is a fixed-width UTC ISO-8601 string, so lexicographic bounds work.
    return day.isoformat() + "T", (day + timedelta(days=1)).isoformat() + "T"


def counted_usage(db, day):
    start, end = daily_window(day)
    return db.scalar(select(func.count()).select_from(AiUsage).where(
        AiUsage.occurred_at >= start, AiUsage.occurred_at < end,
        AiUsage.status.in_(CHARGED_STATUSES))) or 0


def input_size(body: AssistRequest):
    context = body.sceneContext
    return len(body.text or "") + len(body.lessonTitle or "") + (
        0 if context is None else len(context.title) + len(context.summary or "")
        + sum(len(beat.id) + len(beat.narrationEn) for beat in context.beats))


def reserve_slot(request: Request, user: User, body: AssistRequest, input_chars: int):
    """Atomic daily-budget gate.

    One locked transaction counts today's charged rows (ok + blocked) and appends
    this request's usage row. The row starts as 'blocked' so it counts for every
    concurrent worker immediately; the outcome transaction below moves it to
    'ok' or 'error'. A request over the limit keeps its 'blocked' row as the
    recorded denial and never reaches the provider. Failed provider calls are
    recorded as 'error' and do not consume budget.
    """
    settings = request.app.state.settings
    engine = request.app.state.engine
    start, end = daily_window(today_utc())
    with Session(engine) as gate:
        with gate.begin():
            if engine.dialect.name == "postgresql":
                gate.connection().exec_driver_sql("SELECT pg_advisory_xact_lock(714202604)")
            elif engine.dialect.name == "sqlite":
                gate.connection().exec_driver_sql("BEGIN IMMEDIATE")
            count = gate.scalar(select(func.count()).select_from(AiUsage).where(
                AiUsage.occurred_at >= start, AiUsage.occurred_at < end,
                AiUsage.status.in_(CHARGED_STATUSES))) or 0
            row = AiUsage(actor_id=user.id, mode=body.mode, model="", status="blocked",
                          input_chars=input_chars, output_chars=0, occurred_at=timestamp())
            gate.add(row)
            gate.flush()
            row_id = row.id
    if count >= settings.ai_daily_limit:
        raise HTTPException(429, "Daily AI request limit reached for this workspace; try again tomorrow")
    return row_id


def record_outcome(db: Session, row_id: int, status: str, model: str, output_chars: int):
    db.execute(update(AiUsage).where(AiUsage.id == row_id).values(
        status=status, model=model, output_chars=output_chars))
    db.commit()


def build_prompt(body: AssistRequest):
    language = "English" if body.language == "en" else "Tamil"
    lines = [MODE_INSTRUCTIONS[body.mode]]
    lines.append("Target language: " + language + ".")
    if body.lessonTitle:
        lines.append("Lesson title: " + body.lessonTitle)
    if body.sceneContext is not None:
        context = body.sceneContext
        lines.append("Scene title: " + context.title)
        if context.summary:
            lines.append("Scene summary: " + context.summary)
        for beat in context.beats[:body.maxBeats]:
            lines.append(f"Beat {beat.id}: {beat.narrationEn}")
    if body.text is not None:
        lines.append("Text to process:")
        lines.append(body.text)
    return "\n".join(lines)


def derive_max_tokens(max_output_chars):
    # Rough two-characters-per-token budget with headroom, bounded to provider limits.
    return max(200, min(8000, max_output_chars // 2 + 256))


def validate_output(text, max_chars):
    """Strip control characters, then enforce the lesson plain-text rules and length.
    Truncation with a notice is intentionally not allowed: reject instead."""
    cleaned = CONTROL_CHARACTERS.sub("", text)
    plain_text(cleaned)
    if len(cleaned) > max_chars:
        raise ValueError("output exceeds the configured maximum length")
    return cleaned


@router.get("/status", dependencies=[Depends(admin_only)])
def ai_status(request: Request, db: Session = Depends(get_db)):
    state = request.app.state.ai
    remaining = max(0, request.app.state.settings.ai_daily_limit - counted_usage(db, today_utc()))
    return {"enabled": state.enabled, "models": list(state.models), "remainingToday": remaining}


@router.post("/assist")
def assist(body: AssistRequest, request: Request, user: User = Depends(admin_only),
           db: Session = Depends(get_db)):
    state = request.app.state.ai
    if not state.enabled:
        # Never fail open: without a configured key the feature is unavailable.
        raise HTTPException(503, "AI assistance is not configured on this server")
    input_chars = input_size(body)
    row_id = reserve_slot(request, user, body, input_chars)
    try:
        raw, model = state.chat(SYSTEM_PROMPT, build_prompt(body),
                                derive_max_tokens(state.max_output_chars))
    except AiProviderError as error:
        record_outcome(db, row_id, "error", error.model, 0)
        logger.info("ai assist mode=%s model=%s status=error input_chars=%d output_chars=0",
                    body.mode, error.model, input_chars)
        raise HTTPException(502, error.detail)
    try:
        suggestion = validate_output(raw, state.max_output_chars)
    except ValueError:
        record_outcome(db, row_id, "blocked", model, 0)
        logger.info("ai assist mode=%s model=%s status=blocked input_chars=%d output_chars=0",
                    body.mode, model, input_chars)
        raise HTTPException(502, "The AI provider output violated plain-text lesson rules or the "
                                 "maximum length; it was rejected and nothing was applied")
    record_outcome(db, row_id, "ok", model, len(suggestion))
    logger.info("ai assist mode=%s model=%s status=ok input_chars=%d output_chars=%d",
                body.mode, model, input_chars, len(suggestion))
    # The suggestion is advisory only: no lesson, draft or publication is modified.
    return {"suggestion": suggestion, "model": model, "requestId": str(row_id)}
