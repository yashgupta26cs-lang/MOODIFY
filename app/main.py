
"""Main application routes"""

from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user

from . import db
from .models import Music, Playlist, MoodHistory

import random


main_bp = Blueprint('main', __name__, template_folder='templates')


@main_bp.route('/')
def index():
    return redirect(url_for('main.home'))


@main_bp.route('/home')
@login_required
def home():
    songs = Music.query.limit(5).all()
    return render_template('home.html', songs=songs)


@main_bp.route('/music', methods=['GET'])
@login_required
def music():

    language = request.args.get('language')
    mood = request.args.get('mood')
    singer = request.args.get('singer')

    query = Music.query

    if language:
        query = query.filter(
            Music.language.ilike(f'%{language}%')
        )

    if mood:
        query = query.filter(
            Music.mood.ilike(f'%{mood}%')
        )

    if singer:
        query = query.filter(
            Music.artist.ilike(f'%{singer}%')
        )

    songs = query.all()

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
