"""Explicit persistence models; schema changes belong in migrations, not create_all."""
from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, Index, Integer, JSON, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('admin', 'guest')", name="valid_role"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    role: Mapped[str] = mapped_column(String(16))
    password_hash: Mapped[str] = mapped_column(String(256))


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    token_digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[int] = mapped_column(Integer, index=True)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    __table_args__ = (Index("ix_login_attempts_window_start_key", "window_start", "key"),)
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(Integer)
    window_start: Mapped[int] = mapped_column(Integer)


class Lesson(Base):
    __tablename__ = "lessons"
    __table_args__ = (
        ForeignKeyConstraint(["id", "published_revision"],
                             ["lesson_revisions.lesson_id", "lesson_revisions.revision"],
                             name="fk_lesson_publication", use_alter=True),
        CheckConstraint("published_revision IS NULL OR published_revision > 0", name="valid_publication"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    published_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[str] = mapped_column(String(32))


class LessonRevision(Base):
    __tablename__ = "lesson_revisions"
    __table_args__ = (CheckConstraint("revision > 0", name="positive_revision"),)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id"), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    document: Mapped[dict] = mapped_column(JSON)
    published_at: Mapped[str] = mapped_column(String(32))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class LessonDraft(Base):
    __tablename__ = "lesson_drafts"
    __table_args__ = (
        ForeignKeyConstraint(["lesson_id", "base_revision"],
                             ["lesson_revisions.lesson_id", "lesson_revisions.revision"], name="fk_draft_base"),
        CheckConstraint("version > 0", name="positive_draft_version"),
    )
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id"), primary_key=True)
    document: Mapped[dict] = mapped_column(JSON)
    version: Mapped[int] = mapped_column(Integer)
    base_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[str] = mapped_column(String(32))
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class LessonAudit(Base):
    __tablename__ = "lesson_audit_events"
    __table_args__ = (Index("ix_lesson_audit_lesson_id_id", "lesson_id", "id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id"))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(32))
    draft_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    occurred_at: Mapped[str] = mapped_column(String(32))
