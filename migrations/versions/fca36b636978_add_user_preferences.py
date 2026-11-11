"""Initial MOODIFY database schema."""

from alembic import op
import sqlalchemy as sa

revision = 'fca36b636978'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():

    op.create_table(
        'user',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('username', sa.String(150), nullable=False, unique=True),
        sa.Column('email', sa.String(150), nullable=False, unique=True),
        sa.Column('password', sa.String(200), nullable=False),
        sa.Column('preferred_mood', sa.String(50)),
        sa.Column('favorite_singer', sa.String(150))
    )

    op.create_table(
        'music',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('artist', sa.String(200), nullable=False),
        sa.Column('language', sa.String(50)),
        sa.Column('mood', sa.String(50)),
        sa.Column('genre', sa.String(50)),
        sa.Column('audio_file', sa.String(200)),
        sa.Column('video_file', sa.String(200)),
        sa.Column('lyrics', sa.Text())
    )

    op.create_table(
        'playlist',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(150), nullable=False),
        sa.Column(
            'user_id',
            sa.Integer(),
            sa.ForeignKey('user.id'),
            nullable=False
        )
    )

    op.create_table(
        'playlist_songs',
        sa.Column(
            'playlist_id',
            sa.Integer(),
            sa.ForeignKey('playlist.id'),
            primary_key=True
        ),
        sa.Column(
            'music_id',
            sa.Integer(),
            sa.ForeignKey('music.id'),
            primary_key=True
        )
    )

    op.create_table(
        'mood_history',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('mood', sa.String(50), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column(
            'user_id',
            sa.Integer(),
            sa.ForeignKey('user.id'),
            nullable=False
        )
    )


def downgrade():

    op.drop_table('mood_history')
    op.drop_table('playlist_songs')
    op.drop_table('playlist')
    op.drop_table('music')
    op.drop_table('user')
