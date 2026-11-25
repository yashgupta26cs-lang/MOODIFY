/* MOODIFY dashboard (home page)
 *
 * Makes the home page behave like an app:
 *   - mood cards / quick pills / search filter the tracks instantly (no reload)
 *   - sidebar playlists open in the workspace without leaving the page
 *   - the bottom player plays tracks with play/pause, previous/next, seek and
 *     volume, and keeps its place if you leave and come back in the same tab
 *   - saving a mood check-in happens in the background (same /mood-checkin route)
 *
 * Data comes from the JSON block written by the server (#dashData). Nothing here
 * talks to a new endpoint. Works with or without the motion layer (?fx=off).
 */
(function (global) {
  'use strict';
  var doc = document;
  var FX = global.MoodifyFX;

  function boot() {
    var root = doc.getElementById('dash');
    if (!root || root.__ready) return;
    root.__ready = true;
    try { init(root); } catch (e) { if (global.console) console.warn('[dashboard]', e); }
  }
  if (FX && FX.register) FX.register('dashboard', boot);
  else if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();

  function init(root) {
    var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel); };
    var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };
    var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = global.matchMedia && global.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var hasFX = !!(FX && FX.setMood);

    var data = JSON.parse($('#dashData').textContent);
    var tracks = data.tracks.slice().sort(function (a, b) { return a.rank - b.rank; });
    var bySlug = {};
    tracks.forEach(function (t) { bySlug[t.slug] = t; });
    var lists = data.playlists;
    var listById = {};
    lists.forEach(function (p) { listById[p.id] = p; });

    var state = { mood: '', q: '', playlist: null, saved: data.current || '' };
    var player = { queue: [], index: -1, track: null };

    var work = $('#dashWork'), inner = $('#dashInner');

    /* ================================ small helpers ================================ */
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function fmt(sec) {
      if (!isFinite(sec) || sec < 0) sec = 0;
      var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    }
    function moodRgb(m) {
      var p = hasFX && FX.moods && FX.moods[m];
      return p ? FX.hexToRgb(p.colors[0]).join(',') : '131,232,199';
    }
    var ICON = {
      play: '<svg viewBox="0 0 24 24" class="fill" aria-hidden="true"><path d="M8 5.2v13.6a.8.8 0 0 0 1.200.7l10.800-6.800a.8.8 0 0 0 0-1.400L9.200 4.500A.8.8 0 0 0 8 5.200z"/></svg>',
      pause: '<svg viewBox="0 0 24 24" class="fill" aria-hidden="true"><rect x="6.500" y="5" width="3.800" height="14" rx="1.200"/><rect x="13.700" y="5" width="3.800" height="14" rx="1.200"/></svg>',
      vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.500h3.500L12 5.500v13l-4.500-4H4z"/><path d="M15.500 9a4.200 4.200 0 0 1 0 6M18 6.500a7.700 7.700 0 0 1 0 11"/></svg>',
      mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.500h3.500L12 5.500v13l-4.500-4H4z"/><path d="m16 9.500 5 5M21 9.500l-5 5"/></svg>'
    };

    /* ================================ toast for flash messages ================================ */
    $$('body > .container > .alert').forEach(function (a) {
      global.setTimeout(function () { a.classList.add('bye'); global.setTimeout(function () { a.remove(); }, 220); }, 4200);
    });
    function toast(text) {
      var box = $('body > .container') || doc.body;
      var a = doc.createElement('div');
      a.className = 'alert alert-info';
      a.setAttribute('role', 'status');
      a.textContent = text;
      box.insertBefore(a, box.firstChild);
      global.setTimeout(function () { a.classList.add('bye'); global.setTimeout(function () { a.remove(); }, 220); }, 3200);
    }

    /* ================================ smooth scrolling in the workspace ================================ */
    var lenis = null;
    if (global.Lenis && !reduced && fine) {
      try {
        lenis = new global.Lenis({ wrapper: work, content: inner, lerp: 0.12, smoothWheel: true, syncTouch: false });
        var raf = function (t) { lenis.raf(t); global.requestAnimationFrame(raf); };
        global.requestAnimationFrame(raf);
        $$('.dash-side-lists, .dash-pills').forEach(function (el) { el.setAttribute('data-lenis-prevent', ''); });
      } catch (e) { lenis = null; }
    }
    function scrollToEl(el) {
      if (!el) return;
      var top = el.getBoundingClientRect().top - work.getBoundingClientRect().top + work.scrollTop - 6;
      if (el.id === 'top') top = 0;
      if (lenis) lenis.scrollTo(top, { duration: 0.45, easing: function (t) { return 1 - Math.pow(1 - t, 3); } });
      else work.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
    }

    /* ================================ covers, icons, equaliser ================================ */
    function paintCovers() {
      $$('[data-cover]').forEach(function (el) {
        if (el.__covered) return;
        el.__covered = true;
        if (FX && FX.cover) el.insertBefore(FX.cover(el.getAttribute('data-cover'), el.getAttribute('data-cover-mood') || ''), el.firstChild);
      });
    }
    function paintGlyphs() {
      $$('.dash-mood').forEach(function (b) {
        var m = b.getAttribute('data-mood');
        b.style.setProperty('--m-rgb', moodRgb(m));
        var holder = $('[data-glyph]', b);
        var path = hasFX && FX.moodGlyphs && FX.moodGlyphs[m];
        holder.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (path || '<circle cx="12" cy="12" r="8"/>') + '</svg>';
      });
    }
    $$('#trackGrid .dash-cover').forEach(function (c) { c.insertAdjacentHTML('beforeend', '<span class="dash-eq" aria-hidden="true"><i></i><i></i><i></i></span>'); });
    paintCovers();
    paintGlyphs();

    /* ================================ filtering ================================ */
    var grid = $('#trackGrid');
    var cards = {};
    $$('.dash-card[data-slug]', grid).forEach(function (c) { cards[c.getAttribute('data-slug')] = c; });
    var emptyBox = $('#trackEmpty');

    function haystack(t) { return [t.title, t.artist, t.composer, t.genre, t.mood, t.language].join(' ').toLowerCase(); }

    function visibleTracks() {
      var list;
      if (state.playlist != null) {
        var pl = listById[state.playlist];
        list = pl ? pl.slugs.map(function (s) { return bySlug[s]; }).filter(Boolean) : [];
      } else {
        list = tracks.slice();
      }
      if (state.mood) list = list.filter(function (t) { return (t.mood || '').toLowerCase().indexOf(state.mood.toLowerCase()) !== -1; });
      if (state.q) list = list.filter(function (t) { return haystack(t).indexOf(state.q) !== -1; });
      return list;
    }

    function renderTracks() {
      var list = visibleTracks();
      var show = {};
      list.forEach(function (t, i) { show[t.slug] = i; });
      Object.keys(cards).forEach(function (slug) {
        cards[slug].classList.toggle('hide', !(slug in show));
      });
      // keep the visible cards in the right order
      list.forEach(function (t) { grid.appendChild(cards[t.slug]); });
      if (emptyBox) grid.appendChild(emptyBox);

      var title = $('#tracksTitle'), sub = $('#tracksSub');
      var clear = $('#clearFilters'), all = $('#allResults'), lib = $('#libraryLink');
      var n = list.length + (list.length === 1 ? ' track' : ' tracks');
      var pl = state.playlist != null ? listById[state.playlist] : null;

      if (pl) {
        title.textContent = pl.name;
        sub.textContent = n + ' in this playlist.';
        all.textContent = 'Open playlist page →'; all.href = pl.url;
      } else if (state.q) {
        title.textContent = 'Results for “' + state.q + '”';
        sub.textContent = n + (state.mood ? ' tagged ' + state.mood : '') + ' in the library.';
        all.textContent = 'See all results in Library →'; all.href = data.urls.library + '?q=' + encodeURIComponent(state.q);
      } else if (state.mood) {
        title.textContent = state.mood + ' music';
        sub.textContent = n + ' tagged ' + state.mood + ' in the library.';
        all.textContent = 'Browse ' + state.mood + ' in Library →'; all.href = data.urls.library + '?mood=' + encodeURIComponent(state.mood);
      } else {
        title.textContent = 'Picked for your vibe';
        sub.textContent = 'Ranked around your language, favourite artist and mood.';
      }
      var filtered = !!(pl || state.q || state.mood);
      clear.hidden = !filtered;
      all.hidden = !filtered;
      lib.hidden = filtered;

      if (!list.length) {
        var msg;
        if (pl && !state.q && !state.mood) msg = '<strong>This playlist is empty.</strong>Add tracks from the <a href="' + esc(data.urls.library) + '">Library</a>, then they will show up here.';
        else if (state.q) msg = '<strong>Nothing matches “' + esc(state.q) + '” here.</strong>Try the <a href="' + esc(all.href) + '">full Library search</a>.';
        else msg = '<strong>No tracks are tagged ' + esc(state.mood) + ' yet.</strong>New licensed music is added over time. Meanwhile, <a href="' + esc(all.href) + '">browse the Library</a>.';
        emptyBox.innerHTML = msg;
        emptyBox.hidden = false;
      } else {
        emptyBox.hidden = true;
      }
      markPlaying();
    }

    /* ---- search ---- */
    var qInput = $('#dashQuery'), qClear = $('#dashQueryClear');
    qInput.addEventListener('input', function () {
      state.q = qInput.value.trim().toLowerCase();
      qClear.hidden = !qInput.value;
      renderTracks();
    });
    qClear.addEventListener('click', function () { qInput.value = ''; state.q = ''; qClear.hidden = true; renderTracks(); qInput.focus(); });

    /* ---- moods ---- */
    var moodBtns = $$('#moodGrid .dash-mood');
    var pills = $$('#dashPills .dash-pill');
    var saveBar = $('#moodForm');

    function paintMoodState() {
      moodBtns.forEach(function (b, i) {
        var on = b.getAttribute('data-mood') === state.mood;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on || (!state.mood && i === 0) ? 0 : -1;
        var tag = $('[data-current-tag]', b);
        tag.hidden = b.getAttribute('data-mood') !== state.saved;
      });
      pills.forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-mood') === state.mood); });
      var canSave = state.mood && data.saveable.indexOf(state.mood) !== -1 && state.mood !== state.saved;
      saveBar.hidden = !canSave;
      if (canSave) { $('#saveMoodName').textContent = state.mood; $('#moodInput').value = state.mood; }
    }

    function selectMood(m, opts) {
      opts = opts || {};
      state.mood = (m && m === state.mood && opts.toggle) ? '' : (m || '');
      state.playlist = null;
      $$('.dash-side-item').forEach(function (b) { b.classList.remove('on'); });
      paintMoodState();
      renderTracks();
      if (hasFX) FX.setMood(state.mood || state.saved, { action: false });
      if (opts.scroll) scrollToEl($('#tracks'));
    }

    moodBtns.forEach(function (b) { b.addEventListener('click', function () { selectMood(b.getAttribute('data-mood'), { toggle: true }); }); });
    pills.forEach(function (p) { p.addEventListener('click', function () { selectMood(p.getAttribute('data-mood'), { scroll: true }); }); });
    $('#moodGrid').addEventListener('keydown', function (e) {
      var i = moodBtns.indexOf(doc.activeElement);
      var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (i < 0 || !step) return;
      e.preventDefault();
      var nb = moodBtns[(i + step + moodBtns.length) % moodBtns.length];
      nb.focus();
      selectMood(nb.getAttribute('data-mood'));
    });
    $('#clearFilters').addEventListener('click', function () {
      state.mood = ''; state.playlist = null; state.q = ''; qInput.value = ''; qClear.hidden = true;
      $$('.dash-side-item').forEach(function (b) { b.classList.remove('on'); });
      paintMoodState(); renderTracks();
      if (hasFX) FX.setMood(state.saved, { action: false });
    });

    /* ---- save a mood check-in without leaving the page ---- */
    saveBar.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('#saveMoodBtn');
      var chosen = $('#moodInput').value;
      if (!chosen || !global.fetch) { saveBar.submit(); return; }
      btn.setAttribute('disabled', '');
      global.fetch(saveBar.action, { method: 'POST', body: new FormData(saveBar), credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) throw new Error('save failed');
          state.saved = chosen;
          root.setAttribute('data-current-mood', chosen);
          var cur = $('#curMoodText');
          if (cur) cur.textContent = chosen;
          paintMoodState();
          if (hasFX) FX.setMood(chosen, { action: true });
          toast('Mood saved: ' + chosen + '. Your mix will adapt.');
        })
        .catch(function () { saveBar.submit(); })           // fall back to the normal form post
        .then(function () { btn.removeAttribute('disabled'); });
    });

    /* ================================ playlists ================================ */
    function openPlaylist(id, opts) {
      id = Number(id);
      if (!listById[id]) return;
      state.playlist = id; state.mood = ''; state.q = ''; qInput.value = ''; qClear.hidden = true;
      $$('.dash-side-item').forEach(function (b) { b.classList.toggle('on', Number(b.getAttribute('data-playlist')) === id); });
      paintMoodState(); renderTracks();
      if (hasFX) FX.setMood(state.saved, { action: false });
      if (!opts || opts.scroll !== false) scrollToEl($('#tracks'));
    }
    $$('.dash-side-item').forEach(function (b) { b.addEventListener('click', function () { openPlaylist(b.getAttribute('data-playlist')); }); });
    $$('[data-open-playlist]').forEach(function (b) { b.addEventListener('click', function () { openPlaylist(b.getAttribute('data-open-playlist')); }); });
    $$('[data-playlist-card] .dash-cover').forEach(function (c) {
      c.addEventListener('click', function () {
        var id = Number(c.closest('[data-playlist-card]').getAttribute('data-playlist-card'));
        var pl = listById[id];
        var q = pl.slugs.map(function (s) { return bySlug[s]; }).filter(Boolean);
        if (!q.length) { toast('Add tracks to “' + pl.name + '” first.'); openPlaylist(id); return; }
        playTrack(q[0], q);
      });
    });

    var plForm = $('#newPlaylistForm'), plName = $('#newPlaylistName');
    function showPlForm() {
      plForm.hidden = false;
      scrollToEl($('#playlists'));
      global.setTimeout(function () { plName.focus(); }, 60);
    }
    $('#newPlaylistBtn').addEventListener('click', showPlForm);
    $('#newPlaylistSide').addEventListener('click', showPlForm);
    $('#newPlaylistCancel').addEventListener('click', function () { plForm.hidden = true; plName.value = ''; });

    /* ================================ navigation highlight ================================ */
    var jumpLinks = $$('[data-jump]');
    var sections = { top: $('#top'), moods: $('#moods'), playlists: $('#playlists') };
    function setActive(key) {
      jumpLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-jump') === key); });
    }
    jumpLinks.forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var key = a.getAttribute('data-jump');
        scrollToEl(sections[key]);
        setActive(key);
      });
    });
    var ticking = false;
    work.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      global.requestAnimationFrame(function () {
        ticking = false;
        var base = work.getBoundingClientRect().top + 140;
        var key = 'top';
        if (sections.moods.getBoundingClientRect().top <= base) key = 'moods';
        if (sections.playlists.getBoundingClientRect().top <= base) key = 'playlists';
        if (work.scrollTop + work.clientHeight >= work.scrollHeight - 4) key = 'playlists';
        setActive(key);
      });
    }, { passive: true });

    /* ================================ account menu ================================ */
    var menu = $('.dash-menu');
    doc.addEventListener('pointerdown', function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.open) { menu.open = false; $('summary', menu).focus(); } });

    /* ================================ player ================================ */
    var audio = $('#audioPlayer');
    var el = {
      shell: $('#dashPlayer'), title: $('#nowTitle'), artist: $('#nowArtist'), cover: $('#nowCover'),
      play: $('#btnPlay'), prev: $('#btnPrev'), next: $('#btnNext'), seek: $('#seek'),
      now: $('#timeNow'), end: $('#timeEnd'), vol: $('#vol'), mute: $('#btnMute'),
      full: $('#openFull'), msg: $('#playerMsg')
    };
    var seeking = false, triedFallback = false, msgTimer = 0;

    function setRange(input, pct) { input.style.setProperty('--p', pct + '%'); }
    function message(text) {
      el.msg.textContent = text;
      el.msg.hidden = false;
      global.clearTimeout(msgTimer);
      msgTimer = global.setTimeout(function () { el.msg.hidden = true; }, 5000);
    }

    function markPlaying() {
      var live = player.track && !audio.paused && !audio.ended;
      Object.keys(cards).forEach(function (slug) {
        var on = !!player.track && player.track.slug === slug;
        cards[slug].classList.toggle('is-playing', on);
        cards[slug].classList.toggle('is-live', on && !!live);
        var b = $('.dash-play', cards[slug]);
        if (b) { b.innerHTML = on && live ? ICON.pause : ICON.play; b.setAttribute('aria-label', (on && live ? 'Pause ' : 'Play ') + cards[slug].querySelector('.dash-card-title').textContent); }
      });
    }

    function paintNow() {
      var t = player.track;
      el.shell.setAttribute('data-empty', t ? 'false' : 'true');
      el.title.textContent = t ? t.title : 'Nothing playing';
      el.artist.textContent = t ? t.artist : 'Press play on any track';
      el.cover.innerHTML = '';
      if (t && FX && FX.cover) el.cover.appendChild(FX.cover(t.title, t.mood));
      el.full.href = t ? t.url : data.urls.library;
      var multi = player.queue.length > 1;
      el.prev.disabled = !t || !multi;
      el.next.disabled = !t || !multi;
      if (t && 'mediaSession' in global.navigator && global.MediaMetadata) {
        try { global.navigator.mediaSession.metadata = new global.MediaMetadata({ title: t.title, artist: t.artist, album: 'MOODIFY' }); } catch (e) { /* optional */ }
      }
    }
    function paintPlayButton() {
      var playing = !audio.paused && !audio.ended;
      el.play.innerHTML = playing ? ICON.pause : ICON.play;
      el.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      markPlaying();
    }

    function load(t, queue, startAt) {
      player.track = t;
      if (queue) { player.queue = queue; }
      player.index = Math.max(0, player.queue.indexOf(t));
      triedFallback = false;
      audio.src = t.audio || t.fallback || '';
      audio.dataset.fallback = t.fallback || '';
      if (startAt) {
        audio.addEventListener('loadedmetadata', function once() {
          audio.removeEventListener('loadedmetadata', once);
          if (isFinite(audio.duration)) audio.currentTime = Math.min(startAt, audio.duration - 0.5);
        });
      }
      el.seek.value = 0; setRange(el.seek, 0);
      el.now.textContent = '0:00'; el.end.textContent = t.duration || '0:00';
      el.seek.disabled = false;
      paintNow();
      paintPlayButton();
    }

    function playTrack(t, queue) {
      if (player.track === t && !queue) { toggle(); return; }
      if (player.track === t && queue && audio.src) { toggle(); return; }
      load(t, queue || visibleTracks());
      var p = audio.play();
      if (p && p.catch) p.catch(function () { paintPlayButton(); message('Press play to start the track.'); });
    }
    function toggle() {
      if (!player.track) {
        var first = visibleTracks()[0] || tracks[0];
        if (first) playTrack(first, visibleTracks());
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
      var p = audio.play();
      if (p && p.catch) p.catch(paintPlayButton);
    }
    function previous() {
      if (audio.currentTime > 3) { audio.currentTime = 0; return; }
      step(-1);
    }

    /* cards: the cover (and its play button) starts the track */
    $$('#trackGrid .dash-card').forEach(function (card) {
      $('.dash-cover', card).addEventListener('click', function () {
        var t = bySlug[card.getAttribute('data-slug')];
        if (!t) return;
        if (player.track === t) toggle(); else playTrack(t, visibleTracks());
      });
    });

    el.play.addEventListener('click', toggle);
    el.prev.addEventListener('click', previous);
    el.next.addEventListener('click', function () { step(1); });

    audio.addEventListener('play', paintPlayButton);
    audio.addEventListener('pause', paintPlayButton);
    audio.addEventListener('ended', function () {
      if (player.queue.length > 1) step(1); else paintPlayButton();
    });
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
      if (t && !triedFallback && t.fallback && audio.src.indexOf(t.fallback) === -1) {
        triedFallback = true;
        audio.src = t.fallback;
        var p = audio.play();
        if (p && p.catch) p.catch(function () { /* handled by next error */ });
        return;
      }
      paintPlayButton();
      message('This track could not be played here. Try the full player.');
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

    /* volume (remembered) */
    var savedVol = 0.8;
    try { var sv = parseFloat(global.localStorage.getItem('moodify.vol')); if (sv >= 0 && sv <= 1) savedVol = sv; } catch (e) { /* ignore */ }
    function setVolume(v, remember) {
      audio.volume = v;
      el.vol.value = String(Math.round(v * 100));
      setRange(el.vol, v * 100);
      el.mute.innerHTML = v === 0 ? ICON.mute : ICON.vol;
      el.mute.setAttribute('aria-label', v === 0 ? 'Unmute' : 'Mute');
      if (remember) { try { global.localStorage.setItem('moodify.vol', String(v)); } catch (e) { /* ignore */ } }
    }
    var lastVol = savedVol || 0.8;
    setVolume(savedVol, false);
    el.vol.addEventListener('input', function () { var v = el.vol.value / 100; if (v > 0) lastVol = v; setVolume(v, true); });
    el.mute.addEventListener('click', function () { setVolume(audio.volume === 0 ? lastVol : 0, true); });

    /* keyboard: space = play/pause when you are not typing or on a control */
    doc.addEventListener('keydown', function (e) {
      if (e.key !== ' ' || e.repeat) return;
      var t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, button, a, summary, [role="radio"]')) return;
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

    /* keep your place if you open another page and come back in this tab */
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
      if (s && bySlug[s.slug]) { audio.preload = 'metadata'; load(bySlug[s.slug], visibleTracks(), s.t); }
    } catch (e) { /* ignore */ }

    /* ================================ first paint ================================ */
    paintMoodState();
    renderTracks();
    paintNow();
    paintPlayButton();
    if (hasFX && state.saved) FX.setMood(state.saved, { action: false });
  }
})(window);
