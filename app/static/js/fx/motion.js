/* MOODIFY motion layer - smooth scroll and scroll-driven animation
 *
 *  - Lenis momentum scrolling (mouse wheel / trackpad only; touch devices keep
 *    their native scrolling, and native `position: sticky` keeps working)
 *  - GSAP + ScrollTrigger: staggered fade-and-rise reveals, light parallax
 *  - a thin scroll-progress bar
 *  - small transitions when the player's mode tabs change and when the
 *    Moodometer re-draws after a date-range change
 *
 * Only transform and opacity are animated. With prefers-reduced-motion nothing
 * here runs except the progress bar being hidden by CSS.
 */
(function (global) {
  'use strict';
  var FX = global.MoodifyFX;
  if (!FX || !FX.register) return;

  FX.register('motion', function (FX) {
    var gsap = global.gsap;
    var ST = global.ScrollTrigger;
    if (!gsap || !ST) return;
    gsap.registerPlugin(ST);

    var doc = document;
    var reduced = FX.flags.reducedMotion;
    if (reduced) return;

    /* ---- progress bar ---------------------------------------------------- */
    var bar = doc.createElement('div');
    bar.className = 'fx-progress';
    bar.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(bar);
    var setBar = gsap.quickSetter(bar, 'scaleX');
    ST.create({
      start: 0,
      end: 'max',
      onUpdate: function (self) { setBar(self.progress); }
    });

    /* ---- Lenis smooth scroll ---------------------------------------------- */
    var lenis = null;
    if (FX.flags.hasLenis) {
      lenis = new global.Lenis({
        lerp: 0.1,
        smoothWheel: true,
        wheelMultiplier: 1,
        syncTouch: false      // touch devices keep native momentum scrolling
      });
      lenis.on('scroll', ST.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);

      /* Inner scrollers (chart, nav strips, queue) must keep working natively. */
      FX.qsa('.mo-chart-wrap, [class$="-nav"], .player-queue-list').forEach(function (el) {
        el.setAttribute('data-lenis-prevent', '');
      });
    }

    /* ---- staggered reveals ------------------------------------------------- */
    /* Pages that already ship their own entrance animation are left alone. */
    var hasOwnEntrance = !!FX.qs('.studio-page, .studio-register-page, .setup-page');
    var REVEAL = [
      '.home-welcome-row', '.home-hero', '.home-section-heading', '.home-taste-card',
      '.home-track-card', '.home-mood-panel', '.home-bottom-note', '.home-empty',
      '.library-hero', '.library-filters', '.library-card', '.library-empty',
      '.pl-hero', '.pl-section-title', '.pl-card', '.pl-empty',
      '.pd-back', '.pd-hero', '.pd-section', '.pd-track', '.pd-add-card', '.pd-empty',
      '.mo-hero', '.mo-stat', '.mo-panel', '.mo-note',
      '.rf-hero', '.rf-summary', '.rf-card', '.rf-note', '.rf-empty',
      '.player-back', '.player-shell', '.player-rights', '.fx-marquee'
    ].join(',');

    if (!hasOwnEntrance) {
      var items = FX.qsa(REVEAL).filter(function (el) { return !el.hidden; });
      if (items.length) {
        gsap.set(items, { opacity: 0, y: 28 });
        ST.batch(items, {
          start: 'top 97%',
          once: true,
          batchMax: 8,
          interval: 0.1,
          onEnter: function (batch) {
            FX.whenOpen(function () { gsap.to(batch, {
              opacity: 1,
              y: 0,
              duration: 0.9,
              ease: 'power3.out',
              stagger: 0.09,
              overwrite: 'auto',
              onComplete: function () {
                batch.forEach(function (el) {
                  el.setAttribute('data-fx-revealed', '');
                  el.style.opacity = '';
                  /* Tilt cards keep GSAP's transform; others get CSS :hover back. */
                  if (!el.classList.contains('fx-tilt')) gsap.set(el, { clearProps: 'transform' });
                });
              }
            }); });
          }
        });

        /* Safety net: if scroll triggers never fire, never leave content hidden. */
        global.setTimeout(function () {
          items.forEach(function (el) {
            if (el.hasAttribute('data-fx-revealed')) return;
            var r = el.getBoundingClientRect();
            if (r.top < global.innerHeight && r.bottom > 0 && parseFloat(getComputedStyle(el).opacity) < 0.05) {
              gsap.to(el, { opacity: 1, y: 0, duration: 0.5, overwrite: 'auto' });
            }
          });
        }, 4000);
      }
    }

    /* ---- parallax depth ----------------------------------------------------- */
    function parallax(selector, fromY, toY) {
      FX.qsa(selector).forEach(function (el) {
        /* skip anything that already runs its own CSS animation on transform */
        if (getComputedStyle(el).animationName !== 'none') return;
        gsap.fromTo(el, { y: fromY }, {
          y: toY,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 0.8 }
        });
      });
    }
    parallax('.home-hero-art', -18, 18);
    parallax('.home-sound-bars', -34, 34);
    parallax('.rf-vinyl, .library-vinyl, .pl-art-disc, .pd-disc', -10, 10);

    /* ---- player mode tabs: gentle panel transition -------------------------- */
    var panels = FX.qsa('[data-player-panel]');
    if (panels.length && global.MutationObserver) {
      var panelObserver = new MutationObserver(function (records) {
        records.forEach(function (m) {
          var panel = m.target;
          if (m.oldValue !== null && !panel.hidden) {      // "hidden" was just removed
            gsap.fromTo(panel, { opacity: 0, y: 10 }, {
              opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'opacity,transform'
            });
          }
        });
      });
      panels.forEach(function (p) {
        panelObserver.observe(p, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
      });
    }

    /* ---- Moodometer: animate dots and bars whenever the chart is re-drawn ---- */
    var svg = doc.getElementById('moTimeline');
    var dist = doc.getElementById('moDistribution');
    function animateMoodometer() {
      if (svg) {
        var dots = svg.querySelectorAll('circle');
        if (dots.length) {
          gsap.from(dots, {
            scale: 0, opacity: 0, transformOrigin: '50% 50%',
            duration: 0.55, ease: 'back.out(2.2)', stagger: 0.02, overwrite: 'auto'
          });
        }
      }
      if (dist) {
        var rows = dist.querySelectorAll('.mo-dist-row');
        if (rows.length) gsap.from(rows, { opacity: 0, y: 8, duration: 0.45, ease: 'power2.out', stagger: 0.05, clearProps: 'opacity,transform' });
        var fills = dist.querySelectorAll('.mo-dist-fill');
        if (fills.length) gsap.from(fills, { scaleX: 0, transformOrigin: '0 50%', duration: 0.7, ease: 'power3.out', stagger: 0.05, clearProps: 'transform' });
      }
    }
    if ((svg || dist) && global.MutationObserver) {
      var queued = false;
      var chartObserver = new MutationObserver(function () {
        if (queued) return;
        queued = true;
        global.requestAnimationFrame(function () { queued = false; animateMoodometer(); });
      });
      if (svg) chartObserver.observe(svg, { childList: true });
      if (dist) chartObserver.observe(dist, { childList: true });
      global.setTimeout(animateMoodometer, 350);   // the first draw
    }

    /* Heights change once the web font and images settle. */
    function refresh() { ST.refresh(); }
    global.addEventListener('load', refresh);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(refresh);
    global.addEventListener('pageshow', function (e) { if (e.persisted) refresh(); });

    FX.motion = { lenis: lenis, refresh: refresh };
  });
})(window);
