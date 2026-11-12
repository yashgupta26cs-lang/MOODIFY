
"""Database models"""

from . import db, login_manager
from flask_login import UserMixin


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)

    username = db.Column(db.String(150), unique=True, nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    mobile = db.Column(db.String(20), unique=True, nullable=True)
    password = db.Column(db.String(200), nullable=False)

    preferred_language = db.Column(db.String(50), nullable=True)
    preferred_mood = db.Column(db.String(50), nullable=True)
    favorite_singer = db.Column(db.String(150), nullable=True)

    playlists = db.relationship('Playlist', backref='owner', lazy=True)
    mood_entries = db.relationship('MoodHistory', backref='user', lazy=True)


class Music(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    artist = db.Column(db.String(200), nullable=False)
    language = db.Column(db.String(50))
    mood = db.Column(db.String(50))
    genre = db.Column(db.String(50))
    audio_file = db.Column(db.String(200))
    video_file = db.Column(db.String(200))
    lyrics = db.Column(db.Text)


class Playlist(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    songs = db.relationship(
        'Music',
        secondary='playlist_songs',
        backref='playlists'
    )


playlist_songs = db.Table(
    'playlist_songs',
    db.Column(
        'playlist_id',
        db.Integer,
        db.ForeignKey('playlist.id'),
        primary_key=True
    ),
    db.Column(
        'music_id',
        db.Integer,
        db.ForeignKey('music.id'),
        primary_key=True
    )
)


class MoodHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    mood = db.Column(db.String(50), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
