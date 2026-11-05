"""Index bounded expiry cleanup without rewriting existing authentication data.

Revision ID: 0002_throttle_cleanup_index
Revises: 0001_auth
"""
from alembic import op

revision = "0002_throttle_cleanup_index"
down_revision = "0001_auth"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_login_attempts_window_start_key", "login_attempts", ["window_start", "key"])


def downgrade():
    op.drop_index("ix_login_attempts_window_start_key", table_name="login_attempts")
