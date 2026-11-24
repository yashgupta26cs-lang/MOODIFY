/* MOODIFY motion layer - graphics: mood picker tiles + generated cover art
 *
 * 1. Mood picker: the plain mood <select> on the home page and the setup page
 *    is kept in the page (the form still posts it, nothing changes on the
 *    server) but is visually replaced by a grid of tiles with a small icon
 *    each. Clicking a tile sets the select and fires its normal "change"
 *    event.
 * 2. Cover art: every track / playlist card gets its own generated artwork,
 *    drawn as inline SVG from the title (the same title always gives the same
 *    picture) and coloured by the track's mood. Nothing is downloaded, no
 *    third-party images are used.
 *
 * Both are optional extras: if this file does not run, the old selects and
 * the old CSS covers stay exactly as they were.
 */
(function (global) {
  'use strict';
  var FX = global.MoodifyFX;
  if (!FX || !FX.register) return;

  /* ---- 24px line icons, one per mood ---------------------------------------- */
  var G = {
    Happy: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.4M12 19v2.4M2.6 12H5M19 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M5.4 18.6l1.7-1.7M16.9 7.1l1.7-1.7"/>',
    Relaxed: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-5 6-8 10-10"/>',
    Calm: '<path d="M2.5 9c2-2 3.7-2 5.5 0s3.5 2 5.5 0 3.7-2 5.5 0"/><path d="M2.5 14c2-2 3.7-2 5.5 0s3.5 2 5.5 0 3.7-2 5.5 0"/><path d="M2.5 19c2-2 3.7-2 5.5 0s3.5 2 5.5 0 3.7-2 5.5 0"/>',
    Energetic: '<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z"/>',
    Romantic: '<path d="M12 20.5S3.5 15.4 3.5 9.2A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.5 2.6c0 6.200-8.500 11.300-8.500 11.300z"/>',
    Sad: '<path d="M12 3.2s6 6.200 6 10.600A6 6 0 0 1 6 13.800C6 9.400 12 3.200 12 3.200z"/><path d="M9.200 14.500a3 3 0 0 0 2.300 2.300"/>',
    Motivational: '<path d="M3 19.500 9.500 8l3.500 6 2-3 6 8.500z"/><path d="M9.500 8V3.500l4 1.600-4 1.400"/>',
    Focused: '<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="4.500"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    Nostalgic: '<rect x="3" y="6" width="18" height="12" rx="2.500"/><circle cx="8.500" cy="12" r="2"/><circle cx="15.500" cy="12" r="2"/><path d="M8.500 16h7"/>',
    Adventurous: '<circle cx="12" cy="12" r="9"/><path d="m15.800 8.200-2.200 5.400-5.400 2.200 2.200-5.400z"/>',
    Reflective: '<path d="M20 14.500A8.500 8.500 0 0 1 9.500 4a8.500 8.500 0 1 0 10.500 10.500z"/>'
  };
  FX.moodGlyphs = G;
  function glyph(mood) {
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (G[mood] || G.Calm) + '</svg>';
  }

  /* ---- small seeded random generator ------------------------------------------- */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var s = seed || 1;
    return function () {
      s += 0x6D2B79F5;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rand, list) { return list[Math.floor(rand() * list.length)]; }

  /* ---- generated cover ---------------------------------------------------------- */
  var NAMES = Object.keys(FX.moods || {});
  var uid = 0;

  function cover(title, moodText, opts) {
    opts = opts || {};
    var seed = hash((title || 'moodify').toLowerCase());
    var rand = rng(seed);
    var mood = null;
    for (var i = 0; i < NAMES.length; i++) {
      if (moodText && moodText.toLowerCase().indexOf(NAMES[i].toLowerCase()) !== -1) { mood = NAMES[i]; break; }
    }
    if (!mood) mood = NAMES[seed % NAMES.length];
    var pal = FX.moods[mood].colors;
    var id = 'fxc' + (++uid);
    var style = seed % 4;                      // four compositions
    var p = '';

    p += '<defs>';
    p += '<linearGradient id="' + id + 'b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + pal[1] + '" stop-opacity=".55"/><stop offset="1" stop-color="#0a1a24"/></linearGradient>';
    p += '<radialGradient id="' + id + 'g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="' + pal[0] + '" stop-opacity=".95"/><stop offset="1" stop-color="' + pal[0] + '" stop-opacity="0"/></radialGradient>';
    p += '<radialGradient id="' + id + 'h" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="' + pal[2] + '" stop-opacity=".8"/><stop offset="1" stop-color="' + pal[2] + '" stop-opacity="0"/></radialGradient>';
    p += '</defs>';
    p += '<rect width="200" height="200" fill="url(#' + id + 'b)"/>';

    /* two soft glows */
    var gx = 40 + rand() * 120, gy = 30 + rand() * 70;
    p += '<circle cx="' + gx.toFixed(0) + '" cy="' + gy.toFixed(0) + '" r="' + (70 + rand() * 40).toFixed(0) + '" fill="url(#' + id + 'g)"/>';
    p += '<circle cx="' + (200 - gx).toFixed(0) + '" cy="' + (200 - gy).toFixed(0) + '" r="' + (60 + rand() * 40).toFixed(0) + '" fill="url(#' + id + 'h)"/>';

    if (style === 0) {                          // sun and rolling hills
      var sx = 60 + rand() * 80;
      p += '<circle cx="' + sx.toFixed(0) + '" cy="82" r="30" fill="' + pal[0] + '" fill-opacity=".9"/>';
      for (var h = 0; h < 3; h++) {
        var y0 = 112 + h * 24, a = 12 + rand() * 14, ph = rand() * 6;
        var d = 'M0 ' + y0;
        for (var x = 0; x <= 200; x += 20) d += ' L' + x + ' ' + (y0 + Math.sin(x / 34 + ph) * a).toFixed(1);
        d += ' L200 200 L0 200Z';
        p += '<path d="' + d + '" fill="' + pick(rand, pal) + '" fill-opacity="' + (0.28 + h * 0.18).toFixed(2) + '"/>';
      }
    } else if (style === 1) {                   // sound waves
      for (var w = 0; w < 6; w++) {
        var yy = 40 + w * 24, am = 6 + rand() * 18, fr = 0.02 + rand() * 0.03, ph2 = rand() * 6;
        var dd = 'M0 ' + yy;
        for (var x2 = 0; x2 <= 200; x2 += 8) dd += ' L' + x2 + ' ' + (yy + Math.sin(x2 * fr * 6 + ph2) * am).toFixed(1);
        p += '<path d="' + dd + '" fill="none" stroke="' + pal[w % 3] + '" stroke-opacity="' + (0.9 - w * 0.1).toFixed(2) + '" stroke-width="' + (2.2 - w * 0.2).toFixed(1) + '" stroke-linecap="round"/>';
      }
    } else if (style === 2) {                   // equaliser bars
      var bars = 14, bw = 200 / bars;
      for (var b = 0; b < bars; b++) {
        var hh = 24 + rand() * 110;
        p += '<rect x="' + (b * bw + 3).toFixed(1) + '" y="' + (190 - hh).toFixed(1) + '" width="' + (bw - 6).toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="3" fill="' + pal[b % 3] + '" fill-opacity="' + (0.35 + rand() * 0.5).toFixed(2) + '"/>';
      }
    } else {                                    // orbits
      var cx = 70 + rand() * 60, cy = 70 + rand() * 60;
      for (var r = 0; r < 5; r++) {
        p += '<circle cx="' + cx.toFixed(0) + '" cy="' + cy.toFixed(0) + '" r="' + (18 + r * 20) + '" fill="none" stroke="' + pal[r % 3] + '" stroke-opacity="' + (0.8 - r * 0.12).toFixed(2) + '" stroke-width="1.4"' + (r % 2 ? ' stroke-dasharray="3 6"' : '') + '/>';
        var ang = rand() * 6.28;
        p += '<circle cx="' + (cx + Math.cos(ang) * (18 + r * 20)).toFixed(1) + '" cy="' + (cy + Math.sin(ang) * (18 + r * 20)).toFixed(1) + '" r="' + (3 + rand() * 3).toFixed(1) + '" fill="' + pal[(r + 1) % 3] + '"/>';
      }
    }

    /* a few stars */
    for (var s = 0; s < 9; s++) {
      p += '<circle cx="' + (rand() * 200).toFixed(0) + '" cy="' + (rand() * 200).toFixed(0) + '" r="' + (0.6 + rand() * 1.3).toFixed(1) + '" fill="#fff" fill-opacity="' + (0.25 + rand() * 0.5).toFixed(2) + '"/>';
    }

    var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.setAttribute('class', 'fx-cover' + (opts.cls ? ' ' + opts.cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = p;
    return svg;
  }
  var doc = document;

  FX.register('art', function (FX) {

    /* ================= cover art ================= */
    function dress(selector, titleOf, moodOf) {
      FX.qsa(selector).forEach(function (art) {
        if (art.querySelector('.fx-cover')) return;
        var card = art.closest('article') || art.parentNode;
        var title = titleOf(card, art) || 'moodify';
        var mood = moodOf ? moodOf(card, art) : '';
        art.insertBefore(cover(title, mood), art.firstChild);
        art.classList.add('fx-art-host');
      });
    }
    function text(root, sel) { var n = root && root.querySelector(sel); return n ? (n.textContent || '').trim() : ''; }

    dress('.library-art',
      function (c) { return text(c, 'h2'); },
      function (c) { var chips = c.querySelectorAll('.library-chip'); return chips[1] ? chips[1].textContent : ''; });
    dress('.pl-art',
      function (c) { return text(c, 'h3'); });
    dress('.home-track-art',
      function (c) { return text(c, 'h3'); },
      function (c) { var t = c.querySelectorAll('.home-track-tags span'); return t[1] ? t[1].textContent : ''; });

    /* ================= mood picker tiles ================= */
    function tilePicker(select) {
      var opts = Array.prototype.filter.call(select.options, function (o) { return o.value && !o.disabled; });
      if (opts.length < 5 || select.dataset.fxTiles) return;
      select.dataset.fxTiles = '1';

      var grid = doc.createElement('div');
      grid.className = 'fx-mood-grid';
      grid.setAttribute('role', 'radiogroup');
      var label = select.id ? doc.querySelector('label[for="' + select.id + '"]') : null;
      if (label) { if (!label.id) label.id = 'fxl-' + select.id; grid.setAttribute('aria-labelledby', label.id); }
      else grid.setAttribute('aria-label', 'Choose a mood');

      var tiles = opts.map(function (o) {
        var b = doc.createElement('button');
        b.type = 'button';
        b.className = 'mood-tile';
        b.setAttribute('role', 'radio');
        b.dataset.mood = o.value;
        var pal = (FX.moods[o.value] || FX.neutralMood).colors;
        b.style.setProperty('--tile-rgb', FX.hexToRgb(pal[0]).join(','));
        b.innerHTML = '<span class="fx-tile-ico">' + glyph(o.value) + '</span><span class="fx-tile-name"></span>';
        b.querySelector('.fx-tile-name').textContent = o.textContent.trim() || o.value;
        grid.appendChild(b);
        return b;
      });

      function sync() {
        tiles.forEach(function (t) {
          var on = t.dataset.mood === select.value;
          t.classList.toggle('on', on);
          t.setAttribute('aria-checked', on ? 'true' : 'false');
          t.tabIndex = on || (!select.value && t === tiles[0]) ? 0 : -1;
        });
      }
      function choose(t) {
        if (select.value === t.dataset.mood) return;
        select.value = t.dataset.mood;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
      }

      grid.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('.mood-tile') : null;
        if (t) choose(t);
      });
      grid.addEventListener('keydown', function (e) {
        var i = tiles.indexOf(doc.activeElement);
        if (i < 0) return;
        var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        var n = tiles[(i + step + tiles.length) % tiles.length];
        n.focus();
        choose(n);
      });
      if (FX.flags.finePointer) {
        grid.addEventListener('pointerover', function (e) {
          var t = e.target.closest ? e.target.closest('.mood-tile') : null;
          if (t && t.dataset.mood !== FX.mood) FX.setMood(t.dataset.mood, { preview: true });
        });
        grid.addEventListener('pointerleave', function () { FX.endPreview(); });
      }
      select.addEventListener('change', sync);

      select.classList.add('fx-select-hidden');
      select.setAttribute('tabindex', '-1');
      select.setAttribute('aria-hidden', 'true');
      select.parentNode.insertBefore(grid, select.nextSibling);
      sync();
    }

    FX.qsa('#homeMood, #preferred_mood').forEach(tilePicker);
  });
})(window);
