
"""Main application routes"""

from collections import Counter
from datetime import datetime, timezone

from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, abort, jsonify,
)
from flask_login import login_required, current_user
from sqlalchemy import or_

from . import db
from .models import Music, Playlist, PlaylistCatalogTrack, MoodHistory, FavoriteTrack
from .music_catalog import CATALOG_TRACKS

import random


main_bp = Blueprint('main', __name__, template_folder='templates')

# The ten moods a person can check in with (the same list the mood check-in accepts).
CHECKIN_MOODS = [
    'Happy', 'Relaxed', 'Calm', 'Energetic', 'Romantic',
    'Sad', 'Motivational', 'Focused', 'Nostalgic', 'Adventurous',
]


# ==========================================
# SHARED HELPERS
# ==========================================

def wants_json():
    """True for the app's own background (fetch) requests that expect JSON back."""
    return request.headers.get('X-Moodify') == 'json'


def mood_cards():
    """Check-in moods first, then any extra mood that a catalogue track uses."""
    extra = []
    for track in CATALOG_TRACKS:
        mood = track.get('mood')
        if mood and mood not in CHECKIN_MOODS and mood not in extra:
            extra.append(mood)
    return CHECKIN_MOODS + extra


def track_payload(track):
    """Everything the player and the Now Playing view need to know about a track."""
    return {
        'slug': track['slug'],
        'id': track.get('id'),
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


def _total_duration(tracks):
    """'12 min' style total for tracks whose duration is written as m:ss."""
    seconds = 0
    for track in tracks:
        try:
            minutes, secs = str(track.get('duration', '')).split(':')
            seconds += int(minutes) * 60 + int(secs)
        except ValueError:
            continue
    if not seconds:
        return ''
    minutes = round(seconds / 60)
    return f"{minutes} min" if minutes < 60 else f"{minutes // 60} hr {minutes % 60} min"


def _user_playlists():
    if not current_user.is_authenticated:
        return []
    return Playlist.query.filter_by(user_id=current_user.id).order_by(Playlist.name.asc()).all()


def _favorite_slugs():
    if not current_user.is_authenticated:
        return []
    rows = FavoriteTrack.query.filter_by(user_id=current_user.id).order_by(FavoriteTrack.id.asc()).all()
    return [row.catalog_slug for row in rows]


def _safe_next(value):
    """Only ever send people back to a path on this site."""
    if value and value.startswith('/') and not value.startswith('//') and '\\' not in value:
        return value
    return None


@main_bp.app_context_processor
def shell_context():
    """Data every page of the app shell needs: playlists, favourites and the track list."""
    playlists = _user_playlists()
    favourites = _favorite_slugs()
    signed_in = current_user.is_authenticated
    app_data = {
        'signedIn': bool(signed_in),
        'name': (getattr(current_user, 'username', '') or '') if signed_in else '',
        'current': (getattr(current_user, 'preferred_mood', '') or '') if signed_in else '',
        'tracks': [
            {
                'slug': t['slug'], 'id': t.get('id'), 'title': t.get('title', ''), 'artist': t.get('artist', ''),
                'composer': t.get('composer', ''), 'genre': t.get('genre', ''), 'mood': t.get('mood', ''),
                'language': t.get('language', ''), 'duration': t.get('duration', ''),
                'audio': t.get('audio_url', ''), 'fallback': t.get('fallback_audio_url', ''),
                'url': url_for('main.listen', slug=t['slug']),
            }
            for t in CATALOG_TRACKS
        ],
        'playlists': [
            {
                'id': pl.id, 'name': pl.name,
                'slugs': [item.catalog_slug for item in pl.catalog_tracks],
                'url': url_for('main.playlist_detail', playlist_id=pl.id),
            }
            for pl in playlists
        ],
        'favorites': favourites,
        'moods': mood_cards(),
        'saveable': CHECKIN_MOODS,
        'urls': {
            'library': url_for('main.music'),
            'home': url_for('main.index'),
            'login': url_for('auth.login'),
            'register': url_for('auth.register'),
            'favorite': url_for('main.toggle_favorite'),
            'playlists': url_for('main.playlist'),
        },
    }
    return {
        'app_data': app_data,
        'shell_playlists': playlists,
        'favorite_slugs': favourites,
        'checkin_moods': CHECKIN_MOODS,
    }


def unauthorized():
    """Guests may browse everything public. Pages that save or sync data ask them to sign in."""
    if wants_json():
        return jsonify(ok=False, error='Please log in first.', login=True), 401
    return render_template('gate.html', next_url=request.full_path.rstrip('?')), 401


@main_bp.app_errorhandler(404)
def not_found(error):
    if wants_json():
        return jsonify(ok=False, error='Not found.'), 404
    return render_template('not_found.html'), 404


# ==========================================
# HOME (public landing page)
# ==========================================

def _render_home():
    # Rank the curated, reusable tracks around each signed-in user's saved preferences.
    # Guests simply get the catalogue in its natural order.
    signed_in = current_user.is_authenticated
    language = getattr(current_user, 'preferred_language', None) if signed_in else None
    mood = getattr(current_user, 'preferred_mood', None) if signed_in else None
    singers = [
        name.strip().casefold()
        for name in ((getattr(current_user, 'favorite_singer', '') or '') if signed_in else '').split(',')
        if name.strip()
    ]

    def contains_preference(value, preference):
        return bool(value and preference and preference.casefold() in str(value).casefold())

    def preference_score(song):
        score = 0
        if contains_preference(song.get('language'), language):
            score += 2
        if contains_preference(song.get('mood'), mood):
            score += 3
        artist_text = f"{song.get('artist', '')} {song.get('composer', '')}".casefold()
        if any(singer in artist_text for singer in singers):
            score += 3
        return -score, song['id']

    ranked = sorted(CATALOG_TRACKS, key=preference_score)
    return render_template(
        'home.html',
        songs=ranked[:6],
        all_tracks=ranked,
        playlists=_user_playlists(),
        moods=mood_cards(),
    )


@main_bp.route('/')
def index():
    return _render_home()


@main_bp.route('/home')
def home():
    # Kept so older links and bookmarks still work.
    return _render_home()


@main_bp.route('/mood-checkin', methods=['POST'])
@login_required
def mood_checkin():
    mood = request.form.get('mood', '').strip()

    if mood not in CHECKIN_MOODS:
        if wants_json():
            return jsonify(ok=False, error='Please choose a mood from the list.'), 400
        flash('Please choose a mood from the list.')
        return redirect(url_for('main.index'))

    current_user.preferred_mood = mood

    mood_entry = MoodHistory(
        mood=mood,
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
        user_id=current_user.id
    )

    db.session.add(mood_entry)
    db.session.commit()

    if wants_json():
        return jsonify(ok=True, mood=mood, message='Mood saved: ' + mood + '. Your mix will adapt.')
    flash('Your mood has been updated. Your music mix will adapt!')
    return redirect(url_for('main.index'))


@main_bp.route('/music', methods=['GET'])
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

    return render_template(
        'music.html',
        songs=songs,
        playlists=_user_playlists(),
        all_tracks=CATALOG_TRACKS,
        moods=mood_cards(),
        languages=sorted({t.get('language') for t in CATALOG_TRACKS if t.get('language')}),
        genres=sorted({t.get('genre') for t in CATALOG_TRACKS if t.get('genre')}),
        filters={
            'q': request.args.get('q', '').strip(),
            'language': request.args.get('language', '').strip(),
            'mood': request.args.get('mood', '').strip(),
            'genre': request.args.get('genre', '').strip(),
            'singer': request.args.get('singer', '').strip(),
        },
    )


def _render_catalog_track(song, queue_catalog_tracks=None, autoplay=None):
    queue_source = queue_catalog_tracks if queue_catalog_tracks is not None else CATALOG_TRACKS
    queue_tracks = [track_payload(track) for track in queue_source]
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
        autoplay=bool(request.args.get('autoplay')) if autoplay is None else autoplay,
    )


