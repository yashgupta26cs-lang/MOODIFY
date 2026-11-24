/* MOODIFY motion layer - "flair"
 *
 * The showy parts of the interface:
 *   - intro curtain (logo draw on the first visit of a session) and sliding
 *     curtain between pages
 *   - headline word-by-word reveal with animated gradient on accent words
 *   - click ripples + sparks, mood colour flood, cursor sparkle trail
 *   - scroll-speed marquee of moods on the home page
 *   - gliding highlight in the navigation bar
 *   - number count-up on the Moodometer stats, film grain overlay
 *
 * Everything is decoration: if anything fails, the page keeps working and the
 * entrance gate (FX.openGate) is always opened so content is never left hidden.
 * Animations use transform / opacity (text gradients and the nav pill excepted).
 */
(function (global) {
  'use strict';
  var FX = global.MoodifyFX;
  if (!FX || !FX.register) return;

  FX.register('flair', function (FX) {
    var gsap = global.gsap;
    var doc = document;
    var root = doc.documentElement;
    var reduced = FX.flags.reducedMotion;
    var fine = FX.flags.finePointer;

    function el(tag, cls, html) {
      var e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (html) e.innerHTML = html;
      return e;
    }
    function clearVeil() { root.classList.remove('fx-veil'); }

    if (!gsap) { clearVeil(); FX.openGate(); return; }

    /* ---- film grain + overlay layer for ripples / sparkles ---------------- */
    var layer = el('div', 'fx-fxlayer');
    layer.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(layer);

    /* ======================================================================
       Intro + page curtain
       ====================================================================== */
    var intro = null, top = null, bottom = null, center = null;
    var firstVisit = false;
    try { firstVisit = global.sessionStorage.getItem('moodify.intro') !== '1'; } catch (e) { /* private mode */ }

    function buildIntro() {
      intro = el('div', 'fx-intro');
      intro.setAttribute('aria-hidden', 'true');
      top = el('div', 'fx-curtain fx-curtain-top');
      bottom = el('div', 'fx-curtain fx-curtain-bottom');
      center = el('div', 'fx-intro-center',
        '<svg class="fx-intro-logo" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="4" y="4" width="56" height="56" rx="16" class="fx-intro-box"/>' +
        '<path class="fx-intro-m" d="M14 40 L22 24 L30 36 L38 20 L46 36 L50 28"/></svg>' +
        '<div class="fx-intro-word">MOODIFY</div>' +
        '<div class="fx-intro-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>');
      intro.appendChild(top); intro.appendChild(bottom); intro.appendChild(center);
      doc.body.appendChild(intro);
    }

    function openCurtain(done) {
      var tl = gsap.timeline({ onComplete: function () { intro.style.display = 'none'; if (done) done(); } });
      tl.to(center, { opacity: 0, scale: 1.08, duration: 0.35, ease: 'power2.in' }, 0)
        .to(top, { yPercent: -101, duration: firstVisit ? 0.85 : 0.5, ease: 'power4.inOut' }, firstVisit ? 0.1 : 0)
        .to(bottom, { yPercent: 101, duration: firstVisit ? 0.85 : 0.5, ease: 'power4.inOut' }, firstVisit ? 0.1 : 0);
      // content may start rising as soon as the curtains are half open
      tl.call(FX.openGate, null, firstVisit ? 0.5 : 0.22);
      return tl;
    }

    function closeCurtain(done) {
      intro.style.display = '';
      gsap.set(center, { opacity: 0 });
      gsap.fromTo(top, { yPercent: -101 }, { yPercent: 0, duration: 0.34, ease: 'power3.in' });
      gsap.fromTo(bottom, { yPercent: 101 }, { yPercent: 0, duration: 0.34, ease: 'power3.in', onComplete: done });
    }

    if (reduced) {
      clearVeil();
      FX.openGate();
    } else {
      buildIntro();
      gsap.set(top, { yPercent: 0 });
      gsap.set(bottom, { yPercent: 0 });
      clearVeil();                       // the real curtains are in place now

      if (firstVisit) {
        try { global.sessionStorage.setItem('moodify.intro', '1'); } catch (e) { /* ignore */ }
        var path = center.querySelector('.fx-intro-m');
        var box = center.querySelector('.fx-intro-box');
        var len = path.getTotalLength(), blen = box.getTotalLength ? box.getTotalLength() : 220;
        gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
        gsap.set(box, { strokeDasharray: blen, strokeDashoffset: blen });
        gsap.set(center.querySelector('.fx-intro-word'), { yPercent: 110, opacity: 0 });
        gsap.set(center.querySelectorAll('.fx-intro-bars i'), { scaleY: 0.15 });
        var t = gsap.timeline({ onComplete: function () { openCurtain(); } });
        t.to(box, { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' }, 0.05)
          .to(path, { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' }, 0.25)
          .to(center.querySelector('.fx-intro-word'), { yPercent: 0, opacity: 1, duration: 0.6, ease: 'power4.out' }, 0.55)
          .to(center.querySelectorAll('.fx-intro-bars i'), {
            scaleY: function () { return 0.4 + Math.random() * 0.9; },
            duration: 0.28, ease: 'sine.inOut', stagger: 0.04, repeat: 2, yoyo: true
          }, 0.6);
      } else {
        gsap.set(center, { opacity: 0 });
        global.requestAnimationFrame(function () { openCurtain(); });
      }
      /* Safety net: whatever happens, the curtain must not stay up. */
      global.setTimeout(function () {
        if (intro && intro.style.display !== 'none' && !intro.__leaving) {
          gsap.to([top, bottom], { yPercent: function (i) { return i ? 101 : -101; }, duration: 0.4 });
          gsap.to(center, { opacity: 0, duration: 0.2 });
          FX.openGate();
        }
      }, 4200);

      /* leaving a page: curtains close, then follow the link as normal */
      doc.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a || a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-no-transition')) return;
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) return;
        var url;
        try { url = new URL(a.href, global.location.href); } catch (err) { return; }
        if (url.origin !== global.location.origin) return;
        if (url.pathname === global.location.pathname && url.search === global.location.search) return;
        e.preventDefault();
        intro.__leaving = true;
        if (FX.sound) FX.sound.play('swoosh');
        var gone = false;
        var go = function () { if (gone) return; gone = true; global.location.href = a.href; };
        closeCurtain(go);
        global.setTimeout(go, 900);
      });

      /* back/forward cache restores the old page with the curtain closed */
      global.addEventListener('pageshow', function (e) {
        if (e.persisted && intro) { intro.__leaving = false; gsap.set(top, { yPercent: -101 }); gsap.set(bottom, { yPercent: 101 }); intro.style.display = 'none'; }
      });
    }

    /* ======================================================================
       Headlines: word reveal + gradient on the accent words
       ====================================================================== */
    function splitHeading(h) {
      if (h.id === 'trackTitle' || h.closest('.fx-intro') || h.__fxSplit) return;
      h.__fxSplit = true;
      var label = (h.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label) return;
      h.setAttribute('aria-label', label);

      function walk(node, accent) {
        Array.prototype.slice.call(node.childNodes).forEach(function (child) {
          if (child.nodeType === 3) {
            var parts = child.nodeValue.split(/(\s+)/);
            var frag = doc.createDocumentFragment();
            parts.forEach(function (part) {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(' ')); return; }
              var w = el('span', 'fx-w');
              w.setAttribute('aria-hidden', 'true');
              var inner = el('span', 'fx-wi' + (accent ? ' fx-grad' : ''));
              inner.textContent = part;
              w.appendChild(inner);
              frag.appendChild(w);
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === 1 && child.tagName !== 'BR') {
            walk(child, accent || child.tagName === 'SPAN');
          }
        });
      }
      walk(h, false);
    }

    var heads = [];
    if (!reduced) {
      FX.qsa('h1').forEach(function (h) { splitHeading(h); });
      heads = FX.qsa('h1 .fx-wi');
      if (heads.length) {
        gsap.set(heads, { yPercent: 118, rotate: 5, transformOrigin: '0 100%' });
        FX.whenOpen(function () {
          gsap.to(heads, { yPercent: 0, rotate: 0, duration: 1.05, ease: 'power4.out', stagger: 0.07, delay: 0.12 });
        });
      }
    }

    /* ======================================================================
       Ripples, sparks, mood flood, sparkle trail
       ====================================================================== */
    var lastX = global.innerWidth / 2, lastY = global.innerHeight / 2;
    doc.addEventListener('pointermove', function (e) { lastX = e.clientX; lastY = e.clientY; }, { passive: true });

    function spawnRing(x, y, big) {
      var r = el('div', 'fx-ring');
      layer.appendChild(r);
      gsap.fromTo(r, { x: x, y: y, scale: 0.15, opacity: 0.85 },
        { scale: big ? 3.4 : 2.2, opacity: 0, duration: big ? 0.9 : 0.65, ease: 'power3.out', onComplete: function () { r.remove(); } });
    }
    function spawnSparks(x, y, n) {
      for (var i = 0; i < n; i++) {
        var s = el('div', 'fx-spark');
        var col = FX.palette.colors[i % FX.palette.colors.length];
        s.style.background = col;
        layer.appendChild(s);
        var ang = (Math.PI * 2 * i) / n + FX.rand(-0.4, 0.4), dist = FX.rand(30, 64);
        gsap.fromTo(s, { x: x, y: y, scale: 1, opacity: 1 },
          { x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist, scale: 0, opacity: 0, duration: FX.rand(0.5, 0.8), ease: 'power3.out', onComplete: function () { this.targets()[0].remove(); } });
      }
    }

    var PRESSABLE = 'button, a[href], [role="button"], [role="tab"], summary, select, input[type="submit"], .fx-tilt';
    if (!reduced) {
      doc.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || !e.target.closest) return;
        var t = e.target.closest(PRESSABLE);
        if (!t || t.closest('.fx-sound-toggle')) return;
        var primary = t.classList.contains('fx-magnetic') || t.tagName === 'BUTTON';
        spawnRing(e.clientX, e.clientY, primary);
        if (primary) spawnSparks(e.clientX, e.clientY, 7);
      }, true);

      FX.on('mood', function (d) {
        if (!d.action) return;
        var f = el('div', 'fx-flood');
        f.style.setProperty('--c', FX.rgbString(FX.hexToRgb(d.palette.colors[0])));
        layer.appendChild(f);
        gsap.fromTo(f, { x: lastX, y: lastY, scale: 0.1, opacity: 0.7 },
          { scale: 16, opacity: 0, duration: 1.4, ease: 'power2.out', onComplete: function () { f.remove(); } });
      });
    }

    if (!reduced && fine) {
      var acc = 0, px = null, py = null, trail = [], ti = 0;
      for (var k = 0; k < 16; k++) { var d = el('div', 'fx-trail'); layer.appendChild(d); trail.push(d); gsap.set(d, { opacity: 0 }); }
      doc.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        if (FX.lite) return;
        if (px !== null) acc += Math.hypot(e.clientX - px, e.clientY - py);
        px = e.clientX; py = e.clientY;
        if (acc < 46) return;
        acc = 0;
        var d = trail[ti++ % trail.length];
        var size = FX.rand(3, 6);
        d.style.width = d.style.height = size + 'px';
        d.style.background = FX.palette.colors[ti % FX.palette.colors.length];
        gsap.fromTo(d, { x: px + FX.rand(-6, 6), y: py + FX.rand(-6, 6), scale: 1, opacity: 0.75 },
          { y: py + FX.rand(10, 30), scale: 0, opacity: 0, duration: 0.95, ease: 'power2.out', overwrite: true });
      }, { passive: true });
    }


    /* ======================================================================
       Self-check: if the page cannot keep up, switch to lite mode by itself
       ====================================================================== */
    if (!reduced && !FX.lite && !/[?&]fx=rich\b/.test(global.location.search)) {
      FX.whenOpen(function () {
        var frames = [], last = 0, strikes = 0, running = true;
        function sample(t) {
          if (!running) return;
          if (last && !doc.hidden) {
            var d = t - last;
            if (d < 400) frames.push(d);            // ignore tab switches / long pauses
          }
          last = t;
          if (frames.length > 120) frames.shift();
          global.requestAnimationFrame(sample);
        }
        global.requestAnimationFrame(sample);
        global.setTimeout(function check() {
          if (FX.lite) { running = false; return; }
          if (frames.length >= 60) {
            var slow = frames.filter(function (d) { return d > 30; }).length / frames.length;
            strikes = slow > 0.4 ? strikes + 1 : 0;
            if (strikes >= 3) {                     // about three seconds of struggling in a row
              FX.setLite(true, true);
              running = false;
              return;
            }
          }
          global.setTimeout(check, 1000);
        }, 3500);
      });
    }

    /* ======================================================================
       Marquee of moods (home page)
       ====================================================================== */
    var hero = FX.qs('.home-hero');
    if (hero && !FX.qs('.fx-marquee')) {
      var names = Object.keys(FX.moods);
      var group = names.map(function (n, i) {
        return '<span class="fx-mq-word' + (i % 2 ? ' fx-mq-fill' : '') + '">' + n + '</span><span class="fx-mq-dot">&#10022;</span>';
      }).join('');
      var mq = el('div', 'fx-marquee');
      mq.setAttribute('aria-hidden', 'true');
      var track = el('div', 'fx-mq-track', '<div class="fx-mq-group">' + group + '</div><div class="fx-mq-group">' + group + '</div>');
      mq.appendChild(track);
      hero.parentNode.insertBefore(mq, hero.nextSibling);
      if (!reduced) {
        var loop = gsap.to(track, { xPercent: -50, duration: 46, ease: 'none', repeat: -1 });
        var lastY2 = global.scrollY, dir = 1, speed = 1;
        gsap.ticker.add(function () {
          var dy = global.scrollY - lastY2;
          lastY2 = global.scrollY;
          if (dy !== 0) dir = dy > 0 ? 1 : -1;
          var target = dir * (1 + Math.min(Math.abs(dy) * 0.45, 12));
          speed += (target - speed) * 0.08;
          loop.timeScale(speed);
        });
      }
    }

    /* ======================================================================
       Gliding highlight in the navigation
       ====================================================================== */
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
        if (!a) { gsap.to(pill, { opacity: 0, duration: 0.25 }); return; }
        gsap.to(pill, {
          x: a.offsetLeft, y: a.offsetTop, width: a.offsetWidth, height: a.offsetHeight,
          opacity: 1, duration: instant || reduced ? 0 : 0.55, ease: 'power3.out', overwrite: 'auto'
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

    /* ======================================================================
       Number count-up (Moodometer stats)
       ====================================================================== */
    if (!reduced && 'IntersectionObserver' in global) {
      var io = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          var node = en.target.__fxNum;
          var end = parseInt(node.nodeValue, 10);
          var o = { v: 0 };
          node.nodeValue = '0';
          FX.whenOpen(function () {
            gsap.to(o, { v: end, duration: 1.3, ease: 'power3.out', delay: 0.35,
              onUpdate: function () { node.nodeValue = String(Math.round(o.v)); },
              onComplete: function () { node.nodeValue = String(end); } });
          });
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
