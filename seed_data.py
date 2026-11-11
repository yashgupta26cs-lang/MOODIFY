"""Seed script to create tables and add demo music data."""

import os
from datetime import datetime

from app import create_app, db
from app.models import Music

app = create_app()

# Ensure tables exist
with app.app_context():
    db.create_all()
    # Insert demo music rows if table is empty
    if Music.query.first() is None:
        demo_songs = [
            Music(
                title='Sunrise',
                artist='Ambient Artist',
                language='English',
                mood='Calm',
                genre='Ambient',
                audio_file='sunrise.mp3',
                video_file=None,
                lyrics='...'
            ),
            Music(
                title='Happy Beats',
                artist='Joyful Band',
                language='English',
                mood='Happy',
                genre='Pop',
                audio_file='happy_beats.mp3',
                video_file=None,
                lyrics='...'
            ),
            Music(
                title='Night Blues',
                artist='Soulful Singer',
                language='English',
                mood='Sad',
                genre='Blues',
                audio_file='night_blues.mp3',
                video_file=None,
                lyrics='...'
            ),
        ]
        db.session.bulk_save_objects(demo_songs)
        db.session.commit()
        print('Demo music inserted.')
    else:
        print('Music table already has data.')
