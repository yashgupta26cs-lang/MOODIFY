/* MOODIFY motion layer - mood-reactive ambient background
 *
 * Soft colour orbs (plain divs animated with transform/opacity only, so they
 * stay on the GPU compositor) drift and "morph" behind the page, with a light
 * canvas of floating particles. Colours follow the current mood (see
 * MoodifyFX.moods in core.js), and the layers react to the pointer (parallax),
 * to scrolling (depth) and to the user choosing a mood (a small pulse).
 *
 * Without JavaScript the static navy gradient from fx.css remains.
 * With prefers-reduced-motion the layer is drawn once and does not move.
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

    function div(cls) { var el = doc.createElement('div'); el.className = cls; return el; }

    /* ---- orbs ------------------------------------------------------------ */
    var LAYERS = [
      { depth: 0.25, scroll: 0.05, orbs: [
        { x: '10%', y: '26%', size: '82vmax', c: 0, o: 0.42 },
        { x: '90%', y: '74%', size: '70vmax', c: 1, o: 0.38 }
      ] },
      { depth: 0.5, scroll: 0.1, orbs: [
        { x: '64%', y: '8%', size: '54vmax', c: 2, o: 0.34 },
        { x: '30%', y: '60%', size: '42vmax', c: 1, o: 0.2 }
      ] },
      { depth: 0.85, scroll: 0.18, orbs: [
        { x: '22%', y: '92%', size: '44vmax', c: 0, o: 0.3 },
        { x: '86%', y: '22%', size: '34vmax', c: 2, o: 0.26 }
      ] }
    ];

    var host = div('fx-ambient');
    host.setAttribute('aria-hidden', 'true');

    var startPalette = FX.palette.colors;
    var layers = LAYERS.map(function (def) {
      var outer = div('fx-orb-layer');
      var inner = div('fx-orb-layer');
      outer.appendChild(inner);
      var orbs = def.orbs.map(function (od) {
        var el = div('fx-orb');
        el.style.setProperty('--x', od.x);
        el.style.setProperty('--y', od.y);
        el.style.setProperty('--size', od.size);
        el.style.setProperty('--orb-color', FX.rgbString(FX.hexToRgb(startPalette[od.c % startPalette.length])));
        inner.appendChild(el);
        gsap.set(el, { opacity: od.o });
        return { el: el, def: od, tween: null };
      });
      host.appendChild(outer);
      return { def: def, outer: outer, inner: inner, orbs: orbs };
    });

    /* drifting / morphing motion */
    if (!reduced) {
      layers.forEach(function (layer) {
        layer.orbs.forEach(function (o) {
          o.tween = gsap.to(o.el, {
            xPercent: 'random(-24, 24)',
            yPercent: 'random(-24, 24)',
            scale: 'random(0.85, 1.3)',
            duration: 'random(11, 20)',
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
            repeatRefresh: true
          });
          o.tween.timeScale(FX.palette.speed);
        });
      });
    }

    function applyPalette(palette, instant) {
      layers.forEach(function (layer) {
        layer.orbs.forEach(function (o) {
          var rgb = FX.rgbString(FX.hexToRgb(palette.colors[o.def.c % palette.colors.length]));
          gsap.to(o.el, {
            '--orb-color': rgb,
            duration: instant || reduced ? 0 : 1.6,
            ease: 'sine.inOut',
            overwrite: 'auto'
          });
          if (o.tween) gsap.to(o.tween, { timeScale: palette.speed, duration: 1.5, ease: 'sine.inOut', overwrite: 'auto' });
        });
      });
    }

    /* pointer parallax (fine pointers only) */
    if (!reduced && FX.flags.finePointer) {
      layers.forEach(function (layer) {
        layer.qx = gsap.quickTo(layer.inner, 'x', { duration: 1.4, ease: 'power3.out' });
        layer.qy = gsap.quickTo(layer.inner, 'y', { duration: 1.4, ease: 'power3.out' });
      });
      doc.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        var nx = e.clientX / global.innerWidth - 0.5;
        var ny = e.clientY / global.innerHeight - 0.5;
        layers.forEach(function (layer) {
          layer.qx(-nx * layer.def.depth * 90);
          layer.qy(-ny * layer.def.depth * 90);
        });
      }, { passive: true });
    }

    /* scroll depth */
    if (!reduced) {
      var scrollTick = false;
      var onScroll = function () {
        if (scrollTick) return;
        scrollTick = true;
        global.requestAnimationFrame(function () {
          scrollTick = false;
          var y = global.pageYOffset || 0;
          layers.forEach(function (layer) { gsap.set(layer.outer, { y: -y * layer.def.scroll }); });
        });
      };
      global.addEventListener('scroll', onScroll, { passive: true });
    }

    /* ---- particles ------------------------------------------------------- */
    var canvas = doc.createElement('canvas');
    canvas.className = 'fx-particles';
    host.appendChild(canvas);
    var ctx = canvas.getContext && canvas.getContext('2d');

    var W = 0, H = 0;
    var dpr = Math.min(global.devicePixelRatio || 1, 1.5);
    function resize() {
      if (!ctx) return;
      W = global.innerWidth;
      H = global.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) drawFrame(0);
    }

    var COUNT = FX.flags.smallScreen ? 20 : 44;
    var particles = [];
    for (var i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random(), y: Math.random(),
        r: FX.rand(0.7, 2.2), vy: FX.rand(0.004, 0.017), vx: FX.rand(-0.004, 0.004),
        ph: FX.rand(0, 6.28), tw: FX.rand(0.4, 1.2), k: i % 3, a: FX.rand(0.25, 0.6)
      });
    }
    var cols = FX.palette.colors.map(FX.hexToRgb);
    var targetCols = cols.map(function (c) { return c.slice(); });
    var state = { boost: 1 };
    var clock = 0;

    function drawFrame(dt) {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      var speed = (FX.palette.speed || 1) * state.boost;
      for (var c = 0; c < 3; c++) {
        for (var k = 0; k < 3; k++) cols[c][k] += (targetCols[c][k] - cols[c][k]) * Math.min(1, dt * 2.2);
      }
      for (var n = 0; n < particles.length; n++) {
        var p = particles[n];
        p.y -= p.vy * dt * speed;
        p.x += p.vx * dt * speed;
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
        if (p.x < -0.02) p.x = 1.02;
        if (p.x > 1.02) p.x = -0.02;
        var alpha = p.a * (0.6 + 0.4 * Math.sin(clock * p.tw + p.ph));
        var col = cols[p.k];
        var rgb = Math.round(col[0]) + ',' + Math.round(col[1]) + ',' + Math.round(col[2]);
        var px = p.x * W, py = p.y * H;
        ctx.fillStyle = 'rgba(' + rgb + ',' + (alpha * 0.22).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(px, py, p.r * 3.2, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(' + rgb + ',' + alpha.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(px, py, p.r, 0, 6.2832); ctx.fill();
      }
    }

    /* ---- mount ----------------------------------------------------------- */
    doc.body.insertBefore(host, doc.body.firstChild);
    resize();
    var resizeTimer;
    global.addEventListener('resize', function () {
      global.clearTimeout(resizeTimer);
      resizeTimer = global.setTimeout(resize, 150);
    });

    if (!reduced) {
      var acc = 0;
      gsap.ticker.add(function (time, deltaTime) {
        acc += deltaTime;
        if (acc < 32) return;            // ~30fps is plenty for slow ambience
        var dt = Math.min(acc, 100) / 1000;
        acc = 0;
        clock += dt;
        drawFrame(dt);
      });
    }

    /* ---- reactions -------------------------------------------------------- */
    function pulse() {
      if (reduced) return;
      gsap.to(state, { boost: 1, duration: 1.8, ease: 'power2.out', startAt: { boost: 4 }, overwrite: 'auto' });
      layers.forEach(function (layer) {
        gsap.fromTo(layer.inner, { scale: 1 }, { scale: 1.07, duration: 0.45, ease: 'sine.out', yoyo: true, repeat: 1, overwrite: 'auto' });
      });
    }

    FX.on('mood', function (d) {
      applyPalette(d.palette, false);
      targetCols = d.palette.colors.map(FX.hexToRgb);
      if (reduced) drawFrame(0);
      if (d.action) pulse();
    });
    FX.on('pulse', pulse);

    /* Login / register mood chips preview their mood on hover or focus. */
    FX.qsa('.mood-tag').forEach(function (chip) {
      var map = { CALM: 'Calm', FOCUS: 'Focused', ENERGY: 'Energetic', DREAM: 'Reflective' };
      var mood = map[(chip.textContent || '').trim().toUpperCase()];
      if (!mood) return;
      chip.addEventListener('pointerenter', function () { FX.setMood(mood, { preview: true }); });
      chip.addEventListener('pointerleave', function () { FX.endPreview(); });
    });

    applyPalette(FX.palette, true);
    FX.ambient = { pulse: pulse };
  });
})(window);
