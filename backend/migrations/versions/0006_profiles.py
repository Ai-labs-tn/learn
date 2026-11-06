"""Add the portfolio profiles table.

Revision ID: 0006_profiles
Revises: 0005_session_absolute_expiry
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_profiles"
down_revision = "0005_session_absolute_expiry"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "profiles",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("entities", sa.JSON(), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("source_sha256", sa.String(64), nullable=True),
        sa.Column("ai_model", sa.String(128), nullable=True),
        sa.Column("created_at", sa.String(32), nullable=False),
        sa.Column("updated_at", sa.String(32), nullable=False),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.CheckConstraint("version > 0", name="positive_profile_version"),
    )


def downgrade():
    # Disposable databases only; production rollback keeps the table and rolls back code.
    op.drop_table("profiles")
