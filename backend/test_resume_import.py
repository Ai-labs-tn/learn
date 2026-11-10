"""resume.md import: parsing, id preservation and the private data that must survive an import (synthetic data only)."""
import importlib.util
import json
from pathlib import Path

import pytest

from backend.profile.schema import ProfileDocument

SPEC = importlib.util.spec_from_file_location("profile_pipeline", Path(__file__).resolve().parents[1] / "scripts" / "profile_pipeline.py")
pipeline = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pipeline)

MARKDOWN = """<!-- a note that is ignored -->
# Example Person

Headline: Engineer · Builder
Titles: Builder | Engineer
Region: Example region
Domains: Education, Retail

## Contact

- Phone: 555 0100 00
- Email: person@example.invalid
- LinkedIn: https://www.linkedin.com/in/example-person
- Website: https://example.invalid/
- Address: 1 Example Street, Example city - 600001

## Profile

Example **summary** sentence one. Sentence two.

- First highlight.
- Second highlight.

## Experience

### Lead Engineer | Example Co | Example city | Jan 2020 - Present

- Shipped the thing.
- 

### Junior | Old Co | Old city | Mar 2015 - Dec 2019

- 

## Projects

### Example Project | Example Co | Education

Project summary line.

Tech: Python, Python, Postgres

- Developer: Built it end to end.

## Skills & Abilities

Primary: Python, SQL
Secondary: Go

### Backend

- Python | 5
- SQL/Postgres | 4

## Certifications

- Cert One | Issuer | Valid until Apr 2027
- Cert Two | Issuer

## Awards

- Star | Apr 2025 | Did a thing
- Star | Mar 09, 2022 | Did a dated thing
- Star |  | Did an older thing

## Education

### B.E. Example | Public University | Example city | Aug 2010 - Apr 2014

## Activities and Interests

- Chess
"""


def base_document():
    return {
        "schemaVersion": 1,
        "identity": {"name": "Old Name", "headline": "Old", "titles": ["Old"], "region": "Old region"},
        "contact": {"email": "old@example.invalid", "linkedin": "https://www.linkedin.com/in/old", "phone": "+1 555 000 0000", "address": "Private Address Marker"},
        "summary": "Old", "highlights": [], "skills": [{"name": "Old", "level": 1, "group": "Old"}],
        "certifications": [{"name": "Cert One", "issuer": "Issuer", "validUntil": "2027-04-22"}],
        "awards": [{"title": "Star", "date": "2025-04-15", "description": "Old text"}],
        "experience": [{"id": "example-co-old-id", "role": "Engineer", "company": "Example Co", "location": "x", "start": "2020-01", "achievements": []}],
        "education": [{"level": "B.E. Example", "institution": "Public University", "location": "x", "start": "2010-08", "end": "2014-04", "isSchool": False},
                      {"level": "School", "institution": "Private School Marker", "location": "x", "start": "2000-06", "end": "2010-03", "isSchool": True}],
        "projects": [{"id": "kept-project-id", "name": "Example Project", "domain": "x", "summary": "x", "techStack": ["x"], "roles": [{"title": "x", "description": "x"}]}],
        "domains": [], "interests": [],
        "references": [{"name": "Private Reference Marker", "title": "t", "company": "c", "email": "private-reference@example.invalid"}],
        "privacy": {"showPhone": True},
    }


def merged():
    return pipeline.merge_resume(pipeline.parse_resume_markdown(MARKDOWN), base_document())


def test_markdown_becomes_a_valid_profile_document():
    document = merged()
    ProfileDocument.model_validate(document)
    assert document["identity"]["titles"] == ["Builder", "Engineer"] and document["domains"] == ["Education", "Retail"]
    assert document["contact"]["phone"] == "555 0100 00" and document["contact"]["website"] == "https://example.invalid/"
    assert document["summary"] == "Example **summary** sentence one. Sentence two."
    assert document["highlights"] == ["First highlight.", "Second highlight."]
    assert [e["role"] for e in document["experience"]] == ["Lead Engineer", "Junior"]
    assert document["experience"][0]["achievements"] == ["Shipped the thing."] and document["experience"][1]["achievements"] == []
    assert "end" not in document["experience"][0] and document["experience"][1]["end"] == "2019-12"
    assert document["projects"][0]["techStack"] == ["Python", "Postgres"]
    assert document["projects"][0]["roles"] == [{"title": "Developer", "description": "Built it end to end."}]
    assert document["skills"] == [{"name": "Python", "level": 5, "group": "Backend"}, {"name": "SQL/Postgres", "level": 4, "group": "Backend"}]
    assert document["interests"] == ["Chess"]
    assert document["projects"][0]["company"] == "Example Co" and document["skillFocus"] == {"primary": ["Python", "SQL"], "secondary": ["Go"]}


def test_ids_dates_and_private_data_survive_an_import():
    document = merged()
    assert document["experience"][0]["id"] == "example-co-old-id"      # matched by company + start, not by title
    assert document["experience"][1]["id"] == "old-co-2015-03"          # new entries get a readable slug
    assert document["projects"][0]["id"] == "kept-project-id"
    assert document["certifications"][0]["validUntil"] == "2027-04-22"  # same month: the stored exact day is kept
    assert document["certifications"][1] == {"name": "Cert Two", "issuer": "Issuer"}
    assert document["awards"][0]["date"] == "2025-04-15" and document["awards"][1]["date"] == "2022-03-09" and "date" not in document["awards"][2]
    # The address is written in the file, so the owner chose to publish it; the stored private text is replaced.
    assert document["contact"]["address"] == "1 Example Street, Example city - 600001" and document["privacy"]["showAddress"] is True
    assert document["references"] == base_document()["references"]
    assert document["privacy"]["showPhone"] is True
    assert [(e["institution"], e["isSchool"]) for e in document["education"]] == [("Public University", False), ("Private School Marker", True)]


@pytest.mark.parametrize("edit,message", [
    (("### Lead Engineer | Example Co | Example city | Jan 2020 - Present", "### Lead Engineer | Example Co | Jan 2020 - Present"), "expected 4 parts"),
    (("Jan 2020 - Present", "sometime - Present"), "cannot read the start date"),
    (("- Developer: Built it end to end.", "- Built it end to end."), "must look like"),
    (("- Python | 5", "- Python"), "end each skill"),
    (("- Star | Apr 2025 | Did a thing", "- Star | Apr 2025"), "Title | Mon YYYY"),
])
def test_clear_errors_for_malformed_markdown(edit, message):
    with pytest.raises(SystemExit) as error:
        pipeline.parse_resume_markdown(MARKDOWN.replace(*edit))
    assert message in str(error.value)


def test_schema_limits_are_enforced_before_anything_is_sent():
    document = merged()
    document["projects"][0]["summary"] = "x" * 901
    with pytest.raises(Exception):
        ProfileDocument.model_validate(document)
    assert json.dumps(pipeline.without_nulls({"a": None, "b": [{"c": None, "d": 1}]})) == '{"b": [{"d": 1}]}'


def test_without_an_address_line_the_stored_address_stays_private():
    parsed = pipeline.parse_resume_markdown(MARKDOWN.replace("- Address: 1 Example Street, Example city - 600001\n", ""))
    document = pipeline.merge_resume(parsed, {**base_document(), "privacy": {"showPhone": True, "showAddress": True}})
    assert document["contact"]["address"] == "Private Address Marker" and document["privacy"]["showAddress"] is False
