# MOODIFY

An AI‑based music web application built with Flask, MySQL and a simple front‑end.

## Features
- User registration and login
- Browse music by language, mood and artist
- Play audio, view lyrics, watch video (placeholder)
- Playback speed, reverb and karaoke toggles (demo placeholders)
- Create personal playlists
- Mood history visualised with a line chart
- Simple AI‑style random recommendations
- User profile and logout

## Prerequisites
- **Python 3.9+** installed and added to your PATH
- **MySQL Server** running locally (or remote)
- **Git** (optional, for cloning)

## Setup Steps (Beginner Friendly)
1. **Create a MySQL database**
   ```sql
   CREATE DATABASE moodify_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
   Use any username/password you like – remember them for later.

2. **Open a terminal (PowerShell)** and navigate to the project folder `C:\MOODIFY`.
   ```powershell
   cd C:\MOODIFY
   ```

3. **Create a virtual environment** (isolates packages).
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1   # PowerShell activation
   ```

4. **Install required Python packages**
   ```powershell
   pip install -r requirements.txt
   ```
5. **Configure the database connection**
   - Copy `.env.example` to a new file named `.env`.
   - Open `.env` and enter your MySQL username, password, host and database name.
   - Set `SECRET_KEY` to a long random value.
   - Never upload or share your `.env` file. It contains private credentials.
   - The `.gitignore` file excludes `.env` from Git uploads.

6. **Create tables and seed some demo music**
   ```powershell
   python seed_data.py
   ```
   This will create the tables and insert a few royalty‑free songs (audio files are not included – the demo will show placeholder messages).

7. **Run the application**
   ```powershell
   python run.py
   ```
   The server starts at `http://127.0.0.1:5000`. Open this URL in your browser.

8. **Register a new account** and explore the features!