@main_bp.route('/listen/<slug>')
def listen(slug):
    song = next((track for track in CATALOG_TRACKS if track['slug'] == slug), None)
    if song is None:
        abort(404)
    return _render_catalog_track(song)


@main_bp.route('/play/<int:music_id>')
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
        queue_tracks=[{
            'slug': 'music-%s' % song.id, 'id': song.id, 'url': url_for('main.play', music_id=song.id),
            'title': getattr(song, 'title', '') or 'MOODIFY track', 'artist': getattr(song, 'artist', '') or '',
            'composer': '', 'description': '', 'genre': '', 'mood': '', 'language': '', 'duration': '',
            'audio_url': audio_url or '', 'fallback_audio_url': '', 'source_url': '', 'license_label': '',
            'license_url': '', 'credit': '', 'art_class': '', 'is_instrumental': False, 'video_embed_url': '',
            'lyrics': '', 'lyrics_authorized': False, 'lyrics_credit': '', 'lyrics_source_url': '',
            'karaoke_audio_url': '', 'karaoke_authorized': False,
        }],
        current_track_index=0,
        autoplay=False,
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
        total_label=_total_duration([row['song'] for row in playlist_tracks]),
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
        message, added = 'That track is already in this playlist.', False
    else:
        db.session.add(PlaylistCatalogTrack(
            playlist_id=selected_playlist.id,
            catalog_slug=slug,
        ))
        db.session.commit()
        message, added = 'Track added to your playlist.', True
    if wants_json():
        return jsonify(ok=True, added=added, message=message, playlist=selected_playlist.id, slug=slug)
    flash(message)
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
    return _render_catalog_track(queue[0], queue_catalog_tracks=queue, autoplay=True)


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
    return render_template(
        'profile.html',
        playlist_count=Playlist.query.filter_by(user_id=current_user.id).count(),
        favorite_count=FavoriteTrack.query.filter_by(user_id=current_user.id).count(),
        checkin_count=MoodHistory.query.filter_by(user_id=current_user.id).count(),
    )


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

