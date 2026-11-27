/* MOODIFY app shell
 *
 * The sidebar, top bar and bottom player are drawn once by the server and then
 * kept alive for the whole visit. Clicking a link or sending a form only swaps
 * the workspace in the middle (a 100 ms fade out and an 180 ms fade in), so the
 * music never stops and nothing "reloads". If anything goes wrong the browser
 * falls back to a normal page load, so every link keeps working.
 *
 * This file owns:
 *   - the bottom player (play, pause, queue, seek, volume, keyboard, resume)
 *   - navigation (links, forms, back/forward) and the page lifecycle
 *   - the Log in / Sign up pop-up, favourites, "add to playlist", toasts
 * Per-page behaviour lives in pages.js and registers with MoodifyApp.page().
 * Sound effects live in sound.js and are completely separate.
 */
(function (global) {
  'use strict';
  var doc = document;
  var FX = global.MoodifyFX || {};
  var Sound = function () { return global.MoodifySound; };
  var App = global.MoodifyApp = global.MoodifyApp || {};
  var pages = App.pages = {};
  App.page = function (id, fn) { pages[id] = fn; };

  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };
  var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = global.matchMedia && global.matchMedia('(hover: hover) and (pointer: fine)').matches;
  App.reduced = reduced;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  App.esc = esc; App.fmt = fmt; App.$ = $; App.$$ = $$;

  var ICON = {
    play: '<svg viewBox="0 0 24 24" class="fill" aria-hidden="true"><path d="M8 5.200v13.600a.8.8 0 0 0 1.200.7l10.800-6.800a.8.8 0 0 0 0-1.400L9.200 4.500A.8.8 0 0 0 8 5.200z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" class="fill" aria-hidden="true"><rect x="6.500" y="5" width="3.800" height="14" rx="1.200"/><rect x="13.700" y="5" width="3.800" height="14" rx="1.200"/></svg>',
    vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.500h3.500L12 5.500v13l-4.500-4H4z"/><path d="M15.500 9a4.200 4.200 0 0 1 0 6M18 6.500a7.700 7.700 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.500h3.500L12 5.500v13l-4.500-4H4z"/><path d="m16 9.500 5 5M21 9.500l-5 5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.500-4.600-7.500-10.300A4.300 4.300 0 0 1 12 7.200a4.300 4.300 0 0 1 7.500 2.500C19.500 15.400 12 20 12 20z"/></svg>',
    heartFill: '<svg viewBox="0 0 24 24" class="fill" aria-hidden="true"><path d="M12 20s-7.500-4.600-7.500-10.300A4.300 4.300 0 0 1 12 7.200a4.300 4.300 0 0 1 7.500 2.500C19.500 15.400 12 20 12 20z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.500 4.500 4.500L19 7.500"/></svg>'
  };
  App.icons = ICON;

  var dash, work, inner, data, bySlug, favs, signedIn;
  var cleanups = [];
  App.onCleanup = function (fn) { cleanups.push(fn); };

  function readData() {
    var el = $('#appData');
    data = el ? JSON.parse(el.textContent) : { tracks: [], playlists: [], favorites: [], urls: {}, moods: [], saveable: [] };
    bySlug = {};
    data.tracks.forEach(function (t) { bySlug[t.slug] = t; });
    favs = {};
    (data.favorites || []).forEach(function (s) { favs[s] = true; });
    signedIn = !!data.signedIn;
    doc.documentElement.setAttribute('data-auth', signedIn ? 'user' : 'guest');
    App.data = data;
  }

  /* ================================ toasts ================================ */
  function toast(text, kind) {
    var box = $('#toasts');
    if (!box || !text) return;
    while (box.children.length > 2) box.removeChild(box.firstChild);
    var a = doc.createElement('div');
    a.className = 'dash-toast' + (kind ? ' ' + kind : '');
    a.setAttribute('role', 'status');
    a.textContent = text;
    box.appendChild(a);
    global.setTimeout(function () { a.classList.add('bye'); global.setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 220); }, 3400);
  }
  App.toast = toast;
  function flashToToasts(root) {
    $$('body > .container > .alert', root).forEach(function (a) {
      toast((a.textContent || '').trim());
      if (root === doc) a.parentNode.removeChild(a);
    });
  }

  /* ================================ covers, glyphs, mood colour ================================ */
  function moodRgb(m) {
    var p = FX.moods && FX.moods[m];
    return p && FX.hexToRgb ? FX.hexToRgb(p.colors[0]).join(',') : '131,232,199';
  }
  App.moodRgb = moodRgb;
  function paintCovers(root) {
    $$('[data-cover]', root || doc).forEach(function (el) {
      if (el.__covered) return;
      el.__covered = true;
      if (FX.cover) el.insertBefore(FX.cover(el.getAttribute('data-cover'), el.getAttribute('data-cover-mood') || ''), el.firstChild);
    });
  }
  function paintGlyphs(root) {
    $$('[data-glyph]', root || doc).forEach(function (h) {
      if (h.__glyph) return;
      h.__glyph = true;
      var m = h.getAttribute('data-glyph');
      var path = FX.moodGlyphs && FX.moodGlyphs[m];
      h.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (path || '<circle cx="12" cy="12" r="8"/>') + '</svg>';
      var host = h.closest('.dash-mood, .mood-link-tile, .mood-hero');
      if (host) host.style.setProperty('--m-rgb', moodRgb(m));
    });
  }
  App.paintCovers = paintCovers;
  App.paintGlyphs = paintGlyphs;

  /* ================================ scrolling ================================ */
  var lenis = null;
  function setupScroll() {
    if (!(global.Lenis && !reduced && fine)) return;
    try {
      lenis = new global.Lenis({ wrapper: work, content: inner, lerp: 0.12, smoothWheel: true, syncTouch: false });
      var raf = function (t) { lenis.raf(t); global.requestAnimationFrame(raf); };
      global.requestAnimationFrame(raf);
      $$('.dash-side-lists, .dash-pills').forEach(function (el) { el.setAttribute('data-lenis-prevent', ''); });
    } catch (e) { lenis = null; }
  }
  function scrollToEl(el, immediate) {
    var top = el ? el.getBoundingClientRect().top - work.getBoundingClientRect().top + work.scrollTop - 6 : 0;
    if (el && el.id === 'top') top = 0;
    if (lenis && !immediate) lenis.scrollTo(top, { duration: 0.45, easing: function (t) { return 1 - Math.pow(1 - t, 3); } });
    else if (lenis) lenis.scrollTo(top, { immediate: true });
    else work.scrollTo({ top: top, behavior: (reduced || immediate) ? 'auto' : 'smooth' });
  }
  App.scrollToEl = scrollToEl;

  /* ================================ player ================================ */
  var audio, el = {};
  var player = { queue: [], index: -1, track: null };
  var seeking = false, triedFallback = false, msgTimer = 0;

  function norm(t) {
    // accepts a shell track ({audio, fallback}) or a full server payload ({audio_url, ...})
    var base = bySlug[t.slug] || {};
    var out = {};
    var k;
    for (k in base) out[k] = base[k];
    for (k in t) out[k] = t[k];
    out.audio = t.audio || t.audio_url || base.audio || '';
    out.fallback = t.fallback || t.fallback_audio_url || base.fallback || '';
    out.url = t.url || base.url || '';
    return out;
  }
  function setRange(input, pct) { input.style.setProperty('--p', pct + '%'); }
  function message(text) {
    el.msg.textContent = text;
    el.msg.hidden = false;
    global.clearTimeout(msgTimer);
    msgTimer = global.setTimeout(function () { el.msg.hidden = true; }, 5000);
  }
  function emit(type) { doc.dispatchEvent(new global.CustomEvent('moodify:player', { detail: { type: type, track: player.track } })); }

  function live() { return !!player.track && !audio.paused && !audio.ended; }

  function markPlaying() {
    var isLive = live();
    var slug = player.track ? player.track.slug : '';
    $$('[data-slug]', inner).forEach(function (card) {
      var on = !!slug && card.getAttribute('data-slug') === slug;
      card.classList.toggle('is-playing', on);
      card.classList.toggle('is-live', on && isLive);
    });
    $$('[data-play-slug]', inner).forEach(function (b) {
      var on = !!slug && b.getAttribute('data-play-slug') === slug && isLive;
      var next = on ? 'pause' : 'play';
      if (b.__icon !== next) { b.__icon = next; b.innerHTML = ICON[next]; }
      var t = bySlug[b.getAttribute('data-play-slug')];
      b.setAttribute('aria-label', (on ? 'Pause ' : 'Play ') + (t ? t.title : 'track'));
    });
    var np = $('#npPlay', inner);
    if (np) {
      var here = !!slug && np.closest('#np') && np.closest('#np').getAttribute('data-slug') === slug;
      var playingHere = here && isLive;
      np.querySelector('span').innerHTML = (playingHere ? ICON.pause : ICON.play) + '<b>' + (playingHere ? 'Pause' : 'Play') + '</b>';
    }
  }
  function paintNow() {
    var t = player.track;
    el.shell.setAttribute('data-empty', t ? 'false' : 'true');
    el.title.textContent = t ? t.title : 'Nothing playing';
    el.artist.textContent = t ? t.artist : 'Press play on any track';
    el.cover.innerHTML = '';
    if (t && FX.cover) el.cover.appendChild(FX.cover(t.title, t.mood));
    el.full.href = t && t.url ? t.url : (data.urls.library || '/music');
    var multi = player.queue.length > 1;
    el.prev.disabled = !t || !multi;
    el.next.disabled = !t || !multi;
    el.heart.hidden = !t || !bySlug[t.slug];
    if (t) paintFav(t.slug);
    if (t && 'mediaSession' in global.navigator && global.MediaMetadata) {
      try { global.navigator.mediaSession.metadata = new global.MediaMetadata({ title: t.title, artist: t.artist, album: 'MOODIFY' }); } catch (e) { /* optional */ }
    }
  }
  function paintPlayButton() {
    var playing = live();
    el.play.innerHTML = playing ? ICON.pause : ICON.play;
    el.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    markPlaying();
    emit('state');
  }

  function load(t, queue, startAt) {
    t = norm(t);
    player.track = t;
    if (queue) player.queue = queue.map(norm);
    player.index = -1;
    player.queue.forEach(function (q, i) { if (q.slug === t.slug) player.index = i; });
    if (player.index < 0) { player.queue.push(t); player.index = player.queue.length - 1; }
    triedFallback = false;
    audio.src = t.audio || t.fallback || '';
    if (startAt) {
      audio.addEventListener('loadedmetadata', function once() {
        audio.removeEventListener('loadedmetadata', once);
        if (isFinite(audio.duration)) audio.currentTime = Math.min(startAt, Math.max(0, audio.duration - 0.5));
      });
    }
    el.seek.value = 0; setRange(el.seek, 0);
    el.now.textContent = '0:00'; el.end.textContent = t.duration || '0:00';
    el.seek.disabled = !t.audio && !t.fallback;
    paintNow();
    paintPlayButton();
    emit('track');
  }
  function startPlayback() {
    var p = audio.play();
    if (p && p.catch) p.catch(function () { paintPlayButton(); message('Press play to start the track.'); });
  }
  function playTrack(t, queue) {
    if (player.track && player.track.slug === t.slug && audio.src) { toggle(); return; }
    load(t, queue || player.queue);
    startPlayback();
  }
  function toggle() {
    if (!player.track) {
      var first = data.tracks[0];
      if (first) playTrack(first, data.tracks);
      return;
    }
    if (audio.paused || audio.ended) {
      var p = audio.play();
      if (p && p.catch) p.catch(function () { message('This track could not be played right now.'); });
    } else audio.pause();
  }
  function step(dir) {
    if (!player.track || player.queue.length < 2) return;
    var i = (player.index + dir + player.queue.length) % player.queue.length;
    load(player.queue[i], null);
    startPlayback();
  }
  function previous() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    step(-1);
  }
  /* open a track in the player without starting it (used when a Now Playing page loads) */
  function open(t, queue, autoplay) {
    if (player.track && player.track.slug === t.slug) {
      if (queue && queue.length) { player.queue = queue.map(norm); player.index = Math.max(0, player.queue.map(function (q) { return q.slug; }).indexOf(t.slug)); paintNow(); }
      if (autoplay && (audio.paused || audio.ended)) startPlayback();
      return;
    }
    if (live() && !autoplay) return;                    // never interrupt what is playing
    load(t, queue);
    if (autoplay) startPlayback();
  }
  /* switch audio source (karaoke mode) keeping the position */
  function swapSource(url, fallback, resume) {
    if (!player.track || !url) return;
    var current = audio.currentTime || 0;
    audio.pause();
    audio.src = url;
    triedFallback = !fallback;
    audio.dataset.alt = fallback || '';
    audio.load();
    audio.addEventListener('loadedmetadata', function once() {
      audio.removeEventListener('loadedmetadata', once);
      if (current && isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Math.min(current, audio.duration);
      if (resume) startPlayback();
    });
  }

  var Player = App.player = {
    audio: null, play: playTrack, open: open, toggle: toggle, next: function () { step(1); }, prev: previous,
    swapSource: swapSource, message: message,
    current: function () { return player.track; },
    queue: function () { return player.queue.slice(); },
    live: live
  };

  function slugsToTracks(slugs) { return slugs.map(function (s) { return bySlug[s]; }).filter(Boolean); }

  function visibleSlugs(scope) {
    var out = [];
    $$('[data-play-slug]', scope).forEach(function (b) {
      if (b.closest('.hide, [hidden]')) return;
      var s = b.getAttribute('data-play-slug');
      if (out.indexOf(s) < 0) out.push(s);
    });
    return out;
  }
  function playFromButton(b) {
    var slug = b.getAttribute('data-play-slug');
    var t = bySlug[slug];
    if (!t) return;
    var scope = b.closest('[data-queue-scope]');
    var queue = scope ? slugsToTracks(visibleSlugs(scope)) : [t];
    if (player.track && player.track.slug === slug) toggle(); else playTrack(t, queue.length ? queue : [t]);
  }
  function playPlaylist(id) {
    var pl = null;
    data.playlists.forEach(function (p) { if (String(p.id) === String(id)) pl = p; });
    if (!pl) return;
    var q = slugsToTracks(pl.slugs);
    if (!q.length) { toast('Add tracks to “' + pl.name + '” first.'); return; }
    playTrack(q[0], q);
  }
  function playAll() {
    var scope = $('[data-queue-scope]', inner) || inner;
    var q = slugsToTracks(visibleSlugs(scope));
    if (!q.length) { toast('Nothing to play here yet.'); return; }
    playTrack(q[0], q);
  }

  function setVolume(v, remember) {
    audio.volume = v;
    el.vol.value = String(Math.round(v * 100));
    setRange(el.vol, v * 100);
    el.mute.innerHTML = v === 0 ? ICON.mute : ICON.vol;
    el.mute.setAttribute('aria-label', v === 0 ? 'Unmute' : 'Mute');
    if (remember) { try { global.localStorage.setItem('moodify.vol', String(v)); } catch (e) { /* ignore */ } }
  }

  function buildPlayer() {
    audio = Player.audio = $('#audioPlayer');
    el = {
      shell: $('#dashPlayer'), title: $('#nowTitle'), artist: $('#nowArtist'), cover: $('#nowCover'), heart: $('#nowHeart'),
      play: $('#btnPlay'), prev: $('#btnPrev'), next: $('#btnNext'), seek: $('#seek'),
      now: $('#timeNow'), end: $('#timeEnd'), vol: $('#vol'), mute: $('#btnMute'), full: $('#openFull'), msg: $('#playerMsg')
    };
    el.play.addEventListener('click', toggle);
    el.prev.addEventListener('click', previous);
    el.next.addEventListener('click', function () { step(1); });
    el.heart.addEventListener('click', function () { if (player.track) toggleFavorite(player.track.slug); });

    audio.addEventListener('play', paintPlayButton);
    audio.addEventListener('pause', paintPlayButton);
    audio.addEventListener('ended', function () { if (player.queue.length > 1) step(1); else paintPlayButton(); });
    audio.addEventListener('loadedmetadata', function () { if (isFinite(audio.duration)) el.end.textContent = fmt(audio.duration); });
    audio.addEventListener('timeupdate', function () {
      var d = audio.duration;
      el.now.textContent = fmt(audio.currentTime);
      if (isFinite(d) && d > 0 && !seeking) {
        var v = Math.round((audio.currentTime / d) * 1000);
        el.seek.value = String(v);
        setRange(el.seek, v / 10);
      }
    });
    audio.addEventListener('error', function () {
      var t = player.track;
      var alt = audio.dataset.alt || (t && t.fallback);
      if (t && !triedFallback && alt && audio.src.indexOf(alt) === -1) {
        triedFallback = true;
        audio.src = alt;
        var p = audio.play();
        if (p && p.catch) p.catch(function () { /* handled by the next error */ });
        return;
      }
      paintPlayButton();
      message('This track could not be played here. Try another one.');
    });
    el.seek.addEventListener('input', function () {
      seeking = true;
      setRange(el.seek, el.seek.value / 10);
      if (isFinite(audio.duration)) el.now.textContent = fmt((el.seek.value / 1000) * audio.duration);
    });
    el.seek.addEventListener('change', function () {
      if (isFinite(audio.duration)) audio.currentTime = (el.seek.value / 1000) * audio.duration;
      seeking = false;
    });

    var savedVol = 0.8;
    try { var sv = parseFloat(global.localStorage.getItem('moodify.vol')); if (sv >= 0 && sv <= 1) savedVol = sv; } catch (e) { /* ignore */ }
    var lastVol = savedVol || 0.8;
    setVolume(savedVol, false);
    el.vol.addEventListener('input', function () { var v = el.vol.value / 100; if (v > 0) lastVol = v; setVolume(v, true); });
    el.mute.addEventListener('click', function () { setVolume(audio.volume === 0 ? lastVol : 0, true); });

    doc.addEventListener('keydown', function (e) {
      if (e.key !== ' ' || e.repeat) return;
      var t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, button, a, summary, [role="radio"], [role="tab"]')) return;
      if ($('#authModal') && !$('#authModal').hidden) return;
      e.preventDefault();
      toggle();
    });

    if ('mediaSession' in global.navigator) {
      try {
        var ms = global.navigator.mediaSession;
        ms.setActionHandler('play', toggle);
        ms.setActionHandler('pause', toggle);
        ms.setActionHandler('previoustrack', previous);
        ms.setActionHandler('nexttrack', function () { step(1); });
      } catch (e) { /* optional */ }
    }

    // keep your place if the page does fully reload (for example after logging in)
    var KEY = 'moodify.dash.player';
    function remember() {
      if (!player.track) return;
      try { global.sessionStorage.setItem(KEY, JSON.stringify({ slug: player.track.slug, t: audio.currentTime || 0 })); } catch (e) { /* ignore */ }
    }
    global.addEventListener('pagehide', remember);
    var lastSave = 0;
    audio.addEventListener('timeupdate', function () { var n = Date.now(); if (n - lastSave > 3000) { lastSave = n; remember(); } });
    try {
      var s = JSON.parse(global.sessionStorage.getItem(KEY) || 'null');
      if (s && bySlug[s.slug]) { audio.preload = 'metadata'; load(bySlug[s.slug], data.tracks, s.t); }
    } catch (e) { /* ignore */ }
  }

  /* ================================ favourites ================================ */
  function paintFav(slug) {
    var on = !!favs[slug];
    $$('[data-fav="' + slug + '"]').forEach(function (b) {
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.innerHTML = on ? ICON.heartFill : ICON.heart;
    });
    if (player.track && player.track.slug === slug) {
      el.heart.classList.toggle('on', on);
      el.heart.innerHTML = on ? ICON.heartFill : ICON.heart;
      el.heart.setAttribute('aria-label', on ? 'Remove from favourites' : 'Add to favourites');
    }
  }
  function postJSON(url, params) {
    return global.fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'X-Moodify': 'json', 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new global.URLSearchParams(params || {}).toString()
    }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Something went wrong.' }; }).then(function (j) { j.status = r.status; return j; }); });
  }
  App.postJSON = postJSON;

  function toggleFavorite(slug) {
    if (!signedIn) { openAuth('login', { note: 'Log in to save favourites.' }); return; }
    var was = !!favs[slug];
    favs[slug] = !was;
    if (was) delete favs[slug];
    data.favorites = Object.keys(favs);
    paintFav(slug);
    $$('[data-fav="' + slug + '"]').forEach(function (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); });
    if (Sound()) Sound().play(was ? 'tick' : 'pop');
    if (dash.getAttribute('data-page') === 'favorites' && was) dropFavoriteRow(slug);
    postJSON(data.urls.favorite, { slug: slug }).then(function (j) {
      if (!j.ok) throw new Error(j.error || 'failed');
      if (j.login) { signedIn = false; }
      toast(j.message);
      App.dropCache();
    }).catch(function () {
      // undo the optimistic change
      if (was) favs[slug] = true; else delete favs[slug];
      data.favorites = Object.keys(favs);
      paintFav(slug);
      if (Sound()) Sound().play('error');
      toast('Could not update your favourites. Please try again.');
    });
  }
  function dropFavoriteRow(slug) {
    var row = $('.tl-row[data-slug="' + slug + '"]', inner);
    if (!row) return;
    row.classList.add('gone');
    global.setTimeout(function () {
      var body = row.parentNode;
      row.parentNode.removeChild(row);
      if (!$('.tl-row', body)) body.innerHTML = '<tr class="tl-empty"><td colspan="5">Nothing here yet. Tap the heart on any track to save it to your favourites.</td></tr>';
      else $$('.tl-row .tl-n', body).forEach(function (n, i) { n.textContent = String(i + 1); });
      markPlaying();
    }, 190);
  }

  /* ================================ add to playlist ================================ */
  var menu = null, menuAt = 0;
  function closeMenu() { if (menu) { menu.parentNode.removeChild(menu); menu = null; } }
  function openAddMenu(btn) {
    var slug = btn.getAttribute('data-add-to-playlist');
    if (!signedIn) { openAuth('login', { note: 'Log in to save tracks to playlists.' }); return; }
    closeMenu();
    var t = bySlug[slug];
    menu = doc.createElement('div');
    menu.className = 'pop-menu';
    menu.setAttribute('role', 'menu');
    var html = '<h3>Add to playlist</h3>';
    data.playlists.forEach(function (pl) {
      var has = pl.slugs.indexOf(slug) !== -1;
      html += '<button type="button" role="menuitem" data-sfx="none" data-pl="' + pl.id + '"><span>' + esc(pl.name) + '</span>' + (has ? '<span class="has">Added</span>' : '') + '</button>';
    });
    if (!data.playlists.length) html += '<a href="' + esc(data.urls.playlists) + '#new">Create your first playlist</a>';
    else html += '<div class="sep"></div><a href="' + esc(data.urls.playlists) + '#new">New playlist</a>';
    menu.innerHTML = html;
    dash.appendChild(menu);
    menuAt = Date.now();
    var r = btn.getBoundingClientRect();
    var w = menu.offsetWidth, h = menu.offsetHeight;
    var left = Math.min(Math.max(8, r.right - w), global.innerWidth - w - 8);
    var top = r.bottom + 6;
    if (top + h > global.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-pl]');
      if (!b) return;
      var id = b.getAttribute('data-pl');
      closeMenu();
      postJSON('/playlist/' + id + '/add', { slug: slug }).then(function (j) {
        if (!j.ok) throw new Error(j.error);
        data.playlists.forEach(function (pl) {
          if (String(pl.id) === String(id) && pl.slugs.indexOf(slug) === -1) pl.slugs.push(slug);
        });
        var small = $('[data-playlist-link="' + id + '"] small');
        data.playlists.forEach(function (pl) {
          if (String(pl.id) === String(id) && small) small.textContent = pl.slugs.length + ' track' + (pl.slugs.length === 1 ? '' : 's');
        });
        if (Sound()) Sound().play(j.added ? 'pop' : 'tick');
        toast(j.added ? '“' + (t ? t.title : 'Track') + '” added to your playlist.' : j.message);
        App.dropCache();
      }).catch(function () {
        if (Sound()) Sound().play('error');
        toast('Could not add that track. Please try again.');
      });
    });
  }

  /* ================================ mood save ================================ */
  App.saveMood = function (mood) {
    if (!signedIn) { openAuth('login', { note: 'Log in to save your mood check-ins.' }); return global.Promise.reject(new Error('guest')); }
    return postJSON('/mood-checkin', { mood: mood }).then(function (j) {
      if (!j.ok) throw new Error(j.error || 'failed');
      data.current = mood;
      dash.setAttribute('data-current-mood', mood);
      if (FX.setMood) FX.setMood(mood, { action: true });
      if (Sound()) Sound().play('chime');
      toast(j.message || ('Mood saved: ' + mood + '.'));
      App.dropCache();
      return mood;
    });
  };

  /* ================================ confirm dialog ================================ */
  function confirmDialog(text) {
    return new global.Promise(function (resolve) {
      var wrap = doc.createElement('div');
      wrap.className = 'auth-modal';
      wrap.innerHTML = '<div class="auth-backdrop"></div><div class="auth-card confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="cfT"><h2 id="cfT">Are you sure?</h2><p>' + esc(text) + '</p><div class="confirm-actions"><button type="button" class="dash-btn" data-no><span>Cancel</span></button><button type="button" class="dash-btn danger" data-yes><span>Delete</span></button></div></div>';
      dash.appendChild(wrap);
      var yes = $('[data-yes]', wrap), no = $('[data-no]', wrap);
      function done(v) { doc.removeEventListener('keydown', onKey, true); wrap.parentNode.removeChild(wrap); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); done(false); } }
      doc.addEventListener('keydown', onKey, true);
      yes.addEventListener('click', function () { done(true); });
      no.addEventListener('click', function () { done(false); });
      $('.auth-backdrop', wrap).addEventListener('click', function () { done(false); });
      no.focus();
    });
  }

  /* ================================ Log in / Create account pop-up ================================ */
  var modal, opener = null, authDone = false;
  var RULES = {
    email: function (v) { return !v ? 'Enter your email address.' : (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Enter a valid email, like you@example.com.'); },
    username: function (v) { return v ? '' : 'Pick a username.'; },
    mobile: function (v) { return !v ? 'Enter your mobile number.' : (/^\+?[0-9]{10,15}$/.test(v.replace(/[\s-]/g, '')) ? '' : 'Use 10 to 15 digits, for example 9876543210.'); }
  };
  function ruleFor(form, name, v) {
    if (name === 'password') {
      if (!v) return 'Enter your password.';
      return form.getAttribute('data-auth-form') === 'register' && v.length < 8 ? 'Use at least 8 characters.' : '';
    }
    return RULES[name] ? RULES[name](v) : '';
  }
  function fieldBox(form, name) { return $('.af[data-field="' + name + '"]', form); }
  function setFieldError(form, name, msg) {
    var box = fieldBox(form, name);
    if (!box) return false;
    var p = $('.af-err', box), input = $('input', box);
    if (msg) { p.textContent = msg; p.hidden = false; input.setAttribute('aria-invalid', 'true'); box.classList.add('has-error'); }
    else { p.hidden = true; p.textContent = ''; input.removeAttribute('aria-invalid'); box.classList.remove('has-error'); }
    return true;
  }
  function clearErrors(form) {
    $$('.af', form).forEach(function (box) { setFieldError(form, box.getAttribute('data-field'), ''); });
    var e = $('.auth-error', form); e.hidden = true; e.textContent = '';
  }
  function setAuthMode(root, mode) {
    $$('[data-auth-tab]', root).forEach(function (b) { if (b.getAttribute('role') === 'tab') b.setAttribute('aria-selected', b.getAttribute('data-auth-tab') === mode ? 'true' : 'false'); });
    $$('[data-auth-form]', root).forEach(function (f) { var show = f.getAttribute('data-auth-form') === mode; if (f.hidden === show) { f.hidden = !show; } clearErrors(f); });
    var title = $('#authModalTitle', root);
    if (title) title.textContent = mode === 'register' ? 'Create your account' : 'Log in to MOODIFY';
  }
  function currentPath() {
    var p = global.location.pathname + global.location.search;
    return /^\/(login|register)/.test(p) ? '' : p;
  }
  function openAuth(mode, opts) {
    opts = opts || {};
    if (signedIn || authDone) return;
    modal = modal || $('#authModal');
    if (!modal) { global.location.href = mode === 'register' ? data.urls.register : data.urls.login; return; }
    var already = !modal.hidden;
    if (!already) opener = doc.activeElement;
    setAuthMode(modal, mode || 'login');
    var next = opts.next !== undefined && opts.next !== null && opts.next !== '' ? opts.next : currentPath();
    $$('[data-auth-next]', modal).forEach(function (i) { i.value = next; });
    var note = $('.auth-head p', modal);
    if (note) note.textContent = opts.note || 'Log in or create an account to play music, save playlists and keep your mood journal.';
    modal.hidden = false;
    var first = $('[data-auth-form]:not([hidden]) input:not([type="hidden"])', modal);
    global.setTimeout(function () { if (first) first.focus(); }, 30);
  }
  function closeAuth() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (opener && opener.focus && doc.contains(opener)) opener.focus();
  }
  App.openAuth = openAuth;
  App.closeAuth = closeAuth;
  Object.defineProperty(App, 'isAuthenticated', { get: function () { return signedIn; } });

  // Logged-out visitors: a real click anywhere in the app opens the pop-up. Scrolling, hovering and
  // selecting text do not. Clicks inside the pop-up, and the Sound button, behave normally.
  function guestClickGate(e) {
    if (signedIn || authDone) return;
    var t = e.target;
    if (!t || !t.closest || !dash || !dash.contains(t)) return;
    if (t.closest('#authModal') || t.closest('[data-allow-guest]')) return;
    var sel = global.getSelection && global.getSelection();
    if (sel && !sel.isCollapsed && String(sel).trim()) return;
    var openBtn = t.closest('[data-auth-open]');
    e.preventDefault();
    e.stopPropagation();
    openAuth(openBtn ? openBtn.getAttribute('data-auth-open') : 'login', { next: openBtn ? openBtn.getAttribute('data-auth-next') : '' });
  }

  function tidyValue(form, input) {
    var v = input.value.trim();
    if (input.name === 'mobile') v = v.replace(/[\s-]/g, '');
    if (input.name === 'email') v = v.toLowerCase();
    if (input.name === 'password') v = input.value;
    return v;
  }
  function wireAuthForm(form) {
    var err = $('.auth-error', form);
    var btn = $('button[type="submit"]', form);
    var label = $('.af-label', btn);
    var original = label.textContent;
    clearErrors(form);
    var firstBad = null, params = {};
    $$('input[name]', form).forEach(function (i) {
      var v = tidyValue(form, i);
      params[i.name] = v;
      if (i.type === 'hidden') return;
      var msg = ruleFor(form, i.name, v);
      if (msg) { setFieldError(form, i.name, msg); if (!firstBad) firstBad = i; }
    });
    if (firstBad) { firstBad.focus(); if (Sound()) Sound().play('error'); return; }
    var inputs = $$('input', form);
    function busy(on) {
      btn.disabled = on; btn.classList.toggle('is-loading', on);
      if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
      label.textContent = on ? btn.getAttribute('data-busy-label') : original;
      inputs.forEach(function (i) { if (on) i.setAttribute('readonly', ''); else i.removeAttribute('readonly'); });
    }
    busy(true);
    postJSON(form.getAttribute('action'), params).then(function (j) {
      if (j.ok) {
        authDone = true;                       // unlocked: no more pop-up while the page reloads as a member
        if (Sound()) Sound().play('chime');
        closeAuth();
        global.setTimeout(function () { global.location.assign(j.redirect || '/'); }, 130);
        return;
      }
      busy(false);
      var msg = j.error || 'That did not work. Please try again.';
      if (!(j.field && setFieldError(form, j.field, msg))) { err.textContent = msg; err.hidden = false; }
      else { var bad = $('input[name="' + j.field + '"]', form); if (bad) bad.focus(); }
      if (Sound()) Sound().play('error');
    }).catch(function () {
      busy(false);
      err.textContent = 'We could not reach the server. Check your connection and try again.';
      err.hidden = false;
      if (Sound()) Sound().play('error');
    });
  }
  function wireAuthModal() {
    if (!modal) return;
    modal.addEventListener('input', function (e) {
      var box = e.target.closest && e.target.closest('.af');
      if (box && box.classList.contains('has-error')) setFieldError(e.target.closest('form'), box.getAttribute('data-field'), '');
      var form = e.target.closest && e.target.closest('form');
      if (form) { var g = $('.auth-error', form); if (g) g.hidden = true; }
    });
    modal.addEventListener('focusout', function (e) {
      var i = e.target;
      if (!i || i.tagName !== 'INPUT' || i.type === 'hidden') return;
      var form = i.closest('form');
      if (!form || !i.value) return;
      var msg = ruleFor(form, i.name, tidyValue(form, i));
      if (msg) setFieldError(form, i.name, msg);
    });
    modal.addEventListener('click', function (e) {
      var tog = e.target.closest('[data-pw-toggle]');
      if (!tog) return;
      var input = $('input', tog.closest('.af-pw'));
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      tog.setAttribute('aria-pressed', show ? 'true' : 'false');
      tog.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      input.focus();
    });
  }
  function openFromQuery() {
    // /login and /register no longer have a page of their own: they land here as /?auth=login or /?auth=register.
    var qs;
    try { qs = new global.URLSearchParams(global.location.search); } catch (e) { return; }
    var mode = qs.get('auth');
    if (mode !== 'login' && mode !== 'register') return;
    var next = qs.get('next') || '';
    qs.delete('auth'); qs.delete('next');
    var rest = qs.toString();
    global.history.replaceState({ moodify: 1 }, '', global.location.pathname + (rest ? '?' + rest : '') + global.location.hash);
    if (!signedIn) openAuth(mode, { next: next });
  }

  /* ================================ navigation (the workspace swap) ================================ */
  var cache = {};
  var token = 0;
  App.dropCache = function () { cache = {}; };

  function pageRequest(url, opts) {
    opts = opts || {};
    var init = { credentials: 'same-origin', headers: { 'X-Moodify-Nav': '1' } };
    if (opts.method === 'POST') {
      init.method = 'POST';
      init.body = opts.body;
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    return global.fetch(url, init).then(function (r) {
      return r.text().then(function (text) { return { text: text, url: r.url, status: r.status, redirected: r.redirected }; });
    });
  }
  function prefetch(url) {
    var c = cache[url];
    if (c && Date.now() - c.t < 10000) return c.p;
    var p = pageRequest(url);
    cache[url] = { t: Date.now(), p: p };
    p.catch(function () { delete cache[url]; });
    return p;
  }

  function runScripts(root) {
    $$('script', root).forEach(function (old) {
      var type = old.getAttribute('type');
      if (type && type !== 'text/javascript' && type !== 'module') return;
      var s = doc.createElement('script');
      s.text = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
  }

  function setActiveNav() {
    var key = dash.getAttribute('data-nav') || '';
    $$('[data-nav]', dash).forEach(function (a) {
      if (a.tagName === 'A' || a.tagName === 'BUTTON') a.classList.toggle('active', a.getAttribute('data-nav') === key);
    });
    var pid = (/\/playlist\/(\d+)/.exec(global.location.pathname) || [])[1];
    $$('[data-playlist-link]').forEach(function (a) { a.classList.toggle('on', !!pid && a.getAttribute('data-playlist-link') === pid); });
  }

  function syncSearchBox() {
    var q = $('#dashQuery'), clear = $('#dashQueryClear');
    var m = /[?&]q=([^&]*)/.exec(global.location.search);
    q.value = (dash.getAttribute('data-page') === 'library' && m) ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    clear.hidden = !q.value;
  }

  function pageInit() {
    paintCovers(doc);
    paintGlyphs(doc);
    if (FX.tiles) FX.tiles(inner);
    setActiveNav();
    syncSearchBox();
    var menuEl = $('.dash-menu');
    if (menuEl) menuEl.open = false;
    if (FX.setMood) FX.setMood(data.current || '', { action: false });
    var id = dash.getAttribute('data-page');
    if (pages[id]) {
      try { var c = pages[id](inner, data); if (typeof c === 'function') cleanups.push(c); } catch (e) { if (global.console) console.warn('[page ' + id + ']', e); }
    }
    markPlaying();
  }

  function swapIn(html, finalUrl, opts) {
    var d = new global.DOMParser().parseFromString(html, 'text/html');
    var nd = d.getElementById('dash');
    if (!nd) return false;
    cleanups.splice(0).forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
    closeMenu();
    // 1. the workspace
    inner.innerHTML = d.getElementById('dashInner').innerHTML;
    dash.setAttribute('data-page', nd.getAttribute('data-page') || '');
    dash.setAttribute('data-nav', nd.getAttribute('data-nav') || '');
    doc.title = d.title || doc.title;
    // 2. the parts of the shell that depend on your data (playlists, favourites)
    var newPanel = d.getElementById('sideListsPanel');
    var oldPanel = $('#sideListsPanel');
    if (newPanel && oldPanel) oldPanel.innerHTML = newPanel.innerHTML;
    var signChanged = (nd.getAttribute('data-signed-in') === 'true') !== signedIn;
    if (signChanged) { global.location.assign(finalUrl); return true; }       // logged in or out: start fresh
    if (d.getElementById('appData')) { $('#appData').textContent = d.getElementById('appData').textContent; readData(); }
    flashToToasts(d);
    // 3. history, scroll, animation
    if (opts.push) global.history.pushState({ moodify: 1 }, '', finalUrl);
    else if (opts.replace) global.history.replaceState({ moodify: 1 }, '', finalUrl);
    var hash = (finalUrl.split('#')[1] || '');
    runScripts(inner);
    pageInit();
    var target = hash ? doc.getElementById(decodeURIComponent(hash)) : null;
    if (target) { scrollToEl(target, true); var f = $('input, select, textarea', target.tagName === 'FORM' ? target : doc) ; if (target.tagName === 'FORM' && f) f.focus({ preventScroll: true }); }
    else scrollToEl(null, true);
    inner.classList.remove('is-out');
    inner.classList.remove('is-in'); void inner.offsetWidth; inner.classList.add('is-in');
    if (lenis) lenis.resize();
    doc.dispatchEvent(new global.CustomEvent('moodify:page', { detail: { url: finalUrl } }));
    return true;
  }

  function navigate(url, opts) {
    opts = opts || {};
    var mine = ++token;
    var began = Date.now();
    if (!opts.quiet) inner.classList.add('is-out');
    var req = opts.method === 'POST' ? pageRequest(url, opts) : (cache[url] && Date.now() - cache[url].t < 10000 ? cache[url].p : prefetch(url));
    return req.then(function (res) {
      if (mine !== token) return;
      var wait = opts.quiet ? 0 : Math.max(0, 100 - (Date.now() - began));
      return new global.Promise(function (r) { global.setTimeout(r, wait); }).then(function () {
        if (mine !== token) return;
        var finalUrl = res.url ? res.url.replace(global.location.origin, '') : url;
        var ok = swapIn(res.text, finalUrl, { push: opts.push !== false && !opts.replace, replace: !!opts.replace });
        if (!ok) { global.location.assign(url); return; }
        if (opts.method === 'POST') App.dropCache();
        return { finalUrl: finalUrl, status: res.status };
      });
    }).catch(function () {
      if (mine !== token) return;
      inner.classList.remove('is-out');
      if (opts.method === 'POST') { toast('Could not reach the server. Please try again.'); if (Sound()) Sound().play('error'); }
      else global.location.assign(url);
    });
  }
  App.navigate = navigate;

  function internalLink(a) {
    if (!a || a.target === '_blank' || a.hasAttribute('download') || a.getAttribute('data-pjax') === 'off') return false;
    if (a.hasAttribute('data-auth-open')) return false;
    var href = a.getAttribute('href');
    if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) return false;
    if (a.origin !== global.location.origin) return false;
    if (/^\/static\//.test(a.pathname)) return false;
    return true;
  }

  function submitForm(form, submitter) {
    var action = form.getAttribute('action') || global.location.pathname;
    var method = (form.getAttribute('method') || 'get').toUpperCase();
    var fd = new global.FormData(form);
    if (submitter && submitter.name) fd.append(submitter.name, submitter.value);
    var params = new global.URLSearchParams(fd);
    var u = new global.URL(action, global.location.href);
    if (method === 'GET') {
      u.search = params.toString();
      navigate(u.pathname + u.search + u.hash);
      return;
    }
    var path = u.pathname;
    navigate(u.pathname, { method: 'POST', body: params.toString(), push: true }).then(function (r) {
      if (!r || !Sound()) return;
      var sameBack = r.finalUrl.split('?')[0] === path;                // sent straight back: it did not work
      if (sameBack || r.status >= 400) { Sound().play('error'); return; }
      var kind = form.getAttribute('data-done') || (/\/(delete|remove\/)/.test(path) ? 'tick' : /\/add$/.test(path) ? 'pop' : 'chime');
      Sound().play(kind);
    });
  }

  /* ================================ global event wiring ================================ */
  function wire() {
    // logged-out visitors: any click opens the Log in / Create account pop-up (capture phase, runs before every other click handler)
    doc.addEventListener('click', guestClickGate, true);
    // links
    doc.addEventListener('click', function (e) {
      if (e.defaultPrevented) return;
      var t = e.target;
      if (!t || !t.closest) return;

      // auth pop-up controls
      var openBtn = t.closest('[data-auth-open]');
      if (openBtn) { e.preventDefault(); openAuth(openBtn.getAttribute('data-auth-open'), { next: openBtn.getAttribute('data-auth-next') }); return; }
      if (t.closest('[data-auth-close]')) { e.preventDefault(); closeAuth(); return; }
      var tab = t.closest('[data-auth-tab]');
      if (tab) { var root = tab.closest('.auth-card'); setAuthMode(root, tab.getAttribute('data-auth-tab')); var f = $('[data-auth-form]:not([hidden]) input:not([type="hidden"])', root); if (f) f.focus(); return; }

      // players and quick actions
      var fav = t.closest('[data-fav]');
      if (fav) { e.preventDefault(); toggleFavorite(fav.getAttribute('data-fav')); return; }
      var add = t.closest('[data-add-to-playlist]');
      if (add) { e.preventDefault(); e.stopPropagation(); if (menu) closeMenu(); else openAddMenu(add); return; }
      var pb = t.closest('[data-play-slug]');
      if (pb) { e.preventDefault(); playFromButton(pb); return; }
      var pp = t.closest('[data-play-playlist]');
      if (pp) { e.preventDefault(); playPlaylist(pp.getAttribute('data-play-playlist')); return; }
      if (t.closest('[data-play-all]')) { e.preventDefault(); playAll(); return; }
      var sm = t.closest('[data-save-mood]');
      if (sm) { e.preventDefault(); App.saveMood(sm.getAttribute('data-save-mood')).catch(function () { /* handled */ }); return; }
      var cover = t.closest('.dash-cover');
      if (cover && !t.closest('a')) {
        var inside = $('[data-play-slug]', cover) || $('[data-play-playlist]', cover);
        if (inside) { e.preventDefault(); if (inside.hasAttribute('data-play-slug')) playFromButton(inside); else playPlaylist(inside.getAttribute('data-play-playlist')); return; }
      }
      if (menu && !t.closest('.pop-menu')) closeMenu();

      // links that should only swap the workspace
      var a = t.closest('a[href]');
      if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!internalLink(a)) return;
      var same = a.pathname === global.location.pathname && a.search === global.location.search;
      if (same && a.hash) {
        e.preventDefault();
        var target = doc.getElementById(decodeURIComponent(a.hash.slice(1)));
        if (target) { scrollToEl(target); var inp = $('input', target); if (inp) inp.focus({ preventScroll: true }); }
        return;
      }
      e.preventDefault();
      navigate(a.pathname + a.search + a.hash);
    });

    // warm the next page up as soon as someone is about to click it
    var hoverTimer = 0;
    doc.addEventListener('pointerdown', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (a && internalLink(a) && !a.hash) prefetch(a.pathname + a.search);
    }, true);
    if (fine) {
      doc.addEventListener('mouseover', function (e) {
        var a = e.target.closest && e.target.closest('a[href]');
        global.clearTimeout(hoverTimer);
        if (a && internalLink(a) && !a.hash && a.pathname !== global.location.pathname) hoverTimer = global.setTimeout(function () { prefetch(a.pathname + a.search); }, 70);
      });
    }

    // forms
    doc.addEventListener('submit', function (e) {
      if (e.defaultPrevented) return;
      var form = e.target;
      if (!form || !form.closest) return;
      if (form.hasAttribute('data-auth-form')) { e.preventDefault(); wireAuthForm(form); return; }
      if (form.getAttribute('data-pjax') === 'off') return;
      var action = new global.URL(form.getAttribute('action') || global.location.pathname, global.location.href);
      if (action.origin !== global.location.origin) return;
      e.preventDefault();
      var confirmText = form.getAttribute('data-confirm');
      if (confirmText) { confirmDialog(confirmText).then(function (yes) { if (yes) submitForm(form, e.submitter); }); return; }
      submitForm(form, e.submitter);
    });
    doc.addEventListener('change', function (e) {
      var s = e.target;
      if (s && s.hasAttribute && s.hasAttribute('data-autosubmit') && s.form) { if (s.form.requestSubmit) s.form.requestSubmit(); else s.form.submit(); }
    });

    // back / forward
    global.addEventListener('popstate', function () { navigate(global.location.pathname + global.location.search + global.location.hash, { push: false }); });

    // top bar search
    var q = $('#dashQuery'), clear = $('#dashQueryClear');
    q.addEventListener('input', function () { clear.hidden = !q.value; if (App.onSearch) App.onSearch(q.value.trim()); });
    clear.addEventListener('click', function () { q.value = ''; clear.hidden = true; if (App.onSearch) App.onSearch(''); q.focus(); });
    $('#dashSearch').addEventListener('submit', function (e) {
      if (App.onSearchSubmit && App.onSearchSubmit(q.value.trim())) e.preventDefault();
    });
    $$('#dashPills .dash-pill').forEach(function (p) {
      p.addEventListener('click', function () { if (App.onPill) App.onPill(p.getAttribute('data-mood')); });
    });

    // account menu and pop-ups close on outside click / Escape
    doc.addEventListener('pointerdown', function (e) {
      var m = $('.dash-menu');
      if (m && m.open && !m.contains(e.target)) m.open = false;
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var m = $('.dash-menu');
        if (menu) closeMenu();
        else if (modal && !modal.hidden) closeAuth();
        else if (m && m.open) { m.open = false; $('summary', m).focus(); }
      }
      if (e.key === 'Tab' && modal && !modal.hidden) {
        var f = $$('button:not([disabled]), input:not([type="hidden"]):not([disabled])', $('.auth-card', modal)).filter(function (n) { return n.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    work.addEventListener('scroll', function () { if (menu && Date.now() - menuAt > 350) closeMenu(); }, { passive: true });
  }

  /* ================================ boot ================================ */
  function boot() {
    dash = $('#dash');
    if (!dash || dash.__ready) return;
    dash.__ready = true;
    work = $('#dashWork');
    inner = $('#dashInner');
    readData();
    modal = $('#authModal');
    wireAuthModal();
    try {
      buildPlayer();
      wire();
      setupScroll();
      flashToToasts(doc);
      global.history.replaceState({ moodify: 1 }, '', global.location.href);
      inner.classList.add('is-in');
      pageInit();
      paintNow();
      paintPlayButton();
      openFromQuery();
    } catch (e) { if (global.console) console.warn('[app]', e); }
    doc.documentElement.classList.add('app-ready');
  }
  App.boot = boot;
  if (FX.register) FX.register('app', boot);
  else if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
