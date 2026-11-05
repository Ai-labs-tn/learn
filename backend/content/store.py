"""Transactional pilot import and secret-free content backup."""
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.content.schema import LessonDocument
from backend.models import Lesson, LessonAudit, LessonDraft, LessonRevision


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def pilot_document():
    return LessonDocument.model_validate_json(
        Path(__file__).with_name("boot-pilot.v1.json").read_text(encoding="utf-8")
    ).document()


def import_pilot(engine):
    """Insert missing content only. Never replace existing drafts/publications."""
    document = pilot_document()
    with Session(engine) as db, db.begin():
        if engine.dialect.name == "postgresql":
            db.connection().exec_driver_sql("SELECT pg_advisory_xact_lock(714202603)")
        elif engine.dialect.name == "sqlite":
            # Local development can also start multiple workers simultaneously.
            db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        lesson = db.get(Lesson, document["id"])
        now = timestamp()
        if lesson is None:
            lesson = Lesson(id=document["id"], published_revision=None, created_at=now)
            db.add(lesson)
            db.flush()
            db.add(LessonRevision(lesson_id=lesson.id, revision=1, document=document,
                                  published_at=now, created_by=None))
            db.flush()
            lesson.published_revision = 1
            db.add(LessonAudit(lesson_id=lesson.id, actor_id=None, action="pilot_import",
                               revision=1, draft_version=None, occurred_at=now))
        # Repair only a missing draft, using the current publication, never bundled
        # content over an edited/published lesson. Existing unpublished rows stay untouched.
        if db.get(LessonDraft, lesson.id) is None and lesson.published_revision is not None:
            revision = db.get(LessonRevision, (lesson.id, lesson.published_revision))
            db.add(LessonDraft(lesson_id=lesson.id, document=revision.document, version=1,
                               base_revision=revision.revision, updated_at=now, updated_by=None))
            db.add(LessonAudit(lesson_id=lesson.id, actor_id=None, action="draft_initialized",
                               revision=revision.revision, draft_version=1, occurred_at=now))


def export_content(engine):
    """Single consistent snapshot, including drafts/history; excludes all auth data."""
    isolation = "REPEATABLE READ" if engine.dialect.name == "postgresql" else "SERIALIZABLE"
    with engine.connect().execution_options(isolation_level=isolation) as connection:
        with connection.begin():
            if engine.dialect.name == "sqlite":
                connection.exec_driver_sql("BEGIN")
            with Session(bind=connection) as db:
                return {
                    "backupVersion": 1,
                    "exportedAt": timestamp(),
                    "lessons": [{"id": row.id, "publishedRevision": row.published_revision,
                                 "createdAt": row.created_at} for row in db.scalars(select(Lesson).order_by(Lesson.id))],
                    "drafts": [{"lessonId": row.lesson_id, "document": row.document,
                                "version": row.version, "baseRevision": row.base_revision,
                                "updatedAt": row.updated_at, "updatedBy": row.updated_by}
                               for row in db.scalars(select(LessonDraft).order_by(LessonDraft.lesson_id))],
                    "revisions": [{"lessonId": row.lesson_id, "revision": row.revision,
                                   "document": row.document, "publishedAt": row.published_at,
                                   "createdBy": row.created_by}
                                  for row in db.scalars(select(LessonRevision).order_by(
                                      LessonRevision.lesson_id, LessonRevision.revision))],
                    "auditEvents": [{"id": row.id, "lessonId": row.lesson_id, "actorId": row.actor_id,
                                     "action": row.action, "draftVersion": row.draft_version,
                                     "revision": row.revision, "occurredAt": row.occurred_at}
                                    for row in db.scalars(select(LessonAudit).order_by(LessonAudit.id))],
                }
