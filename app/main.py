
"""Main application routes"""

from datetime import datetime, timezone

from flask import Blueprint, render_template, request, redirect, url_for, flash, abort
from flask_login import login_required, current_user
from sqlalchemy import or_

from . import db
from .models import Music, Playlist, MoodHistory
from .music_catalog import CATALOG_TRACKS

import random


main_bp = Blueprint('main', __name__, template_folder='templates')


@main_bp.route('/')
def index():
    # Public entry point: open the designed login screen.
    # The Create Account link on that page opens registration.
    return redirect(url_for('auth.login'))


@main_bp.route('/home')
@login_required
def home():
    # Rank the curated, reusable tracks around each user's saved preferences.
    favourite_singers = [
        name.strip().casefold()
        for name in (current_user.favorite_singer or '').split(',')
        if name.strip()
    ]

    def contains_preference(value, preference):
        return bool(value and preference and preference.casefold() in str(value).casefold())

    def preference_score(song):
        score = 0
        if contains_preference(song.get('language'), current_user.preferred_language):
            score += 2
        if contains_preference(song.get('mood'), current_user.preferred_mood):
            score += 3
        artist_text = f"{song.get('artist', '')} {song.get('composer', '')}".casefold()
        if any(singer in artist_text for singer in favourite_singers):
            score += 3
        return score, song['id']

    songs = sorted(CATALOG_TRACKS, key=preference_score, reverse=True)[:6]
    return render_template('home.html', songs=songs)


@main_bp.route('/mood-checkin', methods=['POST'])
@login_required
def mood_checkin():
    mood = request.form.get('mood', '').strip()

    allowed_moods = {
        'Happy', 'Relaxed', 'Calm', 'Energetic', 'Romantic',
        'Sad', 'Motivational', 'Focused', 'Nostalgic', 'Adventurous'
    }

    if mood not in allowed_moods:
        flash('Please choose a mood from the list.')
        return redirect(url_for('main.home'))

    current_user.preferred_mood = mood

    mood_entry = MoodHistory(
        mood=mood,
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
        user_id=current_user.id
    )

    db.session.add(mood_entry)
    db.session.commit()

    flash('Your mood has been updated. Your music mix will adapt!')
    return redirect(url_for('main.home'))


@main_bp.route('/music', methods=['GET'])
@login_required
def music():
    language = request.args.get('language', '').strip().casefold()
    mood = request.args.get('mood', '').strip().casefold()
    genre = request.args.get('genre', '').strip().casefold()
    singer = request.args.get('singer', '').strip().casefold()
    search_text = request.args.get('q', '').strip().casefold()

    songs = []
    for song in CATALOG_TRACKS:
        searchable = " ".join([
            song.get('title', ''),
            song.get('artist', ''),
            song.get('composer', ''),
            song.get('genre', ''),
            song.get('mood', ''),
        ]).casefold()

        if language and language not in song.get('language', '').casefold():
            continue
        if mood and mood not in song.get('mood', '').casefold():
            continue
        if genre and genre not in song.get('genre', '').casefold():
            continue
        if singer and singer not in (song.get('artist', '') + " " + song.get('composer', '')).casefold():
            continue
        if search_text and search_text not in searchable:
            continue

        songs.append(song)

    return render_template('music.html', songs=songs)


def _render_catalog_track(song):
    queue_tracks = [
        {
            'slug': track['slug'],
            'url': url_for('main.listen', slug=track['slug']),
            'title': track.get('title', ''),
            'artist': track.get('artist', ''),
            'composer': track.get('composer', ''),
            'description': track.get('description', ''),
            'genre': track.get('genre', ''),
            'mood': track.get('mood', ''),
            'language': track.get('language', ''),
            'duration': track.get('duration', ''),
            'audio_url': track.get('audio_url', ''),
            'fallback_audio_url': track.get('fallback_audio_url', ''),
            'source_url': track.get('source_url', ''),
            'license_label': track.get('license_label', ''),
            'license_url': track.get('license_url', ''),
            'credit': track.get('credit', ''),
            'art_class': track.get('art_class', ''),
        }
        for track in CATALOG_TRACKS
    ]
    current_track_index = next(
        (index for index, track in enumerate(CATALOG_TRACKS) if track['slug'] == song['slug']),
        0,
    )
    return render_template(
        'play.html',
        song=song,
        audio_url=song.get('audio_url'),
        fallback_audio_url=song.get('fallback_audio_url'),
        source_url=song.get('source_url'),
        license_label=song.get('license_label'),
        license_url=song.get('license_url'),
        credit=song.get('credit'),
        queue_tracks=queue_tracks,
        current_track_index=current_track_index,
    )


