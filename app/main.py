
"""Main application routes"""

from datetime import datetime, timezone

from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user
from sqlalchemy import or_

from . import db
from .models import Music, Playlist, MoodHistory

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
    # Rank the available tracks using the preferences saved during onboarding.
    all_songs = Music.query.order_by(Music.id.desc()).limit(100).all()

    favourite_singers = [
        name.strip().casefold()
        for name in (current_user.favorite_singer or '').split(',')
        if name.strip()
    ]

    def contains_preference(value, preference):
        return bool(
            value
            and preference
            and preference.casefold() in value.casefold()
        )

    def preference_score(song):
        score = 0

        if contains_preference(song.language, current_user.preferred_language):
            score += 2

        if contains_preference(song.mood, current_user.preferred_mood):
            score += 3

        artist = (song.artist or '').casefold()
        if any(singer in artist for singer in favourite_singers):
            score += 3

        return score, song.id

    songs = sorted(all_songs, key=preference_score, reverse=True)[:6]

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

    language = request.args.get('language', '').strip()
    mood = request.args.get('mood', '').strip()
    singer = request.args.get('singer', '').strip()
    search_text = request.args.get('q', '').strip()

    query = Music.query

    if language:
        query = query.filter(Music.language.ilike(f'%{language}%'))

    if mood:
        query = query.filter(Music.mood.ilike(f'%{mood}%'))

    if singer:
        query = query.filter(Music.artist.ilike(f'%{singer}%'))

    if search_text:
        search_pattern = f'%{search_text}%'
        query = query.filter(or_(
            Music.title.ilike(search_pattern),
            Music.artist.ilike(search_pattern),
            Music.genre.ilike(search_pattern)
        ))

    songs = query.order_by(Music.title.asc()).all()

    return render_template('music.html', songs=songs)


@main_bp.route('/play/<int:music_id>')
@login_required
def play(music_id):
    song = Music.query.get_or_404(music_id)
    return render_template('play.html', song=song)


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

    all_ids = [
        music.id for music in Music.query.all()
    ]

    sample_ids = random.sample(
        all_ids,
        min(5, len(all_ids))
    )

    songs = Music.query.filter(
        Music.id.in_(sample_ids)
    ).all()

    return render_template(
        'recommendations.html',
        songs=songs
    )


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
