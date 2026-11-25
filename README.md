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

## Home dashboard and motion layer
The home page (`/home`) is a Spotify-style dashboard: left sidebar (navigation + your playlists), a top bar
(search, quick mood pills, sound on/off, account menu), a scrolling workspace (mood cards, tracks, playlists,
tools) and a bottom player that stays visible while you browse the dashboard. On phones the sidebar becomes a
bottom navigation bar.

- Files: `app/templates/home.html`, `app/static/css/dashboard.css`, `app/static/js/dashboard.js`. The page gets its data from the existing `home()` route, which now also passes `all_tracks` and the user's `playlists` (purely additive). Mood check-ins still post to `/mood-checkin`; playlist creation still posts to `/playlist/create`.
- Filtering, search and playlist views happen in the page with no reload. The player plays the catalogue audio directly and remembers its place if you open another page and come back in the same tab (audio itself stops when you leave the dashboard; use "Open full player" for lyrics and modes).
- There are no intro screens, curtains or page-transition delays anywhere. Pages fade in over about 180 ms.

The rest of the interface has an optional front-end layer (ambient background, scroll reveals, magnetic buttons, tilt cards, synthesised interface sounds with a Sound button in the header).

- Files: `app/static/css/fx.css`, `app/static/css/fx-flair.css` and `app/static/js/fx/*.js`, loaded from `base.html`. No backend code is involved.
- `art.js` replaces the mood drop-downs on the setup page with icon tiles (the real `<select>` stays in the form) and draws generated cover art for tracks and playlists. No images are downloaded.
- Libraries (GSAP, ScrollTrigger, Lenis) and the Inter font are stored in `app/static/vendor/` (see its README for versions and licences). Nothing is loaded from a CDN by this layer.
- Performance: no live blur is used, and the page switches itself to a lighter "lite" mode if it measures low frame rates (phones start in lite mode). Force it with `?fx=lite`, or back with `?fx=rich`.
- It respects `prefers-reduced-motion`; the cursor, tilt and magnetic effects are disabled on touch devices.
- To see the site without the scripts, add `?fx=off` to any URL.
- Smoke tests: `python -m pytest tests`