SETUP_LANGUAGES = [
    'Telugu', 'Hindi', 'English', 'Tamil', 'Kannada', 'Malayalam',
    'Bengali', 'Marathi', 'Punjabi', 'Urdu', 'Other',
]

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

        return redirect(url_for('main.index'))

    return render_template('setup.html', languages=SETUP_LANGUAGES)



# ==========================================
# MOOD PAGES (public)
# ==========================================

@main_bp.route('/moods')
def moods():
    counts = Counter((track.get('mood') or '') for track in CATALOG_TRACKS)
    return render_template('moods.html', moods=mood_cards(), mood_counts=counts)


@main_bp.route('/mood/<name>')
def mood_page(name):
    chosen = next((m for m in mood_cards() if m.casefold() == name.casefold()), None)
    if chosen is None:
        abort(404)
    tracks = [t for t in CATALOG_TRACKS if (t.get('mood') or '').casefold() == chosen.casefold()]
    return render_template('mood.html', mood=chosen, tracks=tracks, moods=mood_cards())


# ==========================================
# FAVOURITES (additive feature: heart a track to find it again)
# ==========================================

@main_bp.route('/favorites')
@login_required
def favorites():
    lookup = {track['slug']: track for track in CATALOG_TRACKS}
    saved = [lookup[slug] for slug in _favorite_slugs() if slug in lookup]
    return render_template('favorites.html', tracks=saved, playlists=_user_playlists())


@main_bp.route('/favorites/toggle', methods=['POST'])
@login_required
def toggle_favorite():
    slug = request.form.get('slug', '').strip()
    if not any(track['slug'] == slug for track in CATALOG_TRACKS):
        abort(404)
    existing = FavoriteTrack.query.filter_by(user_id=current_user.id, catalog_slug=slug).first()
    if existing:
        db.session.delete(existing)
        favorite = False
    else:
        db.session.add(FavoriteTrack(user_id=current_user.id, catalog_slug=slug))
        favorite = True
    db.session.commit()
    message = 'Added to your favourites.' if favorite else 'Removed from your favourites.'
    if wants_json():
        return jsonify(ok=True, favorite=favorite, slug=slug, message=message, favorites=_favorite_slugs())
    flash(message)
    return redirect(_safe_next(request.form.get('next')) or url_for('main.favorites'))
