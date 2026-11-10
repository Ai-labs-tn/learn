"""Strict profile document. Plain text only: no markup, no embedded URLs except named contact links."""
import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, field_validator

CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
YEAR_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
FULL_DATE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")
SLUG = re.compile(r"^[a-z][a-z0-9-]{0,63}$")


def plain(value: str) -> str:
    if "<" in value or ">" in value or CONTROL.search(value):
        raise ValueError("Plain text only: no markup or control characters")
    if re.search(r"(?i)(?:[a-z][a-z0-9+.-]*://|www\.|javascript:|data:|vbscript:)", value):
        raise ValueError("URLs are not allowed in descriptive text")
    return value


def text(maximum: int):
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=maximum), AfterValidator(plain)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Identity(Strict):
    name: text(120)
    headline: text(200)
    titles: Annotated[list[text(80)], Field(min_length=1, max_length=8)]
    region: text(120)


class Contact(Strict):
    email: Annotated[str, StringConstraints(max_length=254, pattern=r"^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$")]
    linkedin: Annotated[str, StringConstraints(max_length=300, pattern=r"^https://www\.linkedin\.com/in/[A-Za-z0-9\-_%]+/?$")]
    phone: Annotated[str, StringConstraints(pattern=r"^\+?[0-9 ()-]{6,20}$")] | None = None
    address: text(300) | None = None
    # The owner's own site; always public, like the email and LinkedIn links.
    website: Annotated[str, StringConstraints(max_length=200, pattern=r"^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/[A-Za-z0-9._~%/-]*)?$")] | None = None


class Skill(Strict):
    name: text(80)
    level: Annotated[int, Field(ge=1, le=5)]
    group: text(60)


class Certification(Strict):
    name: text(160)
    issuer: text(120)
    valid_until: Annotated[str, StringConstraints(pattern=FULL_DATE.pattern)] | None = Field(default=None, alias="validUntil")
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class Award(Strict):
    title: text(80)
    date: Annotated[str, StringConstraints(pattern=FULL_DATE.pattern)] | None = None
    description: text(600)


class Experience(Strict):
    id: Annotated[str, StringConstraints(pattern=SLUG.pattern)]
    role: text(120)
    company: text(120)
    location: text(120)
    start: Annotated[str, StringConstraints(pattern=YEAR_MONTH.pattern)]
    end: Annotated[str, StringConstraints(pattern=YEAR_MONTH.pattern)] | None = None
    achievements: Annotated[list[text(300)], Field(max_length=8)] = Field(default_factory=list)


class Education(Strict):
    level: text(60)
    institution: text(200)
    location: text(120)
    start: Annotated[str, StringConstraints(pattern=YEAR_MONTH.pattern)]
    end: Annotated[str, StringConstraints(pattern=YEAR_MONTH.pattern)]
    is_school: bool = Field(default=False, alias="isSchool")
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class Role(Strict):
    title: text(80)
    description: text(500)


class Project(Strict):
    id: Annotated[str, StringConstraints(pattern=SLUG.pattern)]
    name: text(80)
    domain: text(60)
    summary: text(900)
    short: text(200) | None = None   # owner-written one-liner used where space is tight
    company: text(120) | None = None  # employer the project was delivered for
    tech_stack: Annotated[list[text(60)], Field(min_length=1, max_length=40)] = Field(alias="techStack")
    roles: Annotated[list[Role], Field(min_length=1, max_length=10)]
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class SkillFocus(Strict):
    """What the owner wants noticed first: shown near the top of the resume."""
    primary: Annotated[list[text(40)], Field(max_length=10)] = Field(default_factory=list)
    secondary: Annotated[list[text(40)], Field(max_length=10)] = Field(default_factory=list)


class Reference(Strict):
    name: text(120)
    title: text(120)
    company: text(120)
    email: Annotated[str, StringConstraints(max_length=254)] | None = None
    phone: Annotated[str, StringConstraints(pattern=r"^\+?[0-9 ()-]{6,20}$")] | None = None


class Strength(Strict):
    title: text(80)
    text: text(400)


class Narration(Strict):
    """Written by the AI from the validated entities; reviewed by the owner before publishing."""
    tagline: text(160)
    elevator_pitch: text(700) = Field(alias="elevatorPitch")
    about: text(1600)
    career_story: text(2400) = Field(alias="careerStory")
    strengths: Annotated[list[Strength], Field(min_length=3, max_length=6)]
    project_stories: dict[Annotated[str, StringConstraints(pattern=SLUG.pattern)], text(500)] = Field(alias="projectStories")
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class Privacy(Strict):
    """What the public page may show. Everything is stored regardless; defaults are conservative."""
    show_phone: bool = Field(default=False, alias="showPhone")
    show_address: bool = Field(default=False, alias="showAddress")
    show_references: bool = Field(default=False, alias="showReferences")
    show_school_education: bool = Field(default=False, alias="showSchoolEducation")
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class ProfileDocument(Strict):
    """Entities, keyed by kind. Every kind is stored in the profile row's `entities` column."""
    schema_version: int = Field(alias="schemaVersion")
    identity: Identity
    contact: Contact
    summary: text(1500)
    highlights: Annotated[list[text(300)], Field(max_length=12)]
    skills: Annotated[list[Skill], Field(min_length=1, max_length=40)]
    certifications: Annotated[list[Certification], Field(max_length=20)]
    awards: Annotated[list[Award], Field(max_length=40)]
    experience: Annotated[list[Experience], Field(min_length=1, max_length=20)]
    education: Annotated[list[Education], Field(max_length=12)]
    projects: Annotated[list[Project], Field(max_length=30)]
    domains: Annotated[list[text(60)], Field(max_length=12)]
    interests: Annotated[list[text(120)], Field(max_length=12)] = Field(default_factory=list)
    skill_focus: SkillFocus | None = Field(default=None, alias="skillFocus")
    references: Annotated[list[Reference], Field(max_length=6)]
    narration: Narration | None = None
    privacy: Privacy = Field(default_factory=Privacy)
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)

    @field_validator("schema_version")
    @classmethod
    def known_version(cls, value: int) -> int:
        if value != 1:
            raise ValueError("Unsupported profile schema version")
        return value

    def stored(self) -> dict:
        return self.model_dump(by_alias=True, exclude_none=True)


def public_view(document: dict) -> dict:
    """The only projection the unauthenticated API may return. Honors the privacy flags."""
    privacy = document.get("privacy", {})
    view = {key: document[key] for key in (
        "schemaVersion", "identity", "summary", "highlights", "skills", "certifications", "awards",
        "experience", "projects", "domains", "interests", "skillFocus", "narration") if key in document}
    contact = {"email": document["contact"]["email"], "linkedin": document["contact"]["linkedin"]}
    if document["contact"].get("website"):
        contact["website"] = document["contact"]["website"]
    if privacy.get("showPhone") and document["contact"].get("phone"):
        contact["phone"] = document["contact"]["phone"]
    if privacy.get("showAddress") and document["contact"].get("address"):
        contact["address"] = document["contact"]["address"]
    view["contact"] = contact
    view["education"] = [item for item in document.get("education", [])
                         if privacy.get("showSchoolEducation") or not item.get("isSchool")]
    if privacy.get("showReferences"):
        view["references"] = document.get("references", [])
    return view
