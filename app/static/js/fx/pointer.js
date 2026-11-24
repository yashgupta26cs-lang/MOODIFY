/* MOODIFY motion layer - pointer interactions
 *
 *  - spring press state on buttons and button-like links (CSS driven)
 *  - ambient spotlight + lag-smoothed cursor ring (mouse only)
 *  - magnetic primary buttons that snap back with spring physics
 *  - 3D tilt cards with a soft specular sheen
 *
 * Everything except the press state is limited to fine pointers (mouse /
 * trackpad) and is skipped for prefers-reduced-motion. Touch devices only get
 * the press state. The system cursor is never hidden.
 */
(function (global) {
  'use strict';
  var FX = global.MoodifyFX;
  if (!FX || !FX.register) return;

  FX.register('pointer', function (FX) {
    var gsap = global.gsap;
    var doc = document;
    var reduced = FX.flags.reducedMotion;
    var fine = FX.flags.finePointer;

    function div(cls) { var el = doc.createElement('div'); el.className = cls; el.setAttribute('aria-hidden', 'true'); return el; }

    /* ---- magnetic selectors are decided first so press skips them ---------- */
    var MAGNETIC = [
      '.home-primary-link', '.home-mood-submit', '.setup-submit', '.studio-submit',
      '.register-submit', '.rf-listen', '.mo-checkin-link', '.library-listen',
      '.library-filter-btn', '.pd-primary', '.pl-primary', '.pl-create button',
      '.player-action.primary'
    ].join(',');
    var magnets = (gsap && fine && !reduced) ? FX.qsa(MAGNETIC) : [];
    magnets.forEach(function (el) { el.classList.add('fx-magnetic'); });

    /* shine sweep inside the magnetic (primary) buttons - works on touch too */
    FX.qsa(MAGNETIC).forEach(function (btn) {
      if (btn.querySelector('.fx-shine')) return;
      btn.classList.add('fx-has-shine');
      btn.appendChild(div('fx-shine'));
    });

    /* ---- press state (all devices) --------------------------------------------- */
    var PRESS = [
      'button', 'input[type="submit"]', '.home-primary-link', '.home-secondary-link',
      '.pd-primary', '.pd-secondary', '.rf-listen', '.library-listen', '.pl-open',
      '.pl-primary', '.mo-checkin-link', '.home-text-link', '.pl-browse',
      '.library-create-playlist'
    ].join(',');
    FX.qsa(PRESS).forEach(function (el) {
      if (el.classList.contains('fx-sound-toggle')) return;
      el.classList.add('fx-press');
    });

    if (!gsap || !fine || reduced) return;

    /* ---- cursor ring + spotlight -------------------------------------------------- */
    var HOVERABLE = 'a, button, select, input, textarea, label, [role="button"], [role="tab"], .fx-tilt';
    var ring = div('fx-cursor');
    var glow = div('fx-spotlight');
    doc.body.appendChild(glow);
    doc.body.appendChild(ring);
    gsap.set([ring, glow], { x: -400, y: -400, opacity: 0 });
    var ringX = gsap.quickTo(ring, 'x', { duration: 0.35, ease: 'power3.out' });
    var ringY = gsap.quickTo(ring, 'y', { duration: 0.35, ease: 'power3.out' });
    var glowX = gsap.quickTo(glow, 'x', { duration: 0.9, ease: 'power3.out' });
    var glowY = gsap.quickTo(glow, 'y', { duration: 0.9, ease: 'power3.out' });
    var shown = false;
    var overHoverable = false;
    var pressed = false;

    function ringState() {
      gsap.to(ring, {
        scale: pressed ? 0.8 : overHoverable ? 1.7 : 1,
        opacity: overHoverable ? 0.95 : 0.7,
        duration: 0.35,
        ease: 'power3.out',
        overwrite: 'auto'
      });
    }

    doc.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (!shown) {
        shown = true;
        gsap.set([ring, glow], { x: e.clientX, y: e.clientY });
        gsap.to(ring, { opacity: 0.7, duration: 0.4 });
        gsap.to(glow, { opacity: 1, duration: 0.8 });
      }
      ringX(e.clientX); ringY(e.clientY);
      glowX(e.clientX); glowY(e.clientY);
      var over = !!(e.target && e.target.closest && e.target.closest(HOVERABLE));
      if (over !== overHoverable) { overHoverable = over; ringState(); }
    }, { passive: true });
    doc.addEventListener('pointerdown', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      pressed = true; ringState();
    });
    doc.addEventListener('pointerup', function () { pressed = false; ringState(); });
    doc.documentElement.addEventListener('mouseleave', function () {
      shown = false;
      gsap.to([ring, glow], { opacity: 0, duration: 0.3 });
    });

    /* ---- magnetic buttons ------------------------------------------------------------ */
    var PAD = 64;      // how far outside the button the pull starts (px)
    var PULL = 0.26;   // fraction of the pointer offset the button follows
    var MAXOFF = 11;   // never move more than this many px
    var near = new Map();
    var lastPointer = null;
    var magnetQueued = false;

    function magnetUpdate() {
      magnetQueued = false;
      if (!lastPointer) return;
      magnets.forEach(function (el) {
        if (el.disabled) return;
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var curX = gsap.getProperty(el, 'x') || 0;
        var curY = gsap.getProperty(el, 'y') || 0;
        var cx = r.left + r.width / 2 - curX;       // centre at rest position
        var cy = r.top + r.height / 2 - curY;
        var dx = lastPointer.x - cx;
        var dy = lastPointer.y - cy;
        var inside = Math.abs(dx) < r.width / 2 + PAD && Math.abs(dy) < r.height / 2 + PAD;
        var was = near.get(el) === true;
        if (inside) {
          near.set(el, true);
          gsap.to(el, {
            x: FX.clamp(dx * PULL, -MAXOFF, MAXOFF),
            y: FX.clamp(dy * PULL, -MAXOFF, MAXOFF),
            scale: 1.035,
            duration: 0.4,
            ease: 'power3.out',
            overwrite: 'auto'
          });
        } else if (was) {
          near.set(el, false);
          gsap.to(el, { x: 0, y: 0, scale: 1, duration: 1.05, ease: 'elastic.out(1, 0.4)', overwrite: 'auto' });
        }
      });
    }
    if (magnets.length) {
      doc.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        lastPointer = { x: e.clientX, y: e.clientY };
        if (!magnetQueued) { magnetQueued = true; global.requestAnimationFrame(magnetUpdate); }
      }, { passive: true });
      magnets.forEach(function (el) {
        el.addEventListener('pointerdown', function () {
          gsap.to(el, { scale: 0.95, duration: 0.1, ease: 'power2.out', overwrite: 'auto' });
        });
        var release = function () {
          gsap.to(el, { scale: near.get(el) ? 1.035 : 1, duration: 0.5, ease: 'back.out(3)', overwrite: 'auto' });
        };
        el.addEventListener('pointerup', release);
        el.addEventListener('pointercancel', release);
      });
    }

    /* ---- 3D tilt cards with specular sheen ----------------------------------------------- */
    var TILT = '.home-track-card, .home-taste-card, .rf-card, .library-card, .pl-card, .mo-stat';
    var MAX_TILT = 5.5;  // degrees
    FX.qsa(TILT).forEach(function (card) {
      card.classList.add('fx-tilt');
      var sheen = div('fx-sheen');
      card.appendChild(sheen);
      card.appendChild(div('fx-rim'));
      gsap.set(card, { transformPerspective: 900 });

      var rect = null;
      var queued = false;
      var last = null;

      function apply() {
        queued = false;
        if (!rect || !last) return;
        var px = FX.clamp((last.x - rect.left) / rect.width, 0, 1);
        var py = FX.clamp((last.y - rect.top) / rect.height, 0, 1);
        gsap.to(card, {
          rotationY: (px - 0.5) * 2 * MAX_TILT,
          rotationX: -(py - 0.5) * 2 * MAX_TILT,
          duration: 0.45,
          ease: 'power2.out',
          overwrite: 'auto'
        });
        sheen.style.setProperty('--fx-sx', (last.x - rect.left) + 'px');
        sheen.style.setProperty('--fx-sy', (last.y - rect.top) + 'px');
      }

      card.addEventListener('pointerenter', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        rect = card.getBoundingClientRect();    // measured while untilted
        gsap.to(card, { scale: 1.015, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
      });
      card.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        last = { x: e.clientX, y: e.clientY };
        if (!queued) { queued = true; global.requestAnimationFrame(apply); }
      }, { passive: true });
      card.addEventListener('pointerleave', function () {
        rect = null; last = null;
        gsap.to(card, { rotationX: 0, rotationY: 0, scale: 1, duration: 1, ease: 'elastic.out(1, 0.6)', overwrite: 'auto' });
      });
    });
  });
})(window);
