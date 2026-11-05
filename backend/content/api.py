"""Published reads and admin-only optimistic draft edits. No publication API yet."""
import re
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from backend.auth import admin_only, authenticated
from backend.content.schema import LessonDocument
from backend.content.store import timestamp
from backend.database import get_db
from backend.models import Lesson, LessonAudit, LessonDraft, LessonRevision, User

router = APIRouter(prefix="/api", tags=["lessons"])
LessonId = Annotated[str, Path(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9-]*$")]


def publication_query():
    return select(LessonRevision).join(Lesson, (Lesson.id == LessonRevision.lesson_id) &
                                      (Lesson.published_revision == LessonRevision.revision))


def draft_body(draft):
    return {"document": draft.document, "version": draft.version, "baseRevision": draft.base_revision}


@router.get("/lessons", dependencies=[Depends(authenticated)])
def published_lessons(db: Session = Depends(get_db)):
    return [{"id": row.lesson_id, "title": row.document["title"], "description": row.document["description"],
             "revision": row.revision, "publishedAt": row.published_at}
            for row in db.scalars(publication_query().order_by(LessonRevision.lesson_id))]


@router.get("/lessons/{lesson_id}", dependencies=[Depends(authenticated)])
def published_lesson(lesson_id: LessonId, db: Session = Depends(get_db)):
    row = db.scalar(publication_query().where(Lesson.id == lesson_id))
    if row is None:
        raise HTTPException(404, "Published lesson not found")
    return {"document": row.document, "revision": row.revision, "publishedAt": row.published_at}


@router.get("/studio/lessons", dependencies=[Depends(admin_only)])
def studio_lessons(db: Session = Depends(get_db)):
    return [{"id": draft.lesson_id, "title": draft.document["title"],
             "description": draft.document["description"], "version": draft.version,
             "baseRevision": draft.base_revision, "publishedRevision": lesson.published_revision,
             "updatedAt": draft.updated_at}
            for draft, lesson in db.execute(select(LessonDraft, Lesson).join(
                Lesson, Lesson.id == LessonDraft.lesson_id).order_by(Lesson.id))]


@router.get("/studio/lessons/{lesson_id}/draft", dependencies=[Depends(admin_only)])
def read_draft(lesson_id: LessonId, response: Response, db: Session = Depends(get_db)):
    draft = db.get(LessonDraft, lesson_id)
    if draft is None:
        raise HTTPException(404, "Draft not found")
    response.headers["ETag"] = f'"{draft.version}"'
    return draft_body(draft)


@router.put("/studio/lessons/{lesson_id}/draft")
def update_draft(lesson_id: LessonId, document: LessonDocument, response: Response,
                 user: User = Depends(admin_only), db: Session = Depends(get_db),
                 if_match: Annotated[str | None, Header()] = None):
    if if_match is None:
        raise HTTPException(428, "If-Match draft version is required")
    # Strong ETag only. Reject wildcards, weak tags and lists: no bypass of the
    # version comparison. Bound parsing so huge integer headers cannot raise 500.
    if not re.fullmatch(r'"[1-9][0-9]{0,9}"', if_match):
        raise HTTPException(409, "If-Match must be the quoted draft version ETag")
    version = int(if_match[1:-1])
    if version >= 2147483647:
        raise HTTPException(409, "Draft version conflict; reload the draft")
    if document.id != lesson_id:
        raise HTTPException(422, "Document id must match the lesson id")
    now = timestamp()
    # One conditional UPDATE is the compare-and-swap, not a read/check/write.
    # Both the successful edit and its audit append commit in this transaction.
    updated = db.execute(update(LessonDraft).where(
        LessonDraft.lesson_id == lesson_id, LessonDraft.version == version,
    ).values(document=document.document(), version=LessonDraft.version + 1,
             updated_at=now, updated_by=user.id).returning(
                 LessonDraft.version, LessonDraft.base_revision
             ).execution_options(synchronize_session=False)).first()
    if updated is None:
        if db.get(LessonDraft, lesson_id) is None:
            raise HTTPException(404, "Draft not found")
        raise HTTPException(409, "Draft version conflict; reload the draft")
    db.add(LessonAudit(lesson_id=lesson_id, actor_id=user.id, action="draft_updated",
                       draft_version=updated.version, revision=updated.base_revision, occurred_at=now))
    db.commit()
    response.headers["ETag"] = f'"{updated.version}"'
    return {"document": document.document(), "version": updated.version, "baseRevision": updated.base_revision}