@main_bp.route('/listen/<slug>')
@login_required
def listen(slug):
    song = next((track for track in CATALOG_TRACKS if track['slug'] == slug), None)
    if song is None:
        abort(404)
    return _render_catalog_track(song)


@main_bp.route('/play/<int:music_id>')
@login_required
def play(music_id):
    # Curated catalogue IDs are used by Home and the Music Library.
    catalog_song = next((track for track in CATALOG_TRACKS if track['id'] == music_id), None)
    if catalog_song is not None:
        return _render_catalog_track(catalog_song)

    # Keep the original database-backed route working for existing saved links.
    song = Music.query.get_or_404(music_id)
    audio_url = url_for('static', filename='media/' + song.audio_file) if song.audio_file else None
    return render_template(
        'play.html',
        song=song,
        audio_url=audio_url,
        fallback_audio_url=None,
        source_url=None,
        license_label=None,
        license_url=None,
        credit=None,
        queue_tracks=[],
        current_track_index=0,
    )


@main_bp.route('/playlist')
@login_required
def playlist():

    playlists = Playlist.query.filter_by(
        user_id=current_user.id
    ).all()

    return render_template(
        'playlist.html',
        playlists=playlists
    )


@main_bp.route('/playlist/create', methods=['POST'])
@login_required
def create_playlist():

    name = request.form.get('name', '').strip()

    if not name:
        flash('Playlist name required')
        return redirect(url_for('main.playlist'))

    new_pl = Playlist(
        name=name,
        user_id=current_user.id
    )

    db.session.add(new_pl)
    db.session.commit()

    flash('Playlist created')

    return redirect(url_for('main.playlist'))


@main_bp.route('/mood_history')
@login_required
def mood_history():

    entries = MoodHistory.query.filter_by(
        user_id=current_user.id
    ).order_by(MoodHistory.timestamp).all()

    dates = [
        entry.timestamp.strftime('%Y-%m-%d %H:%M')
        for entry in entries
    ]

    moods = [entry.mood for entry in entries]

    return render_template(
        'mood_history.html',
        dates=dates,
        moods=moods
    )


@main_bp.route('/profile')
@login_required
def profile():
    return render_template('profile.html')


@main_bp.route('/recommendations')
@login_required
def recommendations():
    songs = list(CATALOG_TRACKS)
    random.shuffle(songs)
    return render_template('recommendations.html', songs=songs)


# ==========================================
# MOODIFY PERSONAL PREFERENCE SETUP
# ==========================================

@main_bp.route('/setup', methods=['GET', 'POST'])
@login_required
def setup():

    if request.method == 'POST':

        preferred_language = request.form.get(
            'preferred_language', ''
        ).strip()

        preferred_mood = request.form.get(
            'preferred_mood', ''
        ).strip()

        favorite_singer = request.form.get(
            'favorite_singer', ''
        ).strip()

        if not all([
            preferred_language,
            preferred_mood,
            favorite_singer
        ]):
            flash('Please complete all your music preferences.')
            return redirect(url_for('main.setup'))

        current_user.preferred_language = preferred_language
        current_user.preferred_mood = preferred_mood
        current_user.favorite_singer = favorite_singer

        db.session.commit()

        flash('Your music preferences have been saved successfully!')

        return redirect(url_for('main.home'))

    return render_template('setup.html')


# ==========================================
# MOODOMETER
# ==========================================

@main_bp.route('/moodometer')
@login_required
def moodometer():

    entries = MoodHistory.query.filter_by(
        user_id=current_user.id
    ).order_by(MoodHistory.timestamp).all()

    dates = [
        entry.timestamp.strftime('%Y-%m-%d %H:%M')
        for entry in entries
    ]

    moods = [entry.mood for entry in entries]

    return render_template(
        'mood_history.html',
        dates=dates,
        moods=moods
    )
