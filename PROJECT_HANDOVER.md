# MOODIFY — Project Handover

_Last reviewed: 24 November 2026_

This document is the handover guide for the existing MOODIFY repository. Read it before changing code. The project is already in GitHub; do not recreate it from scratch.

## 1. Project overview

MOODIFY is a Flask-based music web application with account registration/login, preference onboarding, a curated music library, personal playlists, mood check-ins, a Moodometer, and preference-based recommendations.

- Repository: https://github.com/yashgupta26cs-lang/MOODIFY
- Production site: https://moodify-yiyp.onrender.com
- Main branch: `main`
- Python entry point: `run.py`
- Flask application factory: `app/__init__.py`
- Main routes: `app/main.py`
- Curated catalogue: `app/music_catalog.py`
- Database models: `app/models.py`
- Templates: `app/templates/`
- Static assets: `app/static/`

## 2. Technology

- Python and Flask
- Flask-Login for session-based authentication
- Flask-SQLAlchemy / SQLAlchemy for database access
- Flask-Migrate is included in the dependencies
- PyMySQL for MySQL-compatible database connections
- python-dotenv for local environment configuration
- Gunicorn for production serving
- Render for hosting
- MySQL-compatible hosted database (the production deployment has used TiDB Cloud)

The Render start command used by the deployment is:

```bash
gunicorn --bind 0.0.0.0:$PORT run:app
```

Do not put real credentials in source files or this document. Local secrets belong in an ignored `.env` file; production secrets belong in the hosting provider's environment settings.

## 3. Existing functionality

### Accounts and onboarding
- Registration and login routes are present.
- The account model stores username, email, mobile number, password hash field, preferred language, preferred mood, and favourite singer.
- The setup/onboarding flow collects listening preferences.
- Verify password hashing, validation, password reset, and account recovery before treating those flows as production-ready.

### Discover / Home
- The home route requires login.
- It displays a personalised greeting and curated tracks.
- Track ordering uses the user's saved language, mood, and favourite-singer preferences where catalogue metadata allows a match.
- The current catalogue is very small, so personalisation is limited by available track metadata.

### Music library and listening
- `/music` displays the curated catalogue and supports filtering/searching by available metadata.
- `/listen/<slug>` opens a curated catalogue track.
- `/play/<int:music_id>` retains support for catalogue IDs and legacy database-backed music records.
- The player template contains the custom listening interface and mode controls. Treat video, lyrics, karaoke, and audio effects as incomplete unless each mode has a valid, authorised asset and has been tested end to end.
- Do not claim slowed/reverb, karaoke, lyrics, or video works for a track merely because a control is visible.

### Playlists
- Users can create playlists.
- Curated catalogue tracks are saved through the `PlaylistCatalogTrack` table using a catalogue slug.
- Playlist detail, add, remove, delete, and play-queue routes are present.
- The legacy many-to-many relationship to database `Music` records remains in the models. Be careful not to break compatibility while changing playlist storage.
- Test playlist ownership checks and every action with a signed-in account.

### Mood check-ins and Moodometer
- A mood check-in updates the user's preferred mood and creates a `MoodHistory` record.
- The Moodometer route visualises the user's own check-in history and mood distribution.
- The page includes date-range filtering and summary values.
- This is a visualisation of self-reported selections. It is not automatic emotion detection, a medical tool, or a mental-health diagnosis.

### Recommendations
- The recommendations route ranks available catalogue tracks using mood/check-in history and profile preferences such as language and favourite singer.
- The page explains why a track appears.
- This is rule-based preference matching, not a trained machine-learning model.
- With only two catalogue tracks, recommendation variety and the usefulness of singer/language matching are currently very limited.

## 4. Current catalogue and content rights

At the time this handover was prepared, `app/music_catalog.py` contains two public-domain instrumental starter entries:

1. **Air on the G String** — recording credited to Joel Belov and Robert Gayler; composition by J. S. Bach. Source: Wikimedia Commons. The catalogue labels the recording Public Domain Mark 1.0.
2. **Moonlight Sonata** — Beethoven composition; the catalogue credits the audio rendition to a public-domain Mutopia score and Wikimedia Commons. The catalogue labels it Public Domain Mark 1.0.

The catalogue stores source links, licence labels, credits, and audio URLs. Verify the exact file page, licence, attribution requirements, and playback URL before relying on either asset in a public release. The URLs have not been independently playback-tested as part of this handover.

**Important:** Do not add commercial songs, ripped audio, unofficial lyric copies, or unauthorised music videos. Expand the catalogue only with tracks and media that MOODIFY has permission to stream, embed, display, or distribute. Keep a clear source, creator credit, and licence/permission record for every item.

## 5. Visual and product direction

