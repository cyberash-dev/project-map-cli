"""init schema."""
revision = "V001"
down_revision = None


def upgrade() -> None:
    import sqlalchemy as sa
    from alembic import op

    op.create_table(
        "transactions",
        sa.Column("transaction_id", sa.Integer, primary_key=True),
        sa.Column("status", sa.String),
    )


def downgrade() -> None:
    from alembic import op

    op.drop_table("transactions")
