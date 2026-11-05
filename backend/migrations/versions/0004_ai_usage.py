"""Add per-request AI usage accounting (no prompt/response text, no secrets).

Revision ID: 0004_ai_usage
Revises: 0003_lesson_content
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_ai_usage"
down_revision = "0003_lesson_content"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ai_usage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("mode", sa.String(32), nullable=False),
        sa.Column("model", sa.String(128), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("input_chars", sa.Integer(), nullable=False),
        sa.Column("output_chars", sa.Integer(), nullable=False),
        sa.Column("occurred_at", sa.String(32), nullable=False),
        sa.CheckConstraint("status IN ('ok', 'error', 'blocked')", name="valid_ai_status"),
        sa.CheckConstraint("input_chars >= 0 AND output_chars >= 0", name="non_negative_ai_sizes"),
    )
    # The daily budget count filters by occurred_at day and charged status.
    op.create_index("ix_ai_usage_occurred_at_status", "ai_usage", ["occurred_at", "status"])


def downgrade():
    # Destructive local rollback only; production should retain the table and roll back code.
    op.drop_index("ix_ai_usage_occurred_at_status", table_name="ai_usage")
    op.drop_table("ai_usage")
