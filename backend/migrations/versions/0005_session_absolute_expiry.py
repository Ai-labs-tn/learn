"""Add an absolute expiry to sessions so activity can renew them within a hard ceiling.

Revision ID: 0005_session_absolute_expiry
Revises: 0004_ai_usage
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_session_absolute_expiry"
down_revision = "0004_ai_usage"
branch_labels = None
depends_on = None


def upgrade():
    # Additive and nullable: existing sessions keep their fixed expiry and are not renewed.
    op.add_column("auth_sessions", sa.Column("absolute_expires_at", sa.Integer(), nullable=True))


def downgrade():
    # Disposable databases only; production rollback keeps the column and rolls back code.
    with op.batch_alter_table("auth_sessions") as batch:
        batch.drop_column("absolute_expires_at")
