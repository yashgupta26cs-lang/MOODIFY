
"""Add mobile number and preferred language to users."""

from alembic import op
import sqlalchemy as sa

revision = "a19b7c2d4e6f"
down_revision = "fca36b636978"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user",
        sa.Column("mobile", sa.String(length=20), nullable=True)
    )

    op.add_column(
        "user",
        sa.Column("preferred_language", sa.String(length=50), nullable=True)
    )

    op.create_unique_constraint(
        "uq_user_mobile",
        "user",
        ["mobile"]
    )


def downgrade():
    op.drop_constraint(
        "uq_user_mobile",
        "user",
        type_="unique"
    )

    op.drop_column("user", "preferred_language")
    op.drop_column("user", "mobile")
