/* MOODIFY motion layer - mood-reactive ambient background (aurora)
 *
 * Performance note: the aurora is painted into ONE small canvas (a few hundred
 * pixels wide) that the browser scales up to the full window. Scaling makes
 * the soft gradients look smooth, and the browser only has to composite a
 * single layer, instead of several window-sized animated layers. The cursor
 * spotlight and the edge vignette are painted into the same canvas, so they
 * cost nothing extra. A second, light canvas draws floating particles.
 *
 * Colours follow the current mood (MoodifyFX.moods in core.js). The aurora
 * drifts on its own, leans away from the pointer, shifts slightly when you
 * scroll and swells when you choose a mood.
 *
 * Without JavaScript the static navy gradient from fx.css remains.
 * With prefers-reduced-motion the aurora is drawn once and does not move.
 * In "lite" mode (slow computers, detected automatically) it is simpler.
 */
(function (global) {
  'use strict';
  var FX = global.MoodifyFX;
  if (!FX || !FX.register) return;

  FX.register('ambient', function (FX) {
    var gsap = global.gsap;
    if (!gsap) return;
    var doc = document;
    var reduced = FX.flags.reducedMotion;
    var fine = FX.flags.finePointer;

    function el(tag, cls) { var e = doc.createElement(tag); e.className = cls; return e; }

    /* ---- aurora definition ---------------------------------------------------
     * bx/by: resting position (0..1), size: diameter in vmax, c: palette index,
     * a: strength, depth/scroll: parallax amounts, sx/sy/ph: drift speed & phase. */
    var ORBS = [
      { bx: 0.10, by: 0.26, size: 82, c: 0, a: 0.42, depth: 0.25, scroll: 0.05, sx: 0.050, sy: 0.040, ph: 0.0, amp: 0.10 },
      { bx: 0.90, by: 0.74, size: 70, c: 1, a: 0.38, depth: 0.25, scroll: 0.05, sx: 0.040, sy: 0.060, ph: 1.7, amp: 0.10 },
      { bx: 0.64, by: 0.08, size: 54, c: 2, a: 0.34, depth: 0.50, scroll: 0.10, sx: 0.065, sy: 0.045, ph: 3.1, amp: 0.12 },
      { bx: 0.30, by: 0.60, size: 42, c: 1, a: 0.20, depth: 0.50, scroll: 0.10, sx: 0.055, sy: 0.070, ph: 4.2, amp: 0.12 },
      { bx: 0.22, by: 0.92, size: 44, c: 0, a: 0.30, depth: 0.85, scroll: 0.18, sx: 0.070, sy: 0.050, ph: 5.0, amp: 0.14 },
      { bx: 0.86, by: 0.22, size: 34, c: 2, a: 0.26, depth: 0.85, scroll: 0.18, sx: 0.060, sy: 0.075, ph: 2.4, amp: 0.14 }
    ];

    var host = el('div', 'fx-ambient');
    host.setAttribute('aria-hidden', 'true');
    var aurora = el('canvas', 'fx-aurora');
    host.appendChild(aurora);
    var actx = aurora.getContext && aurora.getContext('2d');

    var particleCanvas = el('canvas', 'fx-particles');
    host.appendChild(particleCanvas);
    var pctx = particleCanvas.getContext && particleCanvas.getContext('2d');

    var cols = FX.palette.colors.map(FX.hexToRgb);
    var targetCols = cols.map(function (c) { return c.slice(); });
    var state = { pulse: 0 };
    var clock = 0;
    var W = 0, H = 0, AW = 0, AH = 0, scale = 1, vmax = 1;
    var px = 0, py = 0, tpx = 0, tpy = 0;      // eased pointer lean (-0.5..0.5)
    var mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5; // eased pointer position (0..1)
    var pointerSeen = false;

    function resize() {
      W = global.innerWidth;
      H = global.innerHeight;
      vmax = Math.max(W, H);
      var base = FX.lite ? 220 : 340;       // pixel width of the aurora canvas
      AW = base;
      AH = Math.max(120, Math.round(base * H / Math.max(W, 1)));
      aurora.width = AW;
      aurora.height = AH;
      scale = AW / W;
      var dpr = Math.min(global.devicePixelRatio || 1, 1.5);
      particleCanvas.width = Math.round(W * dpr);
      particleCanvas.height = Math.round(H * dpr);
      if (pctx) pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) drawAurora(0);
    }

    function rgba(c, a) {
      return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a.toFixed(3) + ')';
    }

    function drawAurora(dt) {
      if (!actx) return;
      var k = Math.min(1, dt * 2.4);
      for (var c = 0; c < 3; c++) for (var j = 0; j < 3; j++) cols[c][j] += (targetCols[c][j] - cols[c][j]) * k;
      px += (tpx - px) * Math.min(1, dt * 2.2);
      py += (tpy - py) * Math.min(1, dt * 2.2);
      mx += (tmx - mx) * Math.min(1, dt * 7);
      my += (tmy - my) * Math.min(1, dt * 7);

      var speed = FX.palette.speed || 1;
      var sy = global.pageYOffset || 0;
      actx.clearRect(0, 0, AW, AH);
      for (var i = 0; i < ORBS.length; i++) {
        var o = ORBS[i];
        var t = clock * speed;
        var x = (o.bx + Math.sin(t * o.sx * 6.28 + o.ph) * o.amp - px * o.depth * 0.18) * AW;
        var y = (o.by + Math.cos(t * o.sy * 6.28 + o.ph * 1.3) * o.amp - py * o.depth * 0.18) * AH - sy * o.scroll * scale;
        var grow = 1 + state.pulse * 0.14;
        var r = (o.size / 100) * vmax * 0.47 * scale * grow;
        var a = o.a * 0.78 * (1 + state.pulse * 0.9);
        var col = cols[o.c % 3];
        var g = actx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(col, a));
        g.addColorStop(0.55, rgba(col, a * 0.38));
        g.addColorStop(1, rgba(col, 0));
        actx.fillStyle = g;
        actx.fillRect(x - r, y - r, r * 2, r * 2);
      }

      /* cursor spotlight, painted into the same canvas */
      if (pointerSeen && !FX.lite && fine) {
        var sr = 300 * scale;
        var sx = mx * AW, sy2 = my * AH;
        var sg = actx.createRadialGradient(sx, sy2, 0, sx, sy2, sr);
        sg.addColorStop(0, rgba(cols[0], 0.24));
        sg.addColorStop(1, rgba(cols[0], 0));
        actx.fillStyle = sg;
        actx.fillRect(sx - sr, sy2 - sr, sr * 2, sr * 2);
      }

      /* edge vignette keeps the corners calm and text readable */
      var vg = actx.createRadialGradient(AW / 2, AH * 0.46, Math.min(AW, AH) * 0.45, AW / 2, AH * 0.5, Math.max(AW, AH) * 0.78);
      vg.addColorStop(0, 'rgba(3,9,13,0)');
      vg.addColorStop(1, 'rgba(3,9,13,0.55)');
      actx.fillStyle = vg;
      actx.fillRect(0, 0, AW, AH);
    }

    /* ---- particles ------------------------------------------------------------ */
    var COUNT = FX.flags.smallScreen ? 14 : 30;
    var particles = [];
    for (var i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random(), y: Math.random(),
        r: FX.rand(0.7, 2.2), vy: FX.rand(0.004, 0.017), vx: FX.rand(-0.004, 0.004),
        ph: FX.rand(0, 6.28), tw: FX.rand(0.4, 1.2), k: i % 3, a: FX.rand(0.25, 0.6)
      });
    }

    function drawParticles(dt) {
      if (!pctx) return;
      pctx.clearRect(0, 0, W, H);
      if (FX.lite) return;
      var speed = FX.palette.speed || 1;
      for (var n = 0; n < particles.length; n++) {
        var p = particles[n];
        p.y -= p.vy * dt * speed;
        p.x += p.vx * dt * speed;
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
        if (p.x < -0.02) p.x = 1.02;
        if (p.x > 1.02) p.x = -0.02;
        var alpha = p.a * (0.6 + 0.4 * Math.sin(clock * p.tw + p.ph));
        var col = cols[p.k];
        var rgb = (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0);
        var qx = p.x * W, qy = p.y * H;
        pctx.fillStyle = 'rgba(' + rgb + ',' + (alpha * 0.2).toFixed(3) + ')';
        pctx.beginPath(); pctx.arc(qx, qy, p.r * 3, 0, 6.2832); pctx.fill();
        pctx.fillStyle = 'rgba(' + rgb + ',' + alpha.toFixed(3) + ')';
        pctx.beginPath(); pctx.arc(qx, qy, p.r, 0, 6.2832); pctx.fill();
      }
    }

    /* ---- mount ------------------------------------------------------------------ */
    doc.body.insertBefore(host, doc.body.firstChild);
    resize();
    var resizeTimer;
    global.addEventListener('resize', function () {
      global.clearTimeout(resizeTimer);
      resizeTimer = global.setTimeout(resize, 150);
    });
    drawAurora(0);

    if (!reduced) {
      /* pointer lean + spotlight target (just records numbers; drawing is on the ticker) */
      if (fine) {
        doc.addEventListener('pointermove', function (e) {
          if (e.pointerType && e.pointerType !== 'mouse') return;
          pointerSeen = true;
          tmx = e.clientX / global.innerWidth;
          tmy = e.clientY / global.innerHeight;
          tpx = tmx - 0.5;
          tpy = tmy - 0.5;
        }, { passive: true });
        doc.documentElement.addEventListener('mouseleave', function () { pointerSeen = false; });
      }

      var acc = 0, pacc = 0;
      gsap.ticker.add(function (time, deltaTime) {
        acc += deltaTime;
        var step = FX.lite ? 50 : 33;            // 20 / 30 frames per second
        if (acc < step) return;
        var dt = Math.min(acc, 100) / 1000;
        acc = 0;
        clock += dt;
        drawAurora(dt);
        pacc += dt;
        if (pacc >= 0.066) { drawParticles(pacc); pacc = 0; }
      });
    }

    /* ---- reactions ----------------------------------------------------------------- */
    function pulse() {
      if (reduced) return;
      gsap.fromTo(state, { pulse: 1 }, { pulse: 0, duration: 1.8, ease: 'power2.out', overwrite: true });
    }

    FX.on('mood', function (d) {
      targetCols = d.palette.colors.map(FX.hexToRgb);
      if (reduced) { cols = targetCols.map(function (c) { return c.slice(); }); drawAurora(0); }
      if (d.action) pulse();
    });
    FX.on('pulse', pulse);
    FX.on('lite', function () { resize(); });

    /* Login / register mood chips preview their mood on hover or focus. */
    FX.qsa('.mood-tag').forEach(function (chip) {
      var map = { CALM: 'Calm', FOCUS: 'Focused', ENERGY: 'Energetic', DREAM: 'Reflective' };
      var mood = map[(chip.textContent || '').trim().toUpperCase()];
      if (!mood) return;
      chip.addEventListener('pointerenter', function () { FX.setMood(mood, { preview: true }); });
      chip.addEventListener('pointerleave', function () { FX.endPreview(); });
    });

    FX.ambient = { pulse: pulse };
  });
})(window);
