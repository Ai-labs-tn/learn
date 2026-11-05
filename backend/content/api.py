"""Published reads and atomic admin-only draft/publication lifecycle."""
import re
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Response
from pydantic import Field
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.auth import admin_only, authenticated
from backend.content.schema import LessonDocument, StrictModel
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
    version = draft_version(if_match)
    if document.id != lesson_id:
        raise HTTPException(422, "Document id must match the lesson id")
    now = timestamp()
    updated = claim_draft(db, lesson_id, version, user.id, now, document=document.document())
    db.add(LessonAudit(lesson_id=lesson_id, actor_id=user.id, action="draft_updated",
                       draft_version=updated.version, revision=updated.base_revision, occurred_at=now))
    db.commit()
    response.headers["ETag"] = f'"{updated.version}"'
    return draft_body(updated)


def draft_version(if_match):
    if if_match is None:
        raise HTTPException(428, "If-Match draft version is required")
    # Strong ETag only. Reject wildcards, weak tags and lists: no bypass of the
    # version comparison. Bound parsing so huge integer headers cannot raise 500.
    if not re.fullmatch(r'"[1-9][0-9]{0,9}"', if_match):
        raise HTTPException(409, "If-Match must be the quoted draft version ETag")
    version = int(if_match[1:-1])
    if version >= 2147483647:
        raise HTTPException(409, "Draft version conflict; reload the draft")
    return version


def claim_draft(db, lesson_id, version, actor_id, now, **values):
    # One conditional UPDATE is the compare-and-swap, not a read/check/write.
    # Both the successful edit and its audit append commit in this transaction.
    updated = db.execute(update(LessonDraft).where(
        LessonDraft.lesson_id == lesson_id, LessonDraft.version == version,
    ).values(**values, version=LessonDraft.version + 1,
             updated_at=now, updated_by=actor_id).returning(
                 LessonDraft
             ).execution_options(synchronize_session=False)).scalar_one_or_none()
    if updated is None:
        if db.get(LessonDraft, lesson_id) is None:
            raise HTTPException(404, "Draft not found")
        raise HTTPException(409, "Draft version conflict; reload the draft")
    return updated


@router.post("/studio/lessons", status_code=201)
def create_lesson(document: LessonDocument, response: Response,
                  user: User = Depends(admin_only), db: Session = Depends(get_db)):
    now = timestamp()
    try:
        db.add(Lesson(id=document.id, published_revision=None, created_at=now))
        db.flush()
        draft = LessonDraft(lesson_id=document.id, document=document.document(), version=1,
                            base_revision=None, updated_at=now, updated_by=user.id)
        db.add(draft)
        db.add(LessonAudit(lesson_id=document.id, actor_id=user.id, action="draft_created",
                           draft_version=1, revision=None, occurred_at=now))
        db.commit()
    except IntegrityError:
        db.rollback()
        # Only an actual ID collision is a client conflict. Do not mask unrelated
        # constraint/audit failures as successful or conflicting creation.
        if db.get(Lesson, document.id) is not None:
            raise HTTPException(409, "Lesson id already exists")
        raise
    response.headers["ETag"] = '"1"'
    return draft_body(draft)


@router.post("/studio/lessons/{lesson_id}/publish")
def publish_lesson(lesson_id: LessonId, response: Response,
                   user: User = Depends(admin_only), db: Session = Depends(get_db),
                   if_match: Annotated[str | None, Header()] = None):
    now = timestamp()
    # Claim before reading the document or allocating a revision. This write
    # serializes save/publish/restore on SQLite and PostgreSQL alike. A competing
    # request with the same ETag cannot publish a duplicate revision.
    draft = claim_draft(db, lesson_id, draft_version(if_match), user.id, now)
    revision = (db.scalar(select(func.max(LessonRevision.revision)).where(
        LessonRevision.lesson_id == lesson_id)) or 0) + 1
    db.add(LessonRevision(lesson_id=lesson_id, revision=revision, document=draft.document,
                          published_at=now, created_by=user.id))
    db.flush()  # The immutable row must exist before either foreign-key pointer.
    db.execute(update(Lesson).where(Lesson.id == lesson_id).values(published_revision=revision))
    draft.base_revision = revision
    db.add(LessonAudit(lesson_id=lesson_id, actor_id=user.id, action="lesson_published",
                       draft_version=draft.version, revision=revision, occurred_at=now))
    db.commit()
    response.headers["ETag"] = f'"{draft.version}"'
    return {**draft_body(draft), "revision": revision, "publishedAt": now}


@router.get("/studio/lessons/{lesson_id}/history", dependencies=[Depends(admin_only)])
def lesson_history(lesson_id: LessonId, db: Session = Depends(get_db)):
    if db.get(Lesson, lesson_id) is None:
        raise HTTPException(404, "Lesson not found")
    return [{"revision": row.revision, "title": row.document["title"], "publishedAt": row.published_at}
            for row in db.scalars(select(LessonRevision).where(
                LessonRevision.lesson_id == lesson_id).order_by(LessonRevision.revision.desc()))]


class RestoreRequest(StrictModel):
    revision: int = Field(gt=0, le=2147483647)


@router.post("/studio/lessons/{lesson_id}/restore")
def restore_lesson(lesson_id: LessonId, body: RestoreRequest, response: Response,
                   user: User = Depends(admin_only), db: Session = Depends(get_db),
                   if_match: Annotated[str | None, Header()] = None):
    now = timestamp()
    draft = claim_draft(db, lesson_id, draft_version(if_match), user.id, now)
    source = db.get(LessonRevision, (lesson_id, body.revision))
    if source is None:
        # The failed restore must not consume the claimed draft version.
        db.rollback()
        raise HTTPException(404, "Revision not found")
    draft.document = source.document
    # baseRevision remains the draft's current publication base; the restored
    # revision is recorded in the audit, not made into a publication pointer.
    db.add(LessonAudit(lesson_id=lesson_id, actor_id=user.id, action="draft_restored",
                       draft_version=draft.version, revision=source.revision, occurred_at=now))
    db.commit()
    response.headers["ETag"] = f'"{draft.version}"'
    return draft_body(draft)
