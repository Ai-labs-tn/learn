"""Add lessons, mutable drafts, immutable revisions and append-only audit.

Revision ID: 0003_lesson_content
Revises: 0002_throttle_cleanup_index
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_lesson_content"
down_revision = "0002_throttle_cleanup_index"
branch_labels = None
depends_on = None


def upgrade():
    postgres = op.get_bind().dialect.name == "postgresql"
    pointer = sa.ForeignKeyConstraint(
        ["id", "published_revision"], ["lesson_revisions.lesson_id", "lesson_revisions.revision"],
        name="fk_lesson_publication")
    op.create_table(
        "lessons", sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("published_revision", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.String(32), nullable=False),
        sa.CheckConstraint("published_revision IS NULL OR published_revision > 0", name="valid_publication"),
        *([] if postgres else [pointer]),
    )
    op.create_table(
        "lesson_revisions",
        sa.Column("lesson_id", sa.String(64), sa.ForeignKey("lessons.id"), primary_key=True),
        sa.Column("revision", sa.Integer(), primary_key=True),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("published_at", sa.String(32), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.CheckConstraint("revision > 0", name="positive_revision"),
    )
    if postgres:
        op.create_foreign_key("fk_lesson_publication", "lessons", "lesson_revisions",
                              ["id", "published_revision"], ["lesson_id", "revision"])
    op.create_table(
        "lesson_drafts",
        sa.Column("lesson_id", sa.String(64), sa.ForeignKey("lessons.id"), primary_key=True),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("base_revision", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.String(32), nullable=False),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.ForeignKeyConstraint(["lesson_id", "base_revision"],
                                ["lesson_revisions.lesson_id", "lesson_revisions.revision"], name="fk_draft_base"),
        sa.CheckConstraint("version > 0", name="positive_draft_version"),
    )
    op.create_table(
        "lesson_audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lesson_id", sa.String(64), sa.ForeignKey("lessons.id"), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("draft_version", sa.Integer(), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=True),
        sa.Column("occurred_at", sa.String(32), nullable=False),
    )
    op.create_index("ix_lesson_audit_lesson_id_id", "lesson_audit_events", ["lesson_id", "id"])
    # Enforce immutability even for accidental ORM or SQL writes, not only API access.
    if postgres:
        op.execute("""CREATE FUNCTION learn_reject_content_mutation() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'Content history is append-only'; END;
            $$ LANGUAGE plpgsql""")
        for table in ("lesson_revisions", "lesson_audit_events"):
            op.execute(f"CREATE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE ON {table} "
                       "FOR EACH ROW EXECUTE FUNCTION learn_reject_content_mutation()")
            op.execute(f"CREATE TRIGGER {table}_no_truncate BEFORE TRUNCATE ON {table} "
                       "FOR EACH STATEMENT EXECUTE FUNCTION learn_reject_content_mutation()")
    else:
        for table in ("lesson_revisions", "lesson_audit_events"):
            for action in ("UPDATE", "DELETE"):
                op.execute(f"CREATE TRIGGER {table}_no_{action.lower()} BEFORE {action} ON {table} "
                           "BEGIN SELECT RAISE(ABORT, 'Content history is append-only'); END")
            # SQLite REPLACE can suppress DELETE triggers unless recursive_triggers
            # is enabled. Reject duplicate keys before INSERT so it cannot rewrite
            # history even through an independent connection using default PRAGMAs.
            key = ("lesson_id = NEW.lesson_id AND revision = NEW.revision"
                   if table == "lesson_revisions" else "id = NEW.id")
            op.execute(f"CREATE TRIGGER {table}_no_replace BEFORE INSERT ON {table} "
                       f"WHEN EXISTS (SELECT 1 FROM {table} WHERE {key}) "
                       "BEGIN SELECT RAISE(ABORT, 'Content history is append-only'); END")


def downgrade():
    # Destructive local rollback only; production should retain tables and roll back code.
    postgres = op.get_bind().dialect.name == "postgresql"
    if postgres:
        op.drop_constraint("fk_lesson_publication", "lessons", type_="foreignkey")
    else:
        op.execute("UPDATE lessons SET published_revision = NULL")
    for table in ("lesson_audit_events", "lesson_drafts", "lesson_revisions", "lessons"):
        op.drop_table(table)
    if postgres:
        op.execute("DROP FUNCTION learn_reject_content_mutation()")
