"""add google calendar connections

Revision ID: 2026053101
Revises: 2026053002
Create Date: 2026-05-31 15:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2026053101"
down_revision: str | None = "2026053002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "calendar_connections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("calendar_id", sa.String(length=255), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scopes", sa.Text(), nullable=True),
        sa.Column("sync_token", sa.Text(), nullable=True),
        sa.Column("sync_cursor_reset_required", sa.Boolean(), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_calendar_connections_provider"),
        "calendar_connections",
        ["provider"],
        unique=False,
    )
    op.create_index(
        op.f("ix_calendar_connections_user_id"),
        "calendar_connections",
        ["user_id"],
        unique=False,
    )
    op.add_column(
        "events",
        sa.Column("external_provider", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column("external_calendar_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column("external_event_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column(
            "sync_state",
            sa.String(length=32),
            nullable=False,
            server_default="local_only",
        ),
    )
    op.add_column("events", sa.Column("sync_error", sa.Text(), nullable=True))
    op.add_column(
        "events",
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column("external_updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("events", "external_updated_at")
    op.drop_column("events", "last_synced_at")
    op.drop_column("events", "sync_error")
    op.drop_column("events", "sync_state")
    op.drop_column("events", "external_event_id")
    op.drop_column("events", "external_calendar_id")
    op.drop_column("events", "external_provider")
    op.drop_index(
        op.f("ix_calendar_connections_user_id"),
        table_name="calendar_connections",
    )
    op.drop_index(
        op.f("ix_calendar_connections_provider"),
        table_name="calendar_connections",
    )
    op.drop_table("calendar_connections")
