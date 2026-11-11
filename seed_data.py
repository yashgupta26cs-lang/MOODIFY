"""Seed the database with demo music."""

from app import create_app, db
from app.models import Music

app = create_app()

with app.app_context():

    # Run database migrations before using this script.
    # Insert demo songs only when the music table is empty.
    if Music.query.first() is None:

        demo_songs = [
            Music(
                title="Sunrise",
                artist="Ambient Artist",
                language="English",
                mood="Calm",
                genre="Ambient",
                audio_file="sunrise.mp3",
                lyrics="..."
            ),
            Music(
                title="Happy Beats",
                artist="Joyful Band",
                language="English",
                mood="Happy",
                genre="Pop",
                audio_file="happy_beats.mp3",
                lyrics="..."
            ),
            Music(
                title="Night Blues",
                artist="Soulful Singer",
                language="English",
                mood="Sad",
                genre="Blues",
                audio_file="night_blues.mp3",
                lyrics="..."
            ),
        ]

        db.session.add_all(demo_songs)
        db.session.commit()

        print("Demo music inserted successfully.")

    else:
        print("Music table already has data.")