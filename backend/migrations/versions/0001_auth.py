"""Initial users, digest-only sessions and shared persistent login throttle.

Revision ID: 0001_auth
Revises: none
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_auth"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("users", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("username", sa.String(64), nullable=False, unique=True),
                    sa.Column("role", sa.String(16), nullable=False),
                    sa.Column("password_hash", sa.String(256), nullable=False),
                    sa.CheckConstraint("role IN ('admin', 'guest')", name="valid_role"))
    op.create_table("auth_sessions", sa.Column("token_digest", sa.String(64), primary_key=True),
                    sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("csrf_token", sa.String(64), nullable=False),
                    sa.Column("expires_at", sa.Integer(), nullable=False))
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])
    op.create_table("login_attempts", sa.Column("key", sa.String(64), primary_key=True),
                    sa.Column("count", sa.Integer(), nullable=False),
                    sa.Column("window_start", sa.Integer(), nullable=False))


def downgrade():
    op.drop_table("login_attempts")
    op.drop_table("auth_sessions")
    op.drop_table("users")
