/* MOODIFY page behaviour
 *
 * Small modules for the pages that need script. Each one is registered with
 * MoodifyApp.page(<page id>, fn) and runs every time that page is shown (the
 * first load and every in-app navigation). A module may return a clean-up
 * function. The player, navigation, favourites and pop-ups live in app.js.
 */
(function (global) {
  'use strict';
  var App = global.MoodifyApp;
  if (!App) return;
  var doc = document;
  var $ = App.$, $$ = App.$$, esc = App.esc;
  var FX = function () { return global.MoodifyFX || {}; };

  /* ============================== HOME ============================== */
  App.page('home', function (root, data) {
    var state = { mood: '', q: '', saved: data.current || '' };
    var grid = $('#trackGrid', root);
    if (!grid) return;
    var cards = $$('.dash-card[data-slug]', grid);
    var emptyBox = $('#trackEmpty', root);
    var dash = $('#dash');
    var signedIn = !!data.signedIn;

    function visible() {
      return cards.filter(function (c) {
        var okMood = !state.mood || (c.getAttribute('data-mood') || '').toLowerCase().indexOf(state.mood.toLowerCase()) !== -1;
        var okText = !state.q || (c.getAttribute('data-text') || '').indexOf(state.q) !== -1;
        return okMood && okText;
      });
    }
    function render() {
      var list = visible();
      cards.forEach(function (c) { c.classList.toggle('hide', list.indexOf(c) === -1); });
      var title = $('#tracksTitle', root), sub = $('#tracksSub', root);
      var clear = $('#clearFilters', root), all = $('#allResults', root), lib = $('#libraryLink', root);
      var n = list.length + (list.length === 1 ? ' track' : ' tracks');
      var base = signedIn ? 'Picked for your vibe' : 'Start listening';
      var baseSub = signedIn ? 'Ranked around your language, favourite artist and mood.' : 'Licensed, free-to-stream music. Press play on any cover.';
      if (state.q) {
        title.textContent = 'Results for “' + state.q + '”';
        sub.textContent = n + (state.mood ? ' tagged ' + state.mood : '') + ' in the library.';
        all.textContent = 'See all results in Search →'; all.href = data.urls.library + '?q=' + encodeURIComponent(state.q);
      } else if (state.mood) {
        title.textContent = state.mood + ' music';
        sub.textContent = n + ' tagged ' + state.mood + ' in the library.';
        all.textContent = 'Open the ' + state.mood + ' page →'; all.href = '/mood/' + encodeURIComponent(state.mood);
      } else { title.textContent = base; sub.textContent = baseSub; }
      var filtered = !!(state.q || state.mood);
      clear.hidden = !filtered; all.hidden = !filtered; lib.hidden = filtered;
      if (!list.length) {
        emptyBox.innerHTML = state.q
          ? '<strong>Nothing matches “' + esc(state.q) + '” here.</strong>Try the <a href="' + esc(all.href) + '">full Search page</a>.'
          : '<strong>No tracks are tagged ' + esc(state.mood) + ' yet.</strong>New licensed music is added over time. Meanwhile, <a href="' + esc(all.href) + '">open the ' + esc(state.mood) + ' page</a>.';
        emptyBox.hidden = false;
      } else emptyBox.hidden = true;
    }

    var moodBtns = $$('#moodGrid .dash-mood', root);
    var pills = $$('#dashPills .dash-pill');
    var saveBar = $('#moodForm', root), guestBar = $('#moodGuestBar', root);
    function paintMood() {
      moodBtns.forEach(function (b, i) {
        var on = b.getAttribute('data-mood') === state.mood;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on || (!state.mood && i === 0) ? 0 : -1;
        $('[data-current-tag]', b).hidden = b.getAttribute('data-mood') !== state.saved;
      });
      pills.forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-mood') === state.mood); });
      var canSave = state.mood && data.saveable.indexOf(state.mood) !== -1 && state.mood !== state.saved;
      if (saveBar) { saveBar.hidden = !canSave; if (canSave) { $('#saveMoodName', root).textContent = state.mood; $('#moodInput', root).value = state.mood; } }
      if (guestBar) guestBar.hidden = !(state.mood && data.saveable.indexOf(state.mood) !== -1);
    }
    function selectMood(m, opts) {
      opts = opts || {};
      state.mood = (m && m === state.mood && opts.toggle) ? '' : (m || '');
      paintMood(); render();
      if (FX().setMood) FX().setMood(state.mood || state.saved, { action: false });
      if (opts.scroll) App.scrollToEl($('#tracks', root));
    }
    var onMoodClick = function (b) { return function () { selectMood(b.getAttribute('data-mood'), { toggle: true }); }; };
    moodBtns.forEach(function (b) { b.addEventListener('click', onMoodClick(b)); });
    var grid2 = $('#moodGrid', root);
    grid2.addEventListener('keydown', function (e) {
      var i = moodBtns.indexOf(doc.activeElement);
      var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (i < 0 || !step) return;
      e.preventDefault();
      var nb = moodBtns[(i + step + moodBtns.length) % moodBtns.length];
      nb.focus();
      selectMood(nb.getAttribute('data-mood'));
    });
    $('#clearFilters', root).addEventListener('click', function () {
      state.mood = ''; state.q = '';
      var q = $('#dashQuery'); q.value = ''; $('#dashQueryClear').hidden = true;
      paintMood(); render();
      if (FX().setMood) FX().setMood(state.saved, { action: false });
    });
    if (saveBar) saveBar.addEventListener('submit', function (e) {
      e.preventDefault();
      var chosen = $('#moodInput', root).value;
      var btn = $('#saveMoodBtn', root);
      if (!chosen) return;
      btn.setAttribute('disabled', '');
      App.saveMood(chosen).then(function () {
        state.saved = chosen;
        var cur = $('#curMoodText', root); if (cur) cur.textContent = chosen;
        paintMood();
      }).catch(function () { App.toast('Could not save your mood. Please try again.'); })
        .then(function () { btn.removeAttribute('disabled'); });
    });

    App.onSearch = function (v) { state.q = v.toLowerCase(); render(); };
    App.onPill = function (m) { selectMood(m, { scroll: true }); };
    App.onSearchSubmit = null;
    paintMood(); render();
    return function () { App.onSearch = null; App.onPill = null; };
  });

  /* ============================== SEARCH / LIBRARY ============================== */
  App.page('library', function (root) {
    var form = $('#libFilters', root);
    var grid = $('#libGrid', root);
    if (!form || !grid) return;
    var cards = $$('.dash-card[data-slug]', grid);
    var qBox = $('#dashQuery'), qClear = $('#dashQueryClear');
    var libQ = $('#libQ', root);
    var singer = $('[name="singer"]', form);
    var clearBtn = $('#libClear', root);
    var count = $('#libCount', root), empty = $('#libEmpty', root);

    function val(name) { var f = form.elements[name]; return f ? f.value.trim().toLowerCase() : ''; }
    function apply(q) {
      var text = (q !== undefined ? q : libQ.value).trim().toLowerCase();
      var genre = val('genre'), mood = val('mood'), language = val('language'), who = singer ? singer.value.trim().toLowerCase() : '';
      var shown = 0;
      cards.forEach(function (c) {
        var ok = (!text || c.getAttribute('data-text').indexOf(text) !== -1) &&
          (!genre || c.getAttribute('data-genre').toLowerCase().indexOf(genre) !== -1) &&
          (!mood || c.getAttribute('data-mood').toLowerCase().indexOf(mood) !== -1) &&
          (!language || c.getAttribute('data-language').toLowerCase().indexOf(language) !== -1) &&
          (!who || c.getAttribute('data-text').indexOf(who) !== -1);
        c.classList.toggle('hide', !ok);
        if (ok) shown++;
      });
      count.textContent = String(shown);
      empty.hidden = shown > 0;
      clearBtn.hidden = !(text || genre || mood || language || who);
      var params = new global.URLSearchParams();
      if (text) params.set('q', text);
      ['genre', 'mood', 'language'].forEach(function (n) { var v = form.elements[n].value; if (v) params.set(n, v); });
      if (singer && singer.value) params.set('singer', singer.value);
      var qs = params.toString();
      try { global.history.replaceState(global.history.state, '', global.location.pathname + (qs ? '?' + qs : '')); } catch (e) { /* ignore */ }
    }
    // the top-bar search and the page search box are one search
    App.onSearch = function (v) { libQ.value = v; apply(v); };
    App.onSearchSubmit = function () { return true; };
    libQ.addEventListener('input', function () { qBox.value = libQ.value; qClear.hidden = !libQ.value; apply(); });
    form.addEventListener('change', function () { apply(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    clearBtn.addEventListener('click', function () {
      libQ.value = ''; qBox.value = ''; qClear.hidden = true;
      ['genre', 'mood', 'language'].forEach(function (n) { form.elements[n].value = ''; });
      if (singer) singer.value = '';
      apply('');
    });
    if (libQ.value) { qBox.value = libQ.value; qClear.hidden = false; }
    apply(libQ.value);
    return function () { App.onSearch = null; App.onSearchSubmit = null; };
  });

  /* ============================== MOOD PAGE ============================== */
  App.page('mood', function (root) {
    var hero = $('.mood-hero', root);
    if (hero && FX().setMood) FX().setMood(hero.getAttribute('data-mood'), { action: false });
  });

  /* ============================== PLAYLISTS ============================== */
  App.page('playlists', function (root) {
    if (global.location.hash === '#new') { var i = $('#newPlaylistName', root); if (i) i.focus({ preventScroll: true }); }
  });

  /* ============================== NOW PLAYING ============================== */
  App.page('listen', function (root) {
    var raw = $('#npData', root);
    var npEl = $('#np', root);
    if (!raw || !npEl) return;
    var np = JSON.parse(raw.textContent);
    var queue = np.queue, index = np.index;
    var current = queue[index];
    var P = App.player, audio = P.audio;
    var mode = 'audio';
    var statusEl = $('#playerStatus', root), speed = $('#playbackSpeed', root);
    var videoBox = $('#videoModeContent', root), lyricsBox = $('#lyricsModeContent', root), karaokeBox = $('#karaokeModeContent', root);
    var tabs = $$('[data-player-mode]', root), panels = $$('[data-player-panel]', root);

    function status(t) { if (statusEl) statusEl.textContent = t || ''; }
    function note(box, text) { var p = doc.createElement('p'); p.className = 'mode-note'; p.textContent = text; box.appendChild(p); }
    function safeEmbed(raw) {
      if (!raw) return '';
      try {
        var u = new global.URL(raw);
        if (['www.youtube-nocookie.com', 'www.youtube.com'].indexOf(u.hostname) === -1) return '';
        if (!/^\/embed\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)) return '';
        return u.href;
      } catch (e) { return ''; }
    }
    function audioUrlFor(t) { return (mode === 'karaoke' && t.karaoke_authorized && t.karaoke_audio_url) ? t.karaoke_audio_url : (t.audio_url || ''); }
    function sameSrc(url) { try { return new global.URL(url, global.location.href).href === audio.src; } catch (e) { return false; } }
    function syncAudioMode(wasPlaying) {
      var want = audioUrlFor(current);
      if (!want || sameSrc(want)) return;
      P.swapSource(want, mode === 'karaoke' ? '' : current.fallback_audio_url, wasPlaying);
    }

    function renderModes(t) {
      if (videoBox) {
        videoBox.replaceChildren();
        var embed = safeEmbed(t.video_embed_url);
        if (mode === 'video' && embed) {
          var wrap = doc.createElement('div'); wrap.className = 'player-mode-video';
          var f = doc.createElement('iframe');
          f.src = embed; f.title = 'Official video for ' + (t.title || 'this track'); f.loading = 'lazy';
          f.referrerPolicy = 'strict-origin-when-cross-origin';
          f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
          f.allowFullscreen = true;
          wrap.appendChild(f); videoBox.appendChild(wrap);
        } else note(videoBox, embed ? 'Open Video mode to load the linked official video.' : 'No official video has been linked to this track yet.');
      }
      var hasLyrics = !!(t.lyrics_authorized && t.lyrics);
      function lyricsInto(box) {
        var pre = doc.createElement('pre'); pre.className = 'player-mode-lyrics'; pre.textContent = t.lyrics; box.appendChild(pre);
        if (t.lyrics_credit || t.lyrics_source_url) {
          var c = doc.createElement('p'); c.className = 'player-mode-credit';
          if (t.lyrics_source_url) { var a = doc.createElement('a'); a.href = t.lyrics_source_url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = t.lyrics_credit || 'Authorised lyrics source'; c.appendChild(a); }
          else c.textContent = t.lyrics_credit;
          box.appendChild(c);
        }
      }
      if (lyricsBox) {
        lyricsBox.replaceChildren();
        if (hasLyrics) lyricsInto(lyricsBox);
        else note(lyricsBox, t.is_instrumental ? 'This is an instrumental recording, so it does not have lyrics.' : 'Lyrics will appear here when an authorised lyrics source is added.');
      }
      if (karaokeBox) {
        karaokeBox.replaceChildren();
        if (t.is_instrumental) {
          note(karaokeBox, 'This recording is already instrumental, so it can be used as backing music in this mode.');
          if (hasLyrics) { var extra = doc.createElement('div'); lyricsInto(extra); karaokeBox.appendChild(extra); }
        } else if (t.karaoke_authorized && t.karaoke_audio_url) {
          note(karaokeBox, 'An authorised karaoke backing track is loaded. Use the player at the bottom to play and pause.');
          if (hasLyrics) { var ex2 = doc.createElement('div'); lyricsInto(ex2); karaokeBox.appendChild(ex2); }
        } else note(karaokeBox, 'A karaoke backing track has not been added for this song yet.');
      }
    }

    function renderQueue() {
      var box = $('#queueList', root);
      if (!box) return;
      box.replaceChildren();
      queue.forEach(function (t, i) {
        var b = doc.createElement('button');
        b.type = 'button';
        b.className = 'queue-item' + (i === index ? ' current' : '');
        b.innerHTML = '<span class="q-n">' + (i + 1) + '</span><span><strong>' + esc(t.title) + '</strong><small>' + esc(t.artist) + '</small></span><span class="q-d">' + esc(t.duration || '') + '</span>';
        b.addEventListener('click', function () { goto(i, true); });
        box.appendChild(b);
      });
    }

    function render(t) {
      $('#trackTitle', root).textContent = t.title || 'MOODIFY track';
      $('#trackArtist', root).textContent = t.artist || '';
      var comp = $('#trackComposer', root); comp.textContent = t.composer ? 'Composer: ' + t.composer : ''; comp.hidden = !t.composer;
      $('#trackDescription', root).textContent = t.description || 'Enjoy your selected track in MOODIFY.';
      var tags = $('#trackTags', root); tags.replaceChildren();
      [t.genre, t.mood, t.language, t.duration].forEach(function (v) { if (v) { var s = doc.createElement('span'); s.textContent = v; tags.appendChild(s); } });
      npEl.setAttribute('data-slug', t.slug);
      var art = $('#npArt', root); art.innerHTML = '';
      if (FX().cover) art.appendChild(FX().cover(t.title, t.mood));
      var heart = $('#npHeart', root), add = $('#npAdd', root);
      heart.setAttribute('data-fav', t.slug); add.setAttribute('data-add-to-playlist', t.slug);
      var known = !!App.data.tracks.filter(function (x) { return x.slug === t.slug; }).length;
      heart.hidden = !known; add.hidden = !known;
      var fav = (App.data.favorites || []).indexOf(t.slug) !== -1;
      heart.classList.toggle('on', fav); heart.setAttribute('aria-pressed', fav ? 'true' : 'false'); heart.innerHTML = fav ? App.icons.heartFill : App.icons.heart;
      var pos = $('#queuePosition', root); if (pos) pos.textContent = 'Track ' + (index + 1) + ' of ' + queue.length;
      doc.title = (t.title || 'MOODIFY') + ' | MOODIFY';
      var rights = $('#playerRights', root);
      $('#trackCredit', root).textContent = t.credit || '';
      var lic = $('#trackLicense', root), licLink = $('#licenseLink', root), srcLink = $('#sourceLink', root);
      licLink.href = t.license_url || '#'; srcLink.href = t.source_url || '#';
      licLink.hidden = !t.license_url; srcLink.hidden = !t.source_url;
      lic.textContent = t.license_label ? 'Rights: ' + t.license_label + ' · ' : '';
      lic.append(licLink, doc.createTextNode(' · '), srcLink);
      rights.hidden = !(t.credit || t.license_label || t.license_url || t.source_url);
      if (global.history.replaceState && t.url) global.history.replaceState(global.history.state, '', t.url);
      renderModes(t); renderQueue();
      doc.dispatchEvent(new global.CustomEvent('moodify:np-render'));
    }

    function goto(i, play) {
      index = (i + queue.length) % queue.length;
      current = queue[index];
      render(current);
      mode = mode === 'karaoke' && !(current.karaoke_authorized) ? 'audio' : mode;
      if (play) P.play(current, queue);
      else P.open(current, queue, false);
    }

    function selectMode(m) {
      var wasPlaying = P.live();
      mode = m;
      tabs.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-player-mode') === m ? 'true' : 'false'); });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-player-panel') !== m; });
      if (m === 'video' && safeEmbed(current.video_embed_url) && wasPlaying) audio.pause();
      if (m === 'karaoke' || m === 'audio') syncAudioMode(wasPlaying);
      if (m === 'slowed' && speed) { speed.value = '0.75'; audio.playbackRate = 0.75; }
      renderModes(current);
      if (m === 'slowed') status('Slowed mode · 0.75× playback');
      else if (m === 'karaoke' && current.is_instrumental) status('Instrumental backing mode selected');
      else status('');
    }
    tabs.forEach(function (b) { b.addEventListener('click', function () { selectMode(b.getAttribute('data-player-mode')); }); });
    if (speed) speed.addEventListener('change', function () { audio.playbackRate = Number(speed.value) || 1; });
    audio.playbackRate = Number(speed ? speed.value : 1) || 1;

    $('#npPlay', root).addEventListener('click', function () {
      var cur = P.current();
      if (cur && cur.slug === current.slug) P.toggle(); else P.play(current, queue);
    });
    function stepBy(d) {
      var cur = P.current();
      if (cur && cur.slug === current.slug) { d > 0 ? P.next() : P.prev(); }
      else goto(index + d, true);
    }
    $('#npPrev', root).addEventListener('click', function () { stepBy(-1); });
    $('#npNext', root).addEventListener('click', function () { stepBy(1); });
    $('#npPrev', root).disabled = $('#npNext', root).disabled = queue.length < 2;

    function onPlayer(e) {
      var t = e.detail && e.detail.type;
      if (t === 'track') {
        var cur = P.current();
        if (cur && cur.slug !== current.slug) {
          var i = -1; queue.forEach(function (q, k) { if (q.slug === cur.slug) i = k; });
          if (i >= 0) { index = i; current = queue[i]; render(current); }
        }
      } else if (t === 'state') {
        var c = P.current();
        if (c && c.slug === current.slug) status(P.live() ? 'Now playing' : '');
      }
    }
    doc.addEventListener('moodify:player', onPlayer);

    render(current);
    selectMode('audio');
    // open the page's track in the bottom player (it never interrupts something that is already playing)
    P.open(current, queue, !!np.autoplay);
    return function () {
      doc.removeEventListener('moodify:player', onPlayer);
      audio.playbackRate = 1;
    };
  });
})(window);
