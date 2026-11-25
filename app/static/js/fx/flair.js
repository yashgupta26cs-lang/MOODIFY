/* MOODIFY motion layer - "flair" (light version)
 *
 * What is left here is deliberately small and instant:
 *   - a quick gliding highlight in the page navigation bars
 *   - a short number count-up on the Moodometer stats
 *   - an automatic "lite mode" switch when the page measures itself as slow
 *
 * There are NO intro screens, curtains, shutters or full-screen overlays, and
 * nothing delays a page: content is visible from the first paint and every
 * transition is 150-220 ms.
 */
(function (global) {
  'use strict';
  var FX = global.MoodifyFX;
  if (!FX || !FX.register) return;

  FX.register('flair', function (FX) {
    var gsap = global.gsap;
    var doc = document;
    var reduced = FX.flags.reducedMotion;

    function el(tag, cls) {
      var e = doc.createElement(tag);
      if (cls) e.className = cls;
      return e;
    }

    /* ---- self-check: switch to lite mode if the page cannot keep up ------------ */
    if (!reduced && !FX.lite && !/[?&]fx=rich\b/.test(global.location.search)) {
      var frames = [], last = 0, strikes = 0, running = true;
      var sample = function (t) {
        if (!running) return;
        if (last && !doc.hidden) {
          var d = t - last;
          if (d < 400) frames.push(d);
        }
        last = t;
        if (frames.length > 120) frames.shift();
        global.requestAnimationFrame(sample);
      };
      global.requestAnimationFrame(sample);
      global.setTimeout(function check() {
        if (FX.lite) { running = false; return; }
        if (frames.length >= 60) {
          var slow = frames.filter(function (d) { return d > 30; }).length / frames.length;
          strikes = slow > 0.4 ? strikes + 1 : 0;
          if (strikes >= 3) { FX.setLite(true, true); running = false; return; }
        }
        global.setTimeout(check, 1000);
      }, 3000);
    }

    if (!gsap) return;

    /* ---- gliding highlight in the navigation ---------------------------------------- */
    FX.qsa('header[class$="-topbar"] nav').forEach(function (nav) {
      var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
      if (!links.length) return;
      if (global.getComputedStyle(nav).position === 'static') nav.style.position = 'relative';
      var pill = el('span', 'fx-navpill');
      pill.setAttribute('aria-hidden', 'true');
      nav.insertBefore(pill, nav.firstChild);
      nav.classList.add('fx-navpill-on');
      var active = nav.querySelector('a.active') || null;

      function place(a, instant) {
        if (!a) { gsap.to(pill, { opacity: 0, duration: 0.15 }); return; }
        gsap.to(pill, {
          x: a.offsetLeft, y: a.offsetTop, width: a.offsetWidth, height: a.offsetHeight,
          opacity: 1, duration: instant || reduced ? 0 : 0.2, ease: 'power2.out', overwrite: 'auto'
        });
      }
      links.forEach(function (a) {
        a.addEventListener('pointerenter', function () { place(a); });
        a.addEventListener('focus', function () { place(a); });
      });
      nav.addEventListener('pointerleave', function () { place(active); });
      nav.addEventListener('focusout', function () { place(active); });
      place(active, true);
      global.addEventListener('resize', function () { place(active, true); });
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { place(active, true); });
    });

    /* ---- number count-up (Moodometer stats) ---------------------------------------------- */
    if (!reduced && 'IntersectionObserver' in global) {
      var io = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          var node = en.target.__fxNum;
          var end = parseInt(node.nodeValue, 10);
          var o = { v: 0 };
          node.nodeValue = '0';
          gsap.to(o, { v: end, duration: 0.6, ease: 'power2.out',
            onUpdate: function () { node.nodeValue = String(Math.round(o.v)); },
            onComplete: function () { node.nodeValue = String(end); } });
        });
      }, { threshold: 0.4 });
      FX.qsa('.mo-stat strong').forEach(function (s) {
        var n = s.firstChild;
        if (n && n.nodeType === 3 && /^\s*\d+\s*$/.test(n.nodeValue)) {
          s.__fxNum = n;
          var end0 = parseInt(n.nodeValue, 10);
          if (end0 > 0 && end0 < 100000) io.observe(s);
        }
      });
    }
  });
})(window);
