/* MOODIFY - flowing musical staff + floating notes (decorative only).
 *
 * 1. A soft, glowing five-line staff ribbon drifts across the top of the workspace. Treble and bass
 *    clefs and notes ride along its lines. It is drawn from scratch as SVG + a few tiny HTML glyphs;
 *    no image file is used. Only `transform` and `opacity` are animated, so it runs on the GPU.
 * 2. A few notes float up from the bottom player while music plays, and from a card or mood tile while
 *    you hover it (or while its track is playing).
 *
 * Everything is aria-hidden, pointer-events:none, sits behind the content, and stops moving when the
 * visitor prefers reduced motion (see staff.css). ?fx=off turns it off with the rest of the motion layer.
 */
(function (global) {
  'use strict';
  var doc = document, root = doc.documentElement;
  if (root.classList.contains('fx-off')) return;

  var NS = 'http://www.w3.org/2000/svg';
  var TAU = Math.PI * 2;

  /* ---------------------------------------------------------------- glyphs (viewBox, inline svg) */
  var GLYPH = {
    // eighth note
    eighth: { w: 40, h: 60, body: '<ellipse cx="13" cy="46" rx="8" ry="5.6" transform="rotate(-24 13 46)" fill="currentColor"/><path d="M20 43V8" stroke="currentColor" stroke-width="2.4" fill="none"/><path d="M20 8C22 20 36 22 33 38C32 28 26 24 20 22Z" fill="currentColor"/>', hx: 13, hy: 46 },
    // two beamed eighth notes
    beam: { w: 60, h: 60, body: '<ellipse cx="13" cy="46" rx="8" ry="5.6" transform="rotate(-24 13 46)" fill="currentColor"/><ellipse cx="43" cy="42" rx="8" ry="5.6" transform="rotate(-24 43 42)" fill="currentColor"/><path d="M20 43V10M50 39V6" stroke="currentColor" stroke-width="2.4" fill="none"/><path d="M19 8L51 2V10L19 16Z" fill="currentColor"/>', hx: 13, hy: 46 },
    // quarter note
    quarter: { w: 36, h: 60, body: '<ellipse cx="13" cy="47" rx="8" ry="5.6" transform="rotate(-24 13 47)" fill="currentColor"/><path d="M20 44V8" stroke="currentColor" stroke-width="2.4" fill="none"/>', hx: 13, hy: 47 },
    // flat sign
    flat: { w: 30, h: 50, body: '<path d="M8 4V42M8 28C22 20 22 36 8 42" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>', hx: 8, hy: 30 },
    // treble clef
    treble: { w: 60, h: 150, body: '<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M33 112C34 124 28 134 20 134C11 134 8 125 12 120C16 115 24 118 23 125"/><path d="M33 112C31 92 22 80 14 66C5 50 18 36 30 36C44 36 50 52 44 64C38 76 22 74 17 64C13 56 17 48 25 47"/><path d="M33 112C37 86 40 60 36 38C34 26 31 14 33 6C34 2 37 3 38 8C40 18 33 32 28 44"/></g>', hx: 30, hy: 75 },
    // bass clef
    bass: { w: 60, h: 70, body: '<path d="M10 22C22 14 40 18 42 32C44 46 30 58 8 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><circle cx="9" cy="22" r="4.6" fill="currentColor"/><circle cx="50" cy="22" r="2.8" fill="currentColor"/><circle cx="50" cy="38" r="2.8" fill="currentColor"/>', hx: 30, hy: 35 }
  };
  function glyphSvg(name) {
    var g = GLYPH[name];
    return '<svg viewBox="0 0 ' + g.w + ' ' + g.h + '" width="' + g.w + '" height="' + g.h + '" focusable="false" aria-hidden="true">' + g.body + '</svg>';
  }

  /* ---------------------------------------------------------------- the staff ribbon */
  var SPACE = 11;          // distance between two staff lines (px)
  var AMP = 30;            // how far the ribbon swings up and down
  var HEIGHT = 250;
  var CY = 118;            // centre line of the ribbon
  // Items that glide along the lines. t = place in one tile (0..1), line = 0 (top) .. 4 (bottom), halves sit between lines.
  var ITEMS = [
    { t: 0.025, k: 'treble', line: 2 }, { t: 0.115, k: 'eighth', line: 3 }, { t: 0.185, k: 'beam', line: 1.5 },
    { t: 0.275, k: 'quarter', line: 2.5 }, { t: 0.355, k: 'bass', line: 2 }, { t: 0.445, k: 'eighth', line: 0.5 },
    { t: 0.52, k: 'flat', line: 2.5 }, { t: 0.585, k: 'beam', line: 3 }, { t: 0.68, k: 'eighth', line: 1 },
    { t: 0.76, k: 'treble', line: 2 }, { t: 0.845, k: 'quarter', line: 3.5 }, { t: 0.915, k: 'eighth', line: 1.5 }
  ];
  var SPARKS = [0.13, 0.28, 0.46, 0.6, 0.83];

  var host, flow, built = {};
  function el(tag, attrs, parent) {
    var n = doc.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function sample(L) {
    // y of staff line `line` at x, for a ribbon that swings with period L and pinches/widens as it goes
    return function (x, line) {
      var th = TAU * x / L;
      var gap = SPACE * (1 + 0.3 * Math.sin(th + 1.1));
      return CY + AMP * Math.sin(th) + (line - 2) * gap;
    };
  }
  function slopeDeg(L, x) { return Math.atan(AMP * Math.cos(TAU * x / L) * TAU / L) * 180 / Math.PI; }
  function smoothPath(pts) {
    // Catmull-Rom -> cubic Bezier, so the lines are smooth curves
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ' ' +
        (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }
  function tint(x, L) {
    // 0 at the start of a half tile, 1 at its end, back to 0: matches the SVG gradient (spreadMethod="reflect")
    var m = (x % (2 * L)) / L;
    return m <= 1 ? m : 2 - m;
  }

  function build() {
    var W = host.clientWidth || global.innerWidth;
    var small = W < 700;
    var L = Math.round(Math.max(340, Math.min(760, W * 0.62)));    // one swing of the wave
    var P = 2 * L;                                                  // one repeating tile
    var tiles = Math.ceil((W + P) / P);                              // enough tiles to cover the width while drifting one tile
    var total = tiles * P;
    var key = L + ':' + tiles + ':' + (small ? 's' : 'l');
    if (built.key === key) return;
    built.key = key;
    host.textContent = '';
    host.style.setProperty('--staff-p', P + 'px');
    host.style.height = HEIGHT + 'px';

    var clip = doc.createElement('div'); clip.className = 'staff-clip';
    flow = doc.createElement('div'); flow.className = 'staff-flow';
    flow.style.width = total + 'px';
    clip.appendChild(flow); host.appendChild(clip);

    // lines
    var svg = el('svg', { class: 'staff-lines', width: total, height: HEIGHT, viewBox: '0 0 ' + total + ' ' + HEIGHT, focusable: 'false', 'aria-hidden': 'true' });
    svg.style.width = total + 'px'; svg.style.height = HEIGHT + 'px';     // beats the generic `.dash svg` icon size
    var defs = el('defs', {}, svg);
    function grad(id, a, b) {
      var g = el('linearGradient', { id: id, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: L, y2: 0, spreadMethod: 'reflect' }, defs);
      el('stop', { offset: 0, class: a }, g); el('stop', { offset: 1, class: b }, g);
    }
    grad('staffGlow', 'sg-a', 'sg-b'); grad('staffLine', 'sl-a', 'sl-b');
    var y = sample(L), step = small ? 22 : 16;
    var glow = el('g', { class: 'staff-glow' }, svg), lines = el('g', { class: 'staff-ln' }, svg);
    for (var ln = 0; ln < 5; ln++) {
      var pts = [];
      for (var x = -step; x <= total + step; x += step) pts.push([x, y(x, ln)]);
      var d = smoothPath(pts);
      el('path', { d: d, stroke: 'url(#staffGlow)', 'stroke-width': 5, fill: 'none' }, glow);
      el('path', { d: d, stroke: 'url(#staffLine)', 'stroke-width': 1.3, fill: 'none', 'stroke-linecap': 'round' }, lines);
    }
    flow.appendChild(svg);

    // clefs and notes riding the lines, and a few glints
    var frag = doc.createDocumentFragment();
    for (var t = 0; t < tiles; t++) {
      ITEMS.forEach(function (it, i) {
        if (small && i % 2 === 1 && it.k !== 'treble' && it.k !== 'bass') return;
        var g = GLYPH[it.k], x0 = t * P + it.t * P;
        var scale = it.k === 'treble' ? 0.56 : it.k === 'bass' ? 0.5 : 0.9;
        var cx = x0, cy = y(x0, it.line);
        if (it.k === 'treble' || it.k === 'bass') cy = y(x0, 2);
        var a = doc.createElement('i');
        a.className = 'sn sn-' + it.k;
        a.style.cssText = 'left:' + (cx - g.hx * scale).toFixed(1) + 'px;top:' + (cy - g.hy * scale).toFixed(1) + 'px;width:' + (g.w * scale).toFixed(1) + 'px;height:' + (g.h * scale).toFixed(1) + 'px;' +
          '--t:' + tint(cx, L).toFixed(2) + ';--rot:' + slopeDeg(L, cx).toFixed(1) + 'deg;--o:' + ((i * 0.7 + t * 0.9) % 4).toFixed(1) + 's;--ox:' + (g.hx * scale).toFixed(1) + 'px;--oy:' + (g.hy * scale).toFixed(1) + 'px';
        a.innerHTML = '<b>' + glyphSvg(it.k) + '</b>';
        frag.appendChild(a);
      });
      if (!small) SPARKS.forEach(function (s, i) {
        var sx = t * P + s * P, sp = doc.createElement('i');
        sp.className = 'sp';
        sp.style.cssText = 'left:' + (sx - 15).toFixed(1) + 'px;top:' + (y(sx, 1 + (i % 3)) - 15).toFixed(1) + 'px;--t:' + tint(sx, L).toFixed(2) + ';--o:' + ((i * 1.1 + t) % 3).toFixed(1) + 's';
        frag.appendChild(sp);
      });
    }
    flow.appendChild(frag);
    watch();
  }

  /* pause the drift when the banner is scrolled out of view or the tab is hidden */
  var io = null;
  function watch() {
    if (!global.IntersectionObserver || io) return;
    io = new global.IntersectionObserver(function (entries) {
      entries.forEach(function (e) { host.classList.toggle('is-off', !e.isIntersecting); });
    });
    io.observe(host);
  }
  doc.addEventListener('visibilitychange', function () { if (host) host.classList.toggle('is-hidden', doc.hidden); });

  /* mood tint: follows the saved mood, not the hover previews, so hovering tiles never repaints the ribbon */
  function setTint(palette) {
    if (!host) return;
    if (!palette || !palette.colors) { host.style.removeProperty('--staff-a'); host.style.removeProperty('--staff-b'); host.removeAttribute('data-tinted'); return; }
    host.style.setProperty('--staff-a', palette.colors[0]);
    host.style.setProperty('--staff-b', palette.colors[1] || palette.colors[0]);
    host.setAttribute('data-tinted', '');
  }

  /* ---------------------------------------------------------------- rising notes (player, cards, mood tiles) */
  var RISE = ['eighth', 'beam', 'treble', 'eighth', 'quarter'];
  var SPOTS = [[18, 10, 3.4, 0], [38, -12, 4.1, 0.9], [58, 14, 3.7, 1.7], [76, -8, 4.5, 2.4], [90, 6, 3.9, 3.1]];
  function ensure(hostEl) {
    if (!hostEl || hostEl.__notes) return;
    hostEl.__notes = true;
    var wrap = doc.createElement('span');
    wrap.className = 'fx-rise';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = RISE.map(function (k, i) {
      var s = SPOTS[i];
      return '<i class="rn rn-' + k + '" style="--x:' + s[0] + ';--dx:' + s[1] + 'px;--d:' + s[2] + 's;--delay:' + s[3] + 's">' + glyphSvg(k) + '</i>';
    }).join('');
    hostEl.appendChild(wrap);
  }
  var HOVER = '.dash-card, .dash-mood, .mood-link-tile';
  doc.addEventListener('pointerover', function (e) {
    var t = e.target && e.target.closest ? e.target.closest(HOVER) : null;
    if (t) ensure(t);
  }, { passive: true });

  global.MoodifyNotes = { ensure: ensure };

  function init() {
    host = doc.getElementById('staff');
    var player = doc.getElementById('dashPlayer');
    if (player) ensure(player);
    if (!host) return;
    build();
    var timer = 0;
    global.addEventListener('resize', function () { global.clearTimeout(timer); timer = global.setTimeout(build, 180); });
    doc.addEventListener('fx:mood', function (e) { if (e.detail && !e.detail.preview) setTint(e.detail.mood ? e.detail.palette : null); });
    var FX = global.MoodifyFX;
    if (FX && FX.mood && FX.palette) setTint(FX.palette);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