## Project Structure
````
MOODIFY/
│   run.py               # entry point
│   config.py            # config values
│   requirements.txt
│   seed_data.py         # creates DB tables & demo data
│
├───app/
│   │   __init__.py      # Flask factory
│   │   models.py
│   │   auth.py
│   │   main.py
│   │
│   ├───templates/      # HTML pages
│   └───static/
│       ├───css/
│       ├───js/
│       └───media/      # put audio/video files here
```

## Notes for Beginners
- The **audio/video files** are looked for in `app/static/media/`. You can place any `.mp3` or `.mp4` files there and reference them in the database.
- The *reverb* and *karaoke* buttons are just placeholders; implementing real audio effects requires extra JavaScript libraries.
- The **AI recommendations** are currently random songs – you can replace the stub in `app/main.py` with a proper model later.

Enjoy building with MOODIFY!

## App shell, guest browsing and motion layer
Moodify opens straight on the Spotify-style home page (`/`) with no login page or splash screen. Every page uses
the same shell: a left sidebar (navigation + your playlists), a top bar (search, mood pills,
Log in / Sign up or your account menu), a scrolling workspace and a bottom player. On phones the sidebar
becomes a bottom navigation bar.

- **No login page.** `/` is always the home page. While you are logged out it works as a preview: you can scroll and look around freely, and the first real click on anything (a mood, a track, a play button, the search bar, a sidebar link) opens a centred **Log in / Create account** pop-up over a dimmed page instead of doing its action. The pop-up has tabs for Log in and Create account, inline error messages under each field, a loading state on the button and a show/hide password button. Close it with the X, Esc, the backdrop or "Not now"; clicking again reopens it. The logic is `guestClickGate` in `app/static/js/app.js`, and `MoodifyApp.isAuthenticated` (also `data-auth="guest|user"` on `<html>`) tells scripts which state the page is in.
- **Old login URLs.** `/login` and `/register` now redirect to `/?auth=login` and `/?auth=register` (the pop-up opens on the right tab, and `?next=/some/page` is kept if it is a safe local path). `POST /login` and `POST /register` are unchanged; the pop-up posts to them in the background and shows `{ok, error, field}` answers. After a successful login or sign-up the pop-up closes and the page reloads as a member. The login cookie is a "remember me" cookie that lasts 30 days (`REMEMBER_COOKIE_DURATION` in `config.py`).
- **Members-only pages.** Playlists, Favourites, Profile, Mood journal, Recommendations and Setup still need an account; opening one directly while logged out shows an in-shell "Log in to continue" page (HTTP 401).
- **Health check.** `GET /health` returns `{"status": "ok"}` (HTTP 200) with no database access. Point an uptime pinger such as UptimeRobot at `https://<your-site>/health` (every 5 to 10 minutes) to keep the free Render server awake.
- **Fast navigation.** `app/static/js/app.js` swaps only the main workspace (about 100 ms fade-out, 180 ms fade-in) and keeps the sidebar, top bar and the single `<audio>` player alive, so music keeps playing while you move around. Links are prefetched on hover. Anything it cannot handle falls back to a normal page load, and `data-pjax="off"` opts a link out.
- **Pages.** Home, Search, Moods, Playlists, Playlist detail (cover header, track table with hover play, duration, mood tags, quick actions), Favourites, Mood journal, Recommendations, Profile, Settings and Now Playing all share the design in `app/static/css/dashboard.css` + `pages.css`. Templates extend `shell.html`; shared pieces live in `_cards.html` and `_icons.html`.
- **Favourites.** New `FavoriteTrack` table (created automatically by `db.create_all()`, additive) and `POST /favorites/toggle`.
- **No interface sounds.** Clicks, hovers and buttons are silent; only the music itself plays audio. (An old `moodify.sound` preference left in the browser is removed automatically.)
- **Sharp corners everywhere.** Every card, tile, button, input, badge, menu, the sidebar and the Log in / Create account pop-up uses square 90-degree corners with thin 1px borders. All radius values in the custom CSS are `0`, and `app/static/css/sharp.css` (loaded last) is a safety net that also zeroes `--radius`, Bootstrap's radius variables, slider thumbs, scrollbars and file buttons. If you ever want one rounded element back, change it in `sharp.css` rather than editing many files.
- **Musical staff ribbon and floating notes.** A faint 5-line musical staff with treble and bass clefs and notes drifts slowly across the top of the workspace (`#staff` in `shell.html`, drawn by `app/static/js/staff.js` and styled in `app/static/css/staff.css`). It glows warm amber into cool blue and takes on the colour of your saved mood. Hovering a mood tile, a track card or a playlist card, and playing a track (on the playing card and the bottom player bar), sends a few small notes floating up and fading. Everything is drawn in code (no image file), is decorative only (`pointer-events: none`, behind the content, `aria-hidden`), animates only `transform` and `opacity`, pauses when scrolled out of view or when the tab is hidden, and is switched off by `prefers-reduced-motion` (the ribbon stays as a still picture, the floating notes are hidden) and by `?fx=off`.
- Data for the shell comes from a context processor in `app/main.py` and is written into `#appData`. Mood check-ins still post to `/mood-checkin`; playlists still use `/playlist/...`.

The rest of the interface has an optional front-end layer (ambient background, scroll reveals, magnetic buttons, tilt cards).

- Files: `app/static/css/fx.css`, `app/static/css/fx-flair.css` and `app/static/js/fx/*.js`, loaded from `base.html`. No backend code is involved.
- `art.js` replaces the mood drop-downs on the setup page with icon tiles (the real `<select>` stays in the form) and draws generated cover art for tracks and playlists. No images are downloaded.
- Libraries (GSAP, ScrollTrigger, Lenis) and the Inter font are stored in `app/static/vendor/` (see its README for versions and licences). Nothing is loaded from a CDN by this layer.
- Performance: no live blur is used, and the page switches itself to a lighter "lite" mode if it measures low frame rates (phones start in lite mode). Force it with `?fx=lite`, or back with `?fx=rich`.
- It respects `prefers-reduced-motion`; the cursor, tilt and magnetic effects are disabled on touch devices.
- To see the site without the scripts, add `?fx=off` to any URL.
- Smoke tests: `python -m pytest tests`
