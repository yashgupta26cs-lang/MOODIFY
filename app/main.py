
"""Main application routes"""

from datetime import datetime, timezone

from flask import Blueprint, render_template, request, redirect, url_for, flash, abort
from flask_login import login_required, current_user
from sqlalchemy import or_

from . import db
from .models import Music, Playlist, PlaylistCatalogTrack, MoodHistory
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

    playlists = Playlist.query.filter_by(user_id=current_user.id).order_by(Playlist.name.asc()).all()
    return render_template('music.html', songs=songs, playlists=playlists)


def _render_catalog_track(song, queue_catalog_tracks=None):
    queue_source = queue_catalog_tracks if queue_catalog_tracks is not None else CATALOG_TRACKS
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
            'is_instrumental': track.get('is_instrumental', track.get('language', '').casefold() == 'instrumental'),
            'video_embed_url': track.get('video_embed_url', ''),
            'lyrics': track.get('lyrics', '') if track.get('lyrics_authorized') else '',
            'lyrics_authorized': bool(track.get('lyrics_authorized')),
            'lyrics_credit': track.get('lyrics_credit', ''),
            'lyrics_source_url': track.get('lyrics_source_url', ''),
            'karaoke_audio_url': track.get('karaoke_audio_url', '') if track.get('karaoke_authorized') else '',
            'karaoke_authorized': bool(track.get('karaoke_authorized')),
        }
        for track in queue_source
    ]
    current_track_index = next(
        (index for index, track in enumerate(queue_source) if track['slug'] == song['slug']),
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
    playlists = Playlist.query.filter_by(user_id=current_user.id).order_by(Playlist.id.desc()).all()
    return render_template('playlist.html', playlists=playlists, catalog_tracks=CATALOG_TRACKS)


@main_bp.route('/playlist/create', methods=['POST'])
@login_required
def create_playlist():
    name = request.form.get('name', '').strip()
    if not name:
        flash('Give your playlist a name first.')
        return redirect(url_for('main.playlist'))
    if len(name) > 150:
        flash('Playlist names must be 150 characters or fewer.')
        return redirect(url_for('main.playlist'))

    new_playlist = Playlist(name=name, user_id=current_user.id)
    db.session.add(new_playlist)
    db.session.commit()
    flash('Your playlist is ready. Add some tracks!')
    return redirect(url_for('main.playlist_detail', playlist_id=new_playlist.id))


@main_bp.route('/playlist/<int:playlist_id>')
@login_required
def playlist_detail(playlist_id):
    selected_playlist = Playlist.query.filter_by(
        id=playlist_id, user_id=current_user.id
    ).first_or_404()
    saved_items = PlaylistCatalogTrack.query.filter_by(
        playlist_id=selected_playlist.id
    ).order_by(PlaylistCatalogTrack.id.asc()).all()
    track_lookup = {track['slug']: track for track in CATALOG_TRACKS}
    playlist_tracks = [
        {'item': item, 'song': track_lookup[item.catalog_slug]}
        for item in saved_items if item.catalog_slug in track_lookup
    ]
    return render_template(
        'playlist_detail.html',
        playlist=selected_playlist,
        playlist_tracks=playlist_tracks,
        catalog_tracks=CATALOG_TRACKS,
    )


@main_bp.route('/playlist/<int:playlist_id>/add', methods=['POST'])
@login_required
def add_to_playlist(playlist_id):
    selected_playlist = Playlist.query.filter_by(
        id=playlist_id, user_id=current_user.id
    ).first_or_404()
    slug = request.form.get('slug', '').strip()
    if not any(track['slug'] == slug for track in CATALOG_TRACKS):
        abort(404)
    existing = PlaylistCatalogTrack.query.filter_by(
        playlist_id=selected_playlist.id, catalog_slug=slug
    ).first()
    if existing:
        flash('That track is already in this playlist.')
    else:
        db.session.add(PlaylistCatalogTrack(
            playlist_id=selected_playlist.id,
            catalog_slug=slug,
        ))
        db.session.commit()
        flash('Track added to your playlist.')
    return redirect(url_for('main.playlist_detail', playlist_id=selected_playlist.id))


@main_bp.route('/playlist/<int:playlist_id>/remove/<slug>', methods=['POST'])
@login_required
def remove_from_playlist(playlist_id, slug):
    selected_playlist = Playlist.query.filter_by(
        id=playlist_id, user_id=current_user.id
    ).first_or_404()
    item = PlaylistCatalogTrack.query.filter_by(
        playlist_id=selected_playlist.id, catalog_slug=slug
    ).first_or_404()
    db.session.delete(item)
    db.session.commit()
    flash('Track removed from your playlist.')
    return redirect(url_for('main.playlist_detail', playlist_id=selected_playlist.id))


@main_bp.route('/playlist/<int:playlist_id>/delete', methods=['POST'])
@login_required
def delete_playlist(playlist_id):
    selected_playlist = Playlist.query.filter_by(
        id=playlist_id, user_id=current_user.id
    ).first_or_404()
    PlaylistCatalogTrack.query.filter_by(playlist_id=selected_playlist.id).delete()
    db.session.delete(selected_playlist)
    db.session.commit()
    flash('Playlist deleted.')
    return redirect(url_for('main.playlist'))


@main_bp.route('/playlist/<int:playlist_id>/play')
@login_required
def play_playlist(playlist_id):
    selected_playlist = Playlist.query.filter_by(
        id=playlist_id, user_id=current_user.id
    ).first_or_404()
    saved_items = PlaylistCatalogTrack.query.filter_by(
        playlist_id=selected_playlist.id
    ).order_by(PlaylistCatalogTrack.id.asc()).all()
    track_lookup = {track['slug']: track for track in CATALOG_TRACKS}
    queue = [track_lookup[item.catalog_slug] for item in saved_items if item.catalog_slug in track_lookup]
    if not queue:
        flash('Add at least one track before playing this playlist.')
        return redirect(url_for('main.playlist_detail', playlist_id=selected_playlist.id))
    return _render_catalog_track(queue[0], queue_catalog_tracks=queue)


@main_bp.route('/mood_history')
@login_required
def mood_history():
    return redirect(url_for('main.moodometer'))


@main_bp.route('/moodometer')
@login_required
def moodometer():
    entries = MoodHistory.query.filter_by(
        user_id=current_user.id
    ).order_by(MoodHistory.timestamp.asc()).all()

    mood_entries = [
        {
            'mood': entry.mood,
            'timestamp': entry.timestamp.isoformat(),
        }
        for entry in entries
    ]

    from collections import Counter
    mood_counts = Counter(entry.mood for entry in entries)
    latest_mood = entries[-1].mood if entries else None
    top_mood = mood_counts.most_common(1)[0][0] if mood_counts else None

    return render_template(
        'mood_history.html',
        mood_entries=mood_entries,
        total_checkins=len(entries),
        latest_mood=latest_mood,
        top_mood=top_mood,
    )


@main_bp.route('/profile')
@login_required
def profile():
    return render_template('profile.html')


@main_bp.route('/recommendations')
@login_required
def recommendations():
    from collections import Counter

    recent_entries = MoodHistory.query.filter_by(
        user_id=current_user.id
    ).order_by(MoodHistory.timestamp.desc()).limit(8).all()
    recent_moods = Counter(entry.mood for entry in recent_entries)

    selected_mood = request.args.get('mood', '').strip()
    target_mood = selected_mood or (
        recent_entries[0].mood if recent_entries else current_user.preferred_mood
    )

    favourite_singers = [
        name.strip().casefold()
        for name in (current_user.favorite_singer or '').split(',')
        if name.strip()
    ]
    preferred_language = (current_user.preferred_language or '').casefold()

    recommendations_list = []
    for song in CATALOG_TRACKS:
        score = 0
        reasons = []
        song_mood = (song.get('mood') or '').casefold()
        song_language = (song.get('language') or '').casefold()
        artist_text = f"{song.get('artist', '')} {song.get('composer', '')}".casefold()

        if target_mood and song_mood == target_mood.casefold():
            score += 5
            reasons.append(f"Matches your {target_mood} mood")
        elif song.get('mood') in recent_moods:
            score += min(recent_moods[song.get('mood')], 3)
            reasons.append(f"You checked in as {song.get('mood').lower()} recently")

        if preferred_language and preferred_language in song_language:
            score += 3
            reasons.append(f"Matches your {current_user.preferred_language} language preference")

        matched_singer = next((name for name in favourite_singers if name in artist_text), None)
        if matched_singer:
            score += 5
            reasons.append(f"Features your favourite artist: {matched_singer.title()}")

        if song_language == 'instrumental':
            reasons.append("Instrumental listening")

        if not reasons:
            reasons.append("A curated track to explore something new")

        recommendations_list.append({
            **song,
            'score': score,
            'reasons': reasons,
            'has_personal_match': score > 0,
        })

    recommendations_list.sort(
        key=lambda song: (-song['score'], song['title'].casefold())
    )
    available_moods = sorted({song.get('mood') for song in CATALOG_TRACKS if song.get('mood')})

    playlists = Playlist.query.filter_by(user_id=current_user.id).order_by(Playlist.name.asc()).all()
    return render_template(
        'recommendations.html',
        songs=recommendations_list,
        selected_mood=target_mood or '',
        available_moods=available_moods,
        playlists=playlists,
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
