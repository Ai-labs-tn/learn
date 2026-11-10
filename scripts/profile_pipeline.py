"""Resume -> classified profile entities -> AI narration -> admin API.

    python scripts/profile_pipeline.py extract  <resume.pdf>          # parse + ground-check
    python scripts/profile_pipeline.py narrate                        # AI narration (public-safe data only)
    python scripts/profile_pipeline.py push --base-url URL --password-env NAME [--public]
    python scripts/profile_pipeline.py snapshot --base-url URL        # public view -> src/portfolio
    python scripts/profile_pipeline.py set-privacy --base-url URL --password-env NAME --show-phone|--hide-phone

Outputs live in profile-build/ (git-ignored: it holds the private phone, address and references).
Nothing here connects to a database; `push` and `snapshot` talk to the HTTP API only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
BUILD = ROOT / "profile-build"

from backend.ai.provider import APP_HEADERS  # noqa: E402
from backend.profile.schema import Narration, ProfileDocument, public_view  # noqa: E402

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
HEADINGS = ["PROFESSIONAL SUMMARY", "AWARDS", "SKILLS", "CERTIFICATION", "HIGHLIGHTS", "CONTACT",
            "EXPERIENCE", "EDUCATION", "REFERENCES", "PROJECTS"]

# The resume draws skill proficiency as five dots; they are not in the PDF text layer. These values
# were read from the rendered page (filled dots out of five) and are editable in the admin API.
SKILL_LEVELS = {"GCP/Terraform": 4, "HLD/LLD": 4, "Java v21/Kotlin v3": 5, "Angular v16/Leaflet": 4,
                "Python/Fast API": 4, "Spring Boot v3.x": 5, "JPA/Hibernate": 5, "SQL/BigQuery": 4,
                "AI/LLM/RAG/Elastic": 5, "GeoSpatials/PostGIS": 5, "Git Actions/Jenkins": 5, "Maven/Gradle/Sonar": 5}
SKILL_GROUPS = {"GCP/Terraform": "Cloud & DevOps", "Git Actions/Jenkins": "Cloud & DevOps", "Maven/Gradle/Sonar": "Cloud & DevOps",
                "HLD/LLD": "Architecture", "Java v21/Kotlin v3": "Backend", "Spring Boot v3.x": "Backend",
                "JPA/Hibernate": "Backend", "Python/Fast API": "Backend", "Angular v16/Leaflet": "Frontend",
                "SQL/BigQuery": "Data & AI", "AI/LLM/RAG/Elastic": "Data & AI", "GeoSpatials/PostGIS": "Data & AI"}
# Domain per project, taken from each project's own description (insurance claims/enrolment, vehicles, senior living).
PROJECT_DOMAIN = {"DATA TRANSFORM & FINAL": "Automotive", "ATLAS": "Automotive", "INSIGHTS CATALOGUE": "Automotive",
                  "MAST": "Automotive", "DTS": "Automotive", "OSB (RETAIL & FLEET)": "Automotive",
                  "ECOS": "Insurance", "HAP DIGITAL": "Insurance", "HCSC-NDC": "Insurance", "CATIE": "Senior living"}
PROJECT_NAME = {"DATA TRANSFORM & FINAL": "Data Transform & Final", "INSIGHTS CATALOGUE": "Insights Catalogue",
                "OSB (RETAIL & FLEET)": "OSB (Retail & Fleet)", "HAP DIGITAL": "HAP Digital", "HCSC-NDC": "HCSC-NDC"}
TECH_CASE = {
    "java": "Java", "spring boot": "Spring Boot", "pgsql": "PostgreSQL", "azure": "Azure", "big query": "BigQuery",
    "git hub workflow": "GitHub Workflows", "gcp": "GCP", "cloud run": "Cloud Run", "cloudrun": "Cloud Run",
    "podman": "Podman", "docker": "Docker", "sonar": "Sonar", "fossa": "FOSSA", "42 crunch": "42Crunch",
    "apigee": "Apigee", "gradle": "Gradle", "jib": "Jib", "nexux": "Nexus", "jfrog": "JFrog", "angular": "Angular",
    "leaflet": "Leaflet", "jts": "JTS", "hibernate spatials": "Hibernate Spatial", "postgis": "PostGIS",
    "tekton": "Tekton", "terraform": "Terraform", "google artifact registry": "Google Artifact Registry",
    "dynatrace": "Dynatrace", "splunk": "Splunk", "jenkins": "Jenkins", "vue js": "Vue.js", "ms sql": "MS SQL Server",
    "pcf": "PCF", "soap": "SOAP", "rest": "REST", "maven": "Maven", "guidewire": "Guidewire", "jboss": "JBoss",
    "oracle": "Oracle", "scrum": "Scrum", "rally": "Rally", "git hub": "GitHub", "jax-ws": "JAX-WS", "jax-rs": "JAX-RS",
    "hibernate": "Hibernate", "spring": "Spring", "jersey": "Jersey", "struts": "Struts", "css3": "CSS3",
    "jquery": "jQuery", "drools": "Drools", "junit": "JUnit", "testng": "TestNG", "selenium": "Selenium",
    "jboss eap 7": "JBoss EAP 7", "open shift": "OpenShift", "kanban": "Kanban", "ant": "Ant",
    "ms sql server": "MS SQL Server", "serena dimensions": "Serena Dimensions", "web sphere 7": "WebSphere 7",
    "spring mvc": "Spring MVC", "asterisk-sip": "Asterisk SIP", "my sql 5.x": "MySQL 5.x", "svn": "SVN",
    "jboss 6.0 as": "JBoss 6.0 AS", "spring batch 4.x": "Spring Batch 4.x",
}
LOCATION_FIX = {"CH": "Chennai", "TN": "Tamil Nadu", "SRIVILLIPUTHUR": "Srivilliputhur"}
ARTIFACTS = {"t ransform": "transform", "micro -services": "micro-services", "micro -service": "micro-service",
             "lacks of records": "lakhs of records"}  # the resume itself says "lakhs" elsewhere
DEGREES = {"BE (CSE)": "B.E. Computer Science & Engineering", "HSC": "Higher Secondary (HSC)",
           "SSLC": "Secondary School (SSLC)", "PRIMARY": "Primary School"}


VOCAB: Counter[str] = Counter()
CASE_FIX = {"APIGEE": "Apigee", "SPRING + JERSEY": "Spring + Jersey", "STRUTS": "Struts", "JQUERY": "jQuery",
            "SERENA DIMESNSIONS": "Serena Dimensions", "VUE JS": "Vue.js", "GCP- Cloud Run": "GCP Cloud Run",
            "GCP-Cloud Run": "GCP Cloud Run"}
ROLE_FIX = {"Spring batch Developer": "Spring Batch Developer", "SCRUM/KANBAN Trained Professional": "Scrum/Kanban Trained Professional"}
ACRONYMS = {"dmi": "DMI", "hr": "HR", "e2": "E2", "hcsc-ndc": "HCSC-NDC"}
SPLIT_TECH = {"jenkins azure": ["Jenkins", "Azure"]}  # the resume omits a comma here


def repair_splits(value: str) -> str:
    """Join PDF word fragments ('a nd', 'ment or', 'Angula R') only when the joined word occurs
    intact elsewhere in the resume and at least one fragment is not itself a word there."""
    if not VOCAB:
        return value
    tokens = re.split(r"(\s+)", value)
    out: list[str] = []
    index = 0
    while index < len(tokens):
        word = tokens[index]
        if (index + 2 < len(tokens) and tokens[index + 1].isspace() and word.isalpha() and tokens[index + 2].isalpha()):
            nxt = tokens[index + 2]
            joined = (word + nxt).lower()
            # A real split leaves one rare fragment; two common words that merely sit side by side do not.
            if joined in VOCAB and min(VOCAB[word.lower()], VOCAB[nxt.lower()]) <= VOCAB[joined]:
                out.append(word + nxt)
                index += 3
                continue
        out.append(word)
        index += 1
    return "".join(out)


def clean(value: str) -> str:
    value = re.sub(r"[\uf0b7\uf0a7\u2022]", " ", value)
    value = value.replace("\ufffd", "\u2013").replace("\u2019", "\u2019")
    for bad, good in ARTIFACTS.items():
        value = value.replace(bad, good)
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\s+([,.;:)\u201d])", r"\1", value)
    value = re.sub(r"([(\u201c])\s+", r"\1", value)
    value = re.sub(r"(\w) -(\w)", r"\1-\2", value)
    value = repair_splits(value)
    for bad, good in CASE_FIX.items():
        value = value.replace(bad, good)
    return value


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def extract_pages(pdf: Path) -> list[str]:
    from pypdf import PdfReader
    return [page.extract_text() for page in PdfReader(str(pdf)).pages]


def split_sections(pages: list[str]) -> dict[str, str]:
    text = "\n".join(re.sub(r"^\s*\d+\s*\|\s*P\s*a\s*g\s*e\s*$", "", page, flags=re.M) for page in pages)
    pattern = re.compile(r"^\s*(" + "|".join(HEADINGS) + r")\s*$", re.M)
    marks = [(m.group(1), m.start(), m.end()) for m in pattern.finditer(text)]
    sections = {}
    for index, (name, _, end) in enumerate(marks):
        stop = marks[index + 1][1] if index + 1 < len(marks) else len(text)
        sections[name] = text[end:stop]
    sections["_header"] = text[:marks[0][1]]
    return sections


def month_year(label: str) -> str | None:
    label = label.strip()
    if label.lower() == "current":
        return None
    month, year = label.split()
    return f"{year}-{MONTHS[month[:3].lower()]:02d}"


def title(value: str) -> str:
    small = {"of", "and", "the", "for", "at"}
    out = []
    for index, word in enumerate(re.split(r"(\s+)", value.strip().lower())):
        if word.isspace() or not word:
            out.append(word)
        elif word in ACRONYMS:
            out.append(ACRONYMS[word])
        elif word in small and index:
            out.append(word)
        else:
            out.append(word[0].upper() + word[1:])
    return "".join(out)


def tech_label(token: str) -> str:
    base = clean(token).lower()
    if base in TECH_CASE:
        return TECH_CASE[base]
    match = re.match(r"^(.*?)\s+(v?\d[\w.x]*)$", base)
    if match and match.group(1) in TECH_CASE:
        return f"{TECH_CASE[match.group(1)]} {match.group(2).replace('.X', '.x')}"
    return title(base)


def parse_awards(block: str) -> list[dict]:
    awards = []
    for bullet in re.split(r"\uf0b7", block):
        bullet = clean(bullet)
        if not bullet:
            continue
        match = re.match(r"Received \u201c(.+?)\u201d award(?: on ([A-Za-z]{3,4} \d{1,2}, \d{4}))? for (.+)$", bullet)
        if not match:
            raise ValueError(f"Unparsed award: {bullet[:70]}")
        name, when, reason = match.groups()
        reason = re.sub(r"^the ", "", reason).strip().rstrip(".")
        date = None
        if when:
            parsed = datetime.strptime(when.title().replace("Sept", "Sep"), "%b %d, %Y")
            date = parsed.strftime("%Y-%m-%d")
        awards.append({"title": name.strip().replace("\u2019", "\u2019"), "date": date,
                       "description": reason[0].upper() + reason[1:] + "."})
    return awards


def parse_skills(block: str) -> list[dict]:
    names = [clean(line) for line in block.splitlines() if clean(line)]
    return [{"name": name, "level": SKILL_LEVELS[name], "group": SKILL_GROUPS[name]} for name in names]


def parse_experience(block: str) -> list[dict]:
    pattern = re.compile(r"^\s*([A-Z][a-z]{2} \d{4})\s*[\u2013\-\ufffd]\s*([A-Z][a-z]+(?: \d{4})?)\s*$", re.M)
    marks = list(pattern.finditer(block))
    items = []
    for index, mark in enumerate(marks):
        stop = marks[index + 1].start() if index + 1 < len(marks) else len(block)
        parts = [clean(p) for p in clean(block[mark.end():stop]).split("|")]
        role, company, place = parts[0], parts[1], [LOCATION_FIX.get(p.rstrip(".").upper(), title(p.rstrip("."))) for p in parts[2:]]
        items.append({"id": re.sub(r"[^a-z0-9]+", "-", company.lower()).strip("-"), "role": title(role), "company": title(company),
                      "location": ", ".join(place), "start": month_year(mark.group(1)), "end": month_year(mark.group(2))})
    return items


def parse_education(block: str) -> list[dict]:
    pattern = re.compile(r"^\s*([A-Z][a-z]{2} \d{4})\s*[\u2013\-\ufffd]\s*([A-Z][a-z]{2} \d{4})\s*$", re.M)
    marks = list(pattern.finditer(block))
    items = []
    for index, mark in enumerate(marks):
        stop = marks[index + 1].start() if index + 1 < len(marks) else len(block)
        level, rest = [clean(p) for p in clean(block[mark.end():stop]).split("|", 1)]
        institution, *place = [p.strip() for p in re.split(r",", rest)]
        places = [LOCATION_FIX.get(p.rstrip(".").upper(), title(p.rstrip("."))) for p in place if p.strip()]
        items.append({"level": DEGREES.get(level.upper(), title(level)), "institution": title(institution),
                      "location": ", ".join(places), "start": month_year(mark.group(1)), "end": month_year(mark.group(2)),
                      "isSchool": level.upper() != "BE (CSE)"})
    return items


def parse_references(block: str) -> list[dict]:
    refs = []
    for entry in re.split(r"(?m)^\s*\d+\.\s+", block):
        entry = clean(entry)
        if not entry:
            continue
        match = re.match(r"([A-Z ]+), ([A-Z ]+), ([A-Z ]+), Email: (\S+?), Ph\.: (\d+)\.?$", entry)
        if not match:
            raise ValueError(f"Unparsed reference: {entry[:50]}")
        name, role, company, email, phone = match.groups()
        refs.append({"name": title(name), "title": title(role), "company": title(company), "email": email, "phone": phone})
    return refs


def parse_projects(block: str) -> list[dict]:
    heading = re.compile(r"^\s*(\d{1,2})\.\s+([A-Z0-9][A-Z0-9 &()/\-]+?)\s*$", re.M)
    marks = list(heading.finditer(block))
    projects = []
    for index, mark in enumerate(marks):
        stop = marks[index + 1].start() if index + 1 < len(marks) else len(block)
        body = block[mark.end():stop]
        name = mark.group(2).strip()
        summary, _, rest = body.partition("Tech stack")
        tech, _, roles = rest.partition("Responsibilities")
        tech = re.sub(r"Roles\s*&\s*$", "", tech.strip())
        stack = []
        for raw in re.split(r",", clean(tech).rstrip(".")):
            if raw.strip():
                stack.extend(SPLIT_TECH.get(raw.strip().lower()) or [tech_label(raw)])
        items = [clean(x) for x in re.split(r"(?m)^\s*\d+\.\s+", roles) if clean(x)]
        if len(items) == 1 and not re.match(r"^[A-Za-z/ ]+ [-\u2013] ", items[0]):
            items = ["Pilot lead - " + items[0]]
        parsed_roles = []
        for item in items:
            pieces = re.split(r"\s[-\u2013]\s", item, maxsplit=1)
            role_title = ROLE_FIX.get(pieces[0].strip(), pieces[0].strip())
            parsed_roles.append({"title": role_title, "description": pieces[1].strip() if len(pieces) > 1 else pieces[0].strip()})
        projects.append({"id": re.sub(r"[^a-z0-9]+", "-", PROJECT_NAME.get(name, name).lower()).strip("-"),
                         "name": PROJECT_NAME.get(name, title(name) if name.isupper() and len(name) > 5 else name),
                         "domain": PROJECT_DOMAIN[name], "summary": clean(summary), "techStack": stack, "roles": parsed_roles})
    return projects


def build_document(pdf: Path) -> tuple[dict, str]:
    pages = extract_pages(pdf)
    source = "\n".join(pages)
    # Words that occur intact in the resume: used to repair PDF fragments like 'a nd' -> 'and'.
    VOCAB.clear()
    VOCAB.update(w.lower() for w in re.findall(r"[A-Za-z]+", source))
    sections = split_sections(pages)
    header_lines = [clean(line) for line in sections["_header"].splitlines() if clean(line)]
    name = next(line for line in header_lines if not re.search(r"P\s*a\s*g\s*e", line))
    # The title line sits after the last award bullet, before SKILLS (end of the AWARDS block).
    awards_block = sections["AWARDS"]
    tail = clean(awards_block.rsplit("\uf0b7", 1)[1]).split("Architect |", 1)
    titles = [p.strip() for p in ("Google Cloud Certified Professional Architect | " + tail[1]).split("|")] if len(tail) > 1 else []
    contact_lines = [clean(line) for line in sections["CONTACT"].splitlines() if clean(line)]
    phone = next(l for l in contact_lines if re.fullmatch(r"\d{10}", l))
    email = next(l for l in contact_lines if "@" in l)
    linkedin = clean("".join(l for l in sections["CONTACT"].splitlines() if "linkedin" in l or "manikandan" in l)).replace(" ", "")
    address = next(" ".join(contact_lines[contact_lines.index(l):]) for l in contact_lines if re.match(r"^\d+ [A-Z],", l))
    certifications = [
        {"name": "Google Cloud Certified Professional Cloud Architect", "issuer": "Google Cloud", "validUntil": "2027-04-22"},
        {"name": "Oracle Certified SQL & PL-SQL Developer", "issuer": "Oracle"},
    ]
    summary = clean(sections["PROFESSIONAL SUMMARY"])
    document = {
        "schemaVersion": 1,
        "identity": {"name": name, "headline": " \u00b7 ".join(reversed(titles[:3])) if titles else name,
                     "titles": [title(t) if t.isupper() else t for t in titles], "region": "Tamil Nadu, India"},
        "contact": {"email": email, "linkedin": linkedin, "phone": phone, "address": address},
        "summary": summary,
        "highlights": [clean(b) for b in sections["HIGHLIGHTS"].split("\uf0b7") if clean(b)],
        "skills": parse_skills(sections["SKILLS"]),
        "certifications": certifications,
        "awards": parse_awards(awards_block.rsplit("\uf0b7", 1)[0] + "\uf0b7" + awards_block.rsplit("\uf0b7", 1)[1].split("Google Cloud")[0]),
        "experience": parse_experience(sections["EXPERIENCE"]),
        "education": parse_education(sections["EDUCATION"]),
        "projects": parse_projects(sections["PROJECTS"]),
        "domains": [d for d in ("Insurance", "Automotive") if d.lower() in summary.lower()],
        "references": parse_references(sections["REFERENCES"]),
    }
    return document, source


def ground_check(document: dict, source: str) -> list[str]:
    """Every identifying fact must appear in the PDF text (whitespace/case/punctuation-insensitive)."""
    haystack = norm(source)
    missing: list[str] = []

    def need(label: str, value: str):
        if value and norm(value) not in haystack:
            missing.append(f"{label}: {value}")

    need("name", document["identity"]["name"])
    for key in ("email", "phone"):
        need(key, document["contact"][key])
    need("linkedin", document["contact"]["linkedin"].replace("https://", "").rstrip("/"))
    for skill in document["skills"]:
        need("skill", skill["name"])
    for award in document["awards"]:
        need("award", award["title"])
    for item in document["experience"]:
        need("company", item["company"])
        need("role", item["role"])
    for item in document["education"]:
        need("institution", item["institution"])
    for project in document["projects"]:
        need("project", project["name"] if not project["name"].startswith("Data") else "DATA TRANSFORM")
        for tech in project["techStack"]:
            need(f"tech[{project['id']}]", tech.replace("Nexus", "Nexux").replace("PostgreSQL", "PGSQL").replace("Hibernate Spatial", "Hibernate Spatials").replace("Cloud Run", "Cloud Run").replace("Apigee", "Apigee"))
    for ref in document["references"]:
        need("reference", ref["email"])
    return missing


def counts(document: dict) -> dict:
    return {key: len(value) for key, value in document.items() if isinstance(value, list)}


def command_extract(args) -> int:
    document, source = build_document(Path(args.pdf))
    problems = ground_check(document, source)
    ProfileDocument.model_validate(document)
    BUILD.mkdir(exist_ok=True)
    (BUILD / "entities.json").write_text(json.dumps(document, indent=2, ensure_ascii=False), encoding="utf-8")
    (BUILD / "source.sha256").write_text(hashlib.sha256(Path(args.pdf).read_bytes()).hexdigest(), encoding="utf-8")
    print(json.dumps({"entities": counts(document), "ungrounded": problems}, indent=2, ensure_ascii=False))
    return 1 if problems else 0


def free_models(key: str) -> list[str]:
    import httpx
    catalogue = httpx.get("https://openrouter.ai/api/v1/models", headers={"Authorization": f"Bearer {key}"}, timeout=30).json()["data"]
    free = {m["id"] for m in catalogue if float(m.get("pricing", {}).get("prompt", 1) or 1) == 0
            and float(m.get("pricing", {}).get("completion", 1) or 1) == 0}
    preferred = ["google/gemma-4-31b-it:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "google/gemma-4-26b-a4b-it:free",
                 "nvidia/nemotron-3.5-super-vl:free", "openrouter/free"]
    return [m for m in preferred if m in free]


def read_key(env_file: Path) -> str:
    # Read exactly one variable: never export a whole env file into the process environment.
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.startswith("OPEN_ROUTER_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("OPEN_ROUTER_API_KEY not found")


NARRATION_PROMPT = """You are writing the public portfolio narration for the engineer described by the JSON below.
Write in the first person only inside "about"; elsewhere write in the third person. Use only facts present in the JSON.
Never invent employers, numbers, technologies, awards or dates. Say "over a decade" instead of an exact number of years.
Plain text only: no markdown, no HTML, no URLs. Return ONLY one JSON object with exactly these keys:
tagline (<=150 chars), elevatorPitch (<=650 chars), about (<=1500 chars, first person, warm and professional),
careerStory (<=2200 chars, chronological narrative across the companies in "experience"),
strengths (4 to 6 objects with title (<=60 chars) and text (<=350 chars)),
projectStories (an object keyed by every project id in the JSON, each value <=450 chars describing impact and the engineer's role).
JSON:
"""


def public_safe(document: dict) -> dict:
    safe = {k: v for k, v in document.items() if k not in ("references",)}
    safe["contact"] = {"note": "withheld"}
    return safe


def command_narrate(args) -> int:
    import httpx
    document = json.loads((BUILD / "entities.json").read_text(encoding="utf-8"))
    key = read_key(Path(args.env_file))
    source_numbers = set(re.findall(r"\d+(?:\.\d+)?", json.dumps(document)))
    attempts: list[str] = []
    last_error = "no model attempted"
    for model in free_models(key):
        for attempt in range(2):  # a free model that is rate-limited often recovers within seconds
            response = httpx.post("https://openrouter.ai/api/v1/chat/completions", timeout=240,
                                  headers={"Authorization": f"Bearer {key}", **APP_HEADERS},
                                  json={"model": model, "temperature": 0.4, "max_tokens": 4000,
                                        "messages": [{"role": "user", "content": NARRATION_PROMPT + json.dumps(public_safe(document), ensure_ascii=False)}]})
            if response.status_code != 429 or attempt:
                break
            time.sleep(25)
        if response.status_code != 200:
            last_error = f"{model}: HTTP {response.status_code}"
            attempts.append(last_error)
            continue
        message = response.json()["choices"][0]["message"]
        # Reasoning models may leave `content` empty and answer in `reasoning`; accept either.
        content = message.get("content") or message.get("reasoning") or ""
        (BUILD / "last-response.txt").write_text(f"model={model}\nfinish={response.json()['choices'][0].get('finish_reason')}\n{content[:1500]}", encoding="utf-8")
        match = re.search(r"\{.*\}", content, re.S)
        try:
            narration = Narration.model_validate(json.loads(match.group(0)) if match else {})
        except Exception as error:  # invalid JSON or schema: try the next free model
            last_error = f"{model}: {str(error)[:160]}"
            attempts.append(last_error)
            continue
        dump = narration.model_dump(by_alias=True)
        invented = sorted(set(re.findall(r"\d+(?:\.\d+)?", json.dumps(dump))) - source_numbers)
        missing_projects = sorted({p["id"] for p in document["projects"]} - set(dump["projectStories"]))
        if invented or missing_projects:
            last_error = f"{model}: invented numbers {invented} / missing project stories {missing_projects}"
            attempts.append(last_error)
            continue
        (BUILD / "narration.json").write_text(json.dumps({"model": model, "narration": dump}, indent=2, ensure_ascii=False), encoding="utf-8")
        print(json.dumps({"model": model, "tagline": dump["tagline"], "strengths": [s["title"] for s in dump["strengths"]]}, ensure_ascii=False))
        return 0
    print("narration failed. attempts:")
    print("\n".join(attempts) or last_error)
    return 1


def strong_etag(value: str) -> str:
    """Proxies may weaken an ETag to W/"1"; the API compares the plain quoted version."""
    return value[2:] if value.startswith("W/") else value


def api(client, method: str, path: str, **kwargs):
    return client.request(method, path, **kwargs)


def command_push(args) -> int:
    import httpx
    document = json.loads((BUILD / "entities.json").read_text(encoding="utf-8"))
    narration_file = BUILD / "narration.json"
    # Narration is optional: until the AI step succeeds the page falls back to the resume summary.
    narration = json.loads(narration_file.read_text(encoding="utf-8")) if narration_file.exists() else {"model": None, "narration": None}
    if narration["narration"]:
        document["narration"] = narration["narration"]
    ProfileDocument.model_validate(document)
    password = os.environ.get(args.password_env, "")
    if not password:
        raise SystemExit(f"Set the {args.password_env} environment variable (never pass passwords on the command line)")
    origin = args.base_url.rstrip("/")
    body = {"document": document, "isPublic": args.public, "sourceSha256": (BUILD / "source.sha256").read_text(encoding="utf-8")}
    if narration["model"]:
        body["aiModel"] = narration["model"]
    with httpx.Client(base_url=origin, timeout=120) as client:
        login = client.post("/api/auth/login", json={"username": "admin", "password": password}, headers={"Origin": origin})
        login.raise_for_status()
        headers = {"Origin": origin, "X-CSRF-Token": login.json()["csrfToken"]}
        existing = client.get("/api/studio/profile")
        if existing.status_code == 404:
            result = client.post("/api/studio/profile", json=body, headers=headers)
        else:
            # A refresh from a new resume must not silently hide what the owner chose to publish.
            document["privacy"] = {**document.get("privacy", {}), **existing.json()["document"].get("privacy", {})}
            ProfileDocument.model_validate(document)
            result = client.put("/api/studio/profile", json=body, headers={**headers, "If-Match": strong_etag(existing.headers["etag"])})
        print(result.status_code, json.dumps({k: v for k, v in result.json().items() if k != "document"}) if result.status_code < 300 else result.text[:400])
        client.post("/api/auth/logout", headers=headers)
        return 0 if result.status_code < 300 else 1


def command_privacy(args) -> int:
    """Change only the public-visibility switches of the live profile; every other field is left as stored."""
    import httpx
    flags = {"showPhone": args.show_phone}
    flags = {key: value for key, value in flags.items() if value is not None}
    if not flags:
        raise SystemExit("Nothing to change: pass --show-phone or --hide-phone")
    password = os.environ.get(args.password_env, "")
    if not password:
        raise SystemExit(f"Set the {args.password_env} environment variable (never pass passwords on the command line)")
    origin = args.base_url.rstrip("/")
    with httpx.Client(base_url=origin, timeout=120) as client:
        login = client.post("/api/auth/login", json={"username": "admin", "password": password}, headers={"Origin": origin})
        login.raise_for_status()
        headers = {"Origin": origin, "X-CSRF-Token": login.json()["csrfToken"]}
        try:
            current = client.get("/api/studio/profile")
            current.raise_for_status()
            stored = current.json()
            document = stored["document"]
            if flags.get("showPhone") and not document["contact"].get("phone"):
                local = json.loads((BUILD / "entities.json").read_text(encoding="utf-8"))
                document["contact"]["phone"] = local["contact"]["phone"]
            document["privacy"] = {**document.get("privacy", {}), **flags}
            ProfileDocument.model_validate(document)
            body = {"document": document, "isPublic": stored["isPublic"]}
            for key in ("sourceSha256", "aiModel"):
                if stored.get(key):
                    body[key] = stored[key]
            result = client.put("/api/studio/profile", json=body, headers={**headers, "If-Match": strong_etag(current.headers["etag"])})
            print(result.status_code, json.dumps({k: v for k, v in result.json().items() if k != "document"}) if result.status_code < 300 else result.text[:400])
            return 0 if result.status_code < 300 else 1
        finally:
            client.post("/api/auth/logout", headers=headers)


def command_snapshot(args) -> int:
    target = ROOT / "src" / "portfolio" / "profile.snapshot.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    if args.from_build:
        # Local preview only: the same public projection the API serves, built from profile-build/.
        document = json.loads((BUILD / "entities.json").read_text(encoding="utf-8"))
        narration = BUILD / "narration.json"
        if narration.exists():
            document["narration"] = json.loads(narration.read_text(encoding="utf-8"))["narration"]
        payload = {"profileId": "local-preview", "version": 0, "updatedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "profile": public_view(document)}
    else:
        if not args.base_url:
            raise SystemExit("snapshot requires --base-url or --from-build")
        import httpx
        response = httpx.get(args.base_url.rstrip("/") + "/api/profile", timeout=120)
        response.raise_for_status()
        payload = response.json()
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print("snapshot written:", target.relative_to(ROOT), "sections:", sorted(payload["profile"]))
    return 0


def command_check_privacy(_args) -> int:
    document = json.loads((BUILD / "entities.json").read_text(encoding="utf-8"))
    narration = BUILD / "narration.json"
    if narration.exists():
        document["narration"] = json.loads(narration.read_text(encoding="utf-8"))["narration"]
    exposed = json.dumps(public_view(document), ensure_ascii=False)
    # The owner may publish the phone number; the address and the references always stay private.
    phone_public = bool(document.get("privacy", {}).get("showPhone"))
    private = ([] if phone_public else [document["contact"]["phone"]]) + [document["contact"]["address"][:12]] + [r["phone"] for r in document["references"]] + [r["email"] for r in document["references"]]
    leaks = [value for value in private if value and value in exposed]
    print("privacy leaks:", leaks or "none")
    return 1 if leaks else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    extract = sub.add_parser("extract"); extract.add_argument("pdf"); extract.set_defaults(run=command_extract)
    narrate = sub.add_parser("narrate"); narrate.add_argument("--env-file", default=str(ROOT / ".env.render")); narrate.set_defaults(run=command_narrate)
    push = sub.add_parser("push"); push.add_argument("--base-url", required=True); push.add_argument("--password-env", required=True)
    push.add_argument("--public", action="store_true"); push.set_defaults(run=command_push)
    snap = sub.add_parser("snapshot"); snap.add_argument("--base-url"); snap.add_argument("--from-build", action="store_true")
    snap.set_defaults(run=command_snapshot)
    sub.add_parser("check-privacy").set_defaults(run=command_check_privacy)
    privacy = sub.add_parser("set-privacy", help="Show or hide the phone number on the live public profile")
    privacy.add_argument("--base-url", required=True); privacy.add_argument("--password-env", required=True)
    shown = privacy.add_mutually_exclusive_group(required=True)
    shown.add_argument("--show-phone", dest="show_phone", action="store_const", const=True)
    shown.add_argument("--hide-phone", dest="show_phone", action="store_const", const=False)
    privacy.set_defaults(run=command_privacy)
    args = parser.parse_args()
    return args.run(args)


if __name__ == "__main__":
    raise SystemExit(main())
