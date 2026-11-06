"""Inline captions reuse the real lesson store; never seed or change the old boot pilot."""
from copy import deepcopy
from pathlib import Path

import pytest

from backend.content.schema import LessonDocument
from backend.test_api import client, settings  # noqa: F401
from backend.test_content import content_client, content_settings, edit_headers  # noqa: F401

ROOT = '/api/studio/lessons'
ID = 'boot-whiteboard'
DRAFT = f'{ROOT}/{ID}/draft'
PUBLIC = f'/api/lessons/{ID}'


def baseline():
    return LessonDocument.model_validate_json(
        (Path(__file__).resolve().parents[1] / 'src/captions/boot-whiteboard.v1.json').read_text(encoding='utf-8')
    ).document()


def test_baseline_is_valid_and_ids_stable():
    doc = baseline()
    assert doc['id'] == ID
    assert [beat['id'] for beat in doc['scenes'][0]['beats']] == [
        'power', 'cpu-wake', 'firmware', 'post', 'boot-device', 'bootloader', 'kernel-load',
        'kernel-takeover', 'hardware', 'user-space', 'services', 'gui', 'login', 'desktop', 'launch', 'running',
    ]


def test_inline_caption_save_publish_isolated_and_optimistic(content_client):
    http = content_client
    old_pilot = http.get('/api/lessons/boot-pilot')
    headers = edit_headers(http)
    old_pilot = http.get('/api/lessons/boot-pilot').json()
    assert http.get(PUBLIC).status_code == 404
    doc = baseline()
    created = http.post(ROOT, headers=headers, json=doc)
    assert created.status_code == 201
    assert http.get(PUBLIC).status_code == 404  # draft is not a publication
    changed = deepcopy(doc)
    changed['scenes'][0]['beats'][0]['narration']['ta'] = 'மின்சாரம் நிலையானதும் தொடக்கம் நடைபெறுகிறது.'
    saved = http.put(DRAFT, headers=headers, json=changed)
    assert saved.status_code == 200
    assert saved.json()['document']['scenes'][0]['beats'][0]['narration']['en'] == doc['scenes'][0]['beats'][0]['narration']['en']
    assert http.put(DRAFT, headers=headers, json=doc).status_code == 409
    assert http.post(f'{ROOT}/{ID}/publish', headers=headers).status_code == 409
    published = http.post(f'{ROOT}/{ID}/publish', headers={**headers, 'If-Match': saved.headers['etag']})
    assert published.status_code == 200
    assert http.get(PUBLIC).json()['document'] == changed
    assert http.get('/api/lessons/boot-pilot').json() == old_pilot


def test_caption_writes_still_require_csrf(client):
    headers = edit_headers(client)
    assert client.post(ROOT, json=baseline(), headers={'Origin': headers['Origin']}).status_code == 403
    assert client.post(ROOT, json=baseline(), headers=headers).status_code == 201
    assert client.put(DRAFT, json=baseline(), headers={'If-Match': '"1"'}).status_code == 403
    assert client.post(f'{ROOT}/{ID}/publish', headers={'If-Match': '"1"'}).status_code == 403
