"""add AUTHORIZED status."""
revision = "V002"
down_revision = "V001"


def upgrade() -> None:
    from alembic import op

    op.add_column("transactions", "note")


def downgrade() -> None:
    from alembic import op

    op.drop_column("transactions", "note")