The established visual direction is a premium music-app interface using:
- Dark navy backgrounds
- Seafoam/mint accents
- Cream/light text
- Original, feature-specific visual treatments

Keep the existing design language consistent. Do not replace custom visuals with unrelated generic stock photos. If adding artwork, make sure it genuinely matches the displayed track or feature and that its use is authorised. Prefer original graphics or correctly licensed artwork.

## 6. Important limitations and verification status

Do not assume that a feature is complete just because its page or button exists.

- The catalogue has only two starter instrumental tracks.
- There is no large commercial music catalogue.
- Lyrics, official videos, karaoke backing tracks, and reverb are not complete catalogue-wide features.
- Recommendations are rule-based and constrained by the tiny catalogue.
- The current Moodometer uses user-entered mood check-ins; it does not infer feelings.
- A recent code review confirmed the main routes and templates exist, but a full signed-in browser test of every flow has not been completed in this handover.
- Audio URLs should be checked in an actual browser.
- The repository's README may describe older placeholder/random-demo behaviour. Reconcile it with the current implementation after checking the code; do not assume every README statement is current.
- The application has used `db.create_all()` at startup for additive table creation. This is not a substitute for a deliberate database migration plan. Use Flask-Migrate/Alembic for future schema changes and check the live database carefully before applying migrations.

## 7. Suggested next steps (in order)

1. **Protect the current working version.** Confirm the latest `main` commit and create a backup/tag or a separate working branch before edits.
2. **Audit the codebase.** Read this file, `README.md`, `app/__init__.py`, `app/main.py`, `app/models.py`, `app/music_catalog.py`, authentication files, and the relevant templates. Update this handover if the code differs.
3. **Run the app locally.** Use a fresh virtual environment, install `requirements.txt`, configure a private local `.env` using `.env.example`, create a test database, seed data if appropriate, and start the app. Never copy production credentials into a local prompt or commit.
4. **Test existing features before adding new ones.** Test registration, login/logout, onboarding, music search/filtering, listening, playlist create/add/remove/delete/play, mood check-ins, Moodometer date filters, and recommendations.
5. **Fix reliability and security issues.** Review password hashing, CSRF protection for forms, input validation, ownership checks, session/security settings, error handling, and database migrations. Add automated tests.
6. **Expand the catalogue legally.** Add a track only after confirming its audio source and licence/permission. Store accurate metadata, credit, source URL, licence URL, and any authorised lyrics/video/karaoke assets.
7. **Complete player modes one by one.** Define what each mode should do, ensure there is a real authorised asset for the track, implement it, and test it on desktop and mobile. Do not present placeholder controls as working features.
8. **Improve recommendations after the catalogue grows.** Keep the reason labels honest and test matching against language, mood, and artist metadata.
9. **Update documentation.** Keep `README.md`, this handover, and any setup notes aligned with the actual app.
10. **Deploy safely.** Review the full diff, run tests, use a separate branch and pull request where possible, and deploy only after review. After deployment, check Render logs and test the live site.

## 8. Local development setup

The repository includes `requirements.txt` and `.env.example`. The README has beginner setup instructions. In brief:

1. Install a supported Python version.
2. Open a terminal in the repository folder.
3. Create and activate a virtual environment.
4. Install dependencies with `pip install -r requirements.txt`.
5. Copy `.env.example` to `.env` and fill in local database settings and a private random `SECRET_KEY`.
6. Create the local database.
7. Run the seed script only when appropriate for the local database.
8. Start with `python run.py` and open `http://127.0.0.1:5000`.

Exact setup commands may need adjustment for the developer's operating system and database configuration. Do not commit `.env`.

## 9. Working rules for any coding assistant or collaborator

Use these instructions before making changes:

- First inspect the current repository and summarise what is already implemented. Do not recreate the app.
- Do not make broad redesigns or rewrite unrelated files.
- Preserve the existing navy/mint visual identity and custom track-specific visuals.
- Explain proposed changes in beginner-friendly language.
- Make one focused change at a time.
- Before editing, state which files will change and why.
- Keep existing routes and database compatibility unless a reviewed migration is planned.
- Use only properly licensed or authorised music/media.
- Add or update tests and run them. Report exactly what was tested and what was not.
- Never invent test results, deployment status, track availability, licences, or feature completion.
- Do not expose secrets. If a secret has ever been committed to GitHub, rotate it.
- Prefer a separate branch and a reviewable pull request. Do not push unreviewed changes directly to `main`.
- After code changes, provide a concise change summary, files changed, test results, and any manual steps still needed.

## 10. First task for the next developer

Start with a **read-only audit**. Compare the current repository with this handover, identify any differences or broken/incomplete flows, and produce a prioritised plan. Do not edit code until the plan has been reviewed.

---

This document is a project handover, not a claim that every feature has passed end-to-end testing.
