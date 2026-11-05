"""Version 1 data-only lesson contract. Keep README.md in sync."""
import json
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

StableId = Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9-]*$")]
Part = Literal["power", "firmware", "cpu", "ram", "storage"]
Focus = Literal["power", "firmware", "cpu", "ram", "storage", "overview"]
SIGNALS = {("power", "firmware"), ("power", "cpu"), ("firmware", "cpu"),
           ("cpu", "ram"), ("ram", "cpu"), ("storage", "ram"),
           ("cpu", "storage"), ("storage", "cpu"), ("cpu", "firmware")}


def plain_text(value: str) -> str:
    if not value.strip():
        raise ValueError("Text must not be blank")
    if any(ord(c) < 32 and c not in "\n\t" for c in value) or "\x7f" in value:
        raise ValueError("Control characters are not supported")
    if re.search(r"[<>]|\b[a-z][a-z0-9+.-]*://|\b(?:javascript|data|vbscript):|\bwww\.", value, re.I):
        raise ValueError("Only plain text is supported; no markup, scripts or URLs")
    return value


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Narration(StrictModel):
    en: str = Field(min_length=1, max_length=2000)
    ta: str = Field(min_length=1, max_length=2000)
    _text = field_validator("en", "ta")(plain_text)


class Captions(StrictModel):
    en: str | None = Field(default=None, min_length=1, max_length=2000)
    ta: str | None = Field(default=None, min_length=1, max_length=2000)

    @model_validator(mode="after")
    def validate_overrides(self):
        if not self.model_fields_set or any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("Captions require at least one non-null language override")
        for key in self.model_fields_set:
            plain_text(getattr(self, key))
        return self


class Visual(StrictModel):
    component: Literal["boot-machine"]
    focus: Focus
    action: Literal["focus", "signal", "status"]
    from_: Part | None = Field(default=None, alias="from")
    to: Part | None = None
    status: Literal["idle", "checking", "passed"] | None = None

    @model_validator(mode="after")
    def registered_combination(self):
        supplied = self.model_fields_set
        if self.action == "focus":
            if supplied & {"from_", "to", "status"}:
                raise ValueError("focus has no from, to or status")
        elif self.action == "signal":
            if "status" in supplied or (self.from_, self.to) not in SIGNALS:
                raise ValueError("signal requires a registered directed from/to pair and no status")
            if self.focus not in {self.from_, self.to}:
                raise ValueError("signal focus must be one of its endpoints")
        elif self.focus == "overview" or self.status is None or supplied & {"from_", "to"}:
            raise ValueError("status requires a physical focus and status, without from/to")
        return self


class Beat(StrictModel):
    id: StableId
    narration: Narration
    captions: Captions | None = None
    visual: Visual

    @model_validator(mode="after")
    def no_null_captions(self):
        if "captions" in self.model_fields_set and self.captions is None:
            raise ValueError("Omit captions instead of supplying null")
        return self


class Scene(StrictModel):
    id: StableId
    title: str = Field(min_length=1, max_length=160)
    beats: list[Beat] = Field(min_length=1, max_length=24)
    _text = field_validator("title")(plain_text)


class LessonDocument(StrictModel):
    schemaVersion: Literal[1]
    id: StableId
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=1000)
    scenes: list[Scene] = Field(min_length=1, max_length=12)
    _text = field_validator("title", "description")(plain_text)

    @field_validator("schemaVersion", mode="before")
    @classmethod
    def exact_version(cls, value):
        if type(value) is not int or value != 1:
            raise ValueError("Unsupported schemaVersion; expected integer 1")
        return value

    @model_validator(mode="after")
    def bounded_unique_document(self):
        ids = [self.id]
        count = 0
        for scene in self.scenes:
            ids.append(scene.id)
            ids.extend(beat.id for beat in scene.beats)
            count += len(scene.beats)
        if len(set(ids)) != len(ids):
            raise ValueError("Lesson, scene and beat IDs must be unique throughout the document")
        if count > 120:
            raise ValueError("A lesson supports at most 120 beats")
        if len(json.dumps(self.model_dump(by_alias=True, exclude_none=True), ensure_ascii=False).encode("utf-8")) > 262144:
            raise ValueError("Lesson exceeds 256 KiB serialized UTF-8 limit")
        return self

    def document(self):
        return self.model_dump(by_alias=True, exclude_none=True)
