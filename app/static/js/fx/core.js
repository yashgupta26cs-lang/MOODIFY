/* MOODIFY motion layer - core
 * Shared state for the other fx/*.js files: feature flags, mood palettes, a tiny
 * event bus and a module runner that isolates failures (one broken module can
 * never stop the page or the other modules).
 *
 * Kill switch: open any page with ?fx=off (or run localStorage.setItem(
 * "moodify.fx", "off") in the console) to load the app with no motion layer.
 */
(function (global) {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var FX = (global.MoodifyFX = global.MoodifyFX || {});

  function storageGet(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }
  FX.storageGet = storageGet;
  FX.storageSet = storageSet;

  var killed = /[?&]fx=off\b/.test(global.location.search) || storageGet('moodify.fx') === 'off';
  if (killed) { root.classList.add('fx-off'); return; }

  /* ---- feature flags ---------------------------------------------------- */
  var mq = function (q) { return !!(global.matchMedia && global.matchMedia(q).matches); };
  FX.flags = {
    reducedMotion: mq('(prefers-reduced-motion: reduce)'),
    finePointer: mq('(hover: hover) and (pointer: fine)'),
    smallScreen: mq('(max-width: 700px)'),
    hasGsap: typeof global.gsap !== 'undefined',
    hasScrollTrigger: typeof global.ScrollTrigger !== 'undefined',
    hasLenis: typeof global.Lenis !== 'undefined'
  };

  /* ---- tiny helpers ------------------------------------------------------ */
  FX.qs = function (sel, ctx) { return (ctx || doc).querySelector(sel); };
  FX.qsa = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };
  FX.rand = function (min, max) { return min + Math.random() * (max - min); };
  FX.clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
  FX.hexToRgb = function (hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  };
  FX.rgbString = function (rgb) { return 'rgb(' + Math.round(rgb[0]) + ',' + Math.round(rgb[1]) + ',' + Math.round(rgb[2]) + ')'; };

  /* ---- event bus (DOM CustomEvents on document) -------------------------- */
  FX.emit = function (name, detail) {
    doc.dispatchEvent(new CustomEvent('fx:' + name, { detail: detail || {} }));
  };
  FX.on = function (name, fn) {
    doc.addEventListener('fx:' + name, function (e) { fn(e.detail, e); });
  };

  /* ---- mood palettes ------------------------------------------------------
   * Soft, desaturated tones that sit comfortably on the navy background.
   * `speed` scales how fast the ambient layer drifts. `note` picks a pentatonic
   * step for the selection chime. */
  var NEUTRAL = { colors: ['#83e8c7', '#3f8f8a', '#3a5f7d'], speed: 1, note: 0 };
  FX.moods = {
    Happy:        { colors: ['#f0c978', '#f0a98f', '#83e8c7'], speed: 1.2,  note: 4 },
    Relaxed:      { colors: ['#83e8c7', '#7fc9d6', '#a8d8b9'], speed: 0.75, note: 1 },
    Calm:         { colors: ['#83cbd8', '#6fb5c9', '#83e8c7'], speed: 0.65, note: 0 },
    Energetic:    { colors: ['#f29d72', '#e98a8a', '#f0c978'], speed: 1.5,  note: 5 },
    Romantic:     { colors: ['#e99bbd', '#c79ae0', '#f0b3a1'], speed: 0.9,  note: 3 },
    Sad:          { colors: ['#91a5d9', '#7589c4', '#6aa6c4'], speed: 0.55, note: 2 },
    Motivational: { colors: ['#c5a0ed', '#8fa0f0', '#83e8c7'], speed: 1.3,  note: 6 },
    Focused:      { colors: ['#a7c48a', '#83e8c7', '#7fb6c4'], speed: 0.8,  note: 1 },
    Nostalgic:    { colors: ['#d5b28a', '#c99a7d', '#9fb8a8'], speed: 0.7,  note: 2 },
    Adventurous:  { colors: ['#8cc5a0', '#e0b66c', '#6fb5c9'], speed: 1.25, note: 4 },
    Reflective:   { colors: ['#8d9bd0', '#6f86b8', '#83cbd8'], speed: 0.6,  note: 2 }
  };
  FX.neutralMood = NEUTRAL;

  FX.baseMood = '';
  FX.mood = '';
  FX.palette = NEUTRAL;

  /* setMood(name, {preview, action}) - preview = temporary (hover), action = the
   * user chose it (plays the chime). Unknown or empty names use the neutral look. */
  FX.setMood = function (name, opts) {
    opts = opts || {};
    var key = FX.moods[name] ? name : '';
    var palette = key ? FX.moods[key] : NEUTRAL;
    if (!opts.preview) FX.baseMood = key;
    FX.mood = key;
    FX.palette = palette;
    var rgb = FX.hexToRgb(palette.colors[0]);
    root.style.setProperty('--fx-accent', palette.colors[0]);
    root.style.setProperty('--fx-accent-rgb', rgb.join(', '));
    root.setAttribute('data-fx-mood', key || 'neutral');
    FX.emit('mood', { mood: key, palette: palette, preview: !!opts.preview, action: !!opts.action });
  };
  FX.endPreview = function () { FX.setMood(FX.baseMood, { preview: false }); };

  /* A mood <select> anywhere on the site drives the ambient layer. */
  var MOOD_SELECT = 'select[name="mood"], select[name="preferred_mood"]';
  doc.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches(MOOD_SELECT) && t.value) {
      FX.setMood(t.value, { action: true });
    }
  });

  /* ---- module runner ------------------------------------------------------ */
  var modules = [];
  FX.register = function (name, fn) { modules.push({ name: name, fn: fn }); };

  FX.start = function () {
    var initial = '';
    var select = FX.qs(MOOD_SELECT);
    if (select && select.value) initial = select.value;
    else if (doc.body && doc.body.dataset.mood) initial = doc.body.dataset.mood;
    FX.baseMood = FX.moods[initial] ? initial : '';
    FX.mood = FX.baseMood;
    FX.palette = FX.moods[FX.baseMood] || NEUTRAL;
    root.style.setProperty('--fx-accent', FX.palette.colors[0]);
    root.style.setProperty('--fx-accent-rgb', FX.hexToRgb(FX.palette.colors[0]).join(', '));
    root.setAttribute('data-fx-mood', FX.baseMood || 'neutral');

    modules.forEach(function (m) {
      try { m.fn(FX); } catch (err) {
        if (global.console) console.warn('[MoodifyFX] module "' + m.name + '" failed:', err);
      }
    });
    root.classList.add('fx-ready');
  };

  /* Scripts are loaded with `defer`, so they all run (in order) while the
   * document is still "interactive" and before DOMContentLoaded fires. Starting
   * on DOMContentLoaded therefore guarantees every module has registered. */
  if (doc.readyState === 'complete') global.setTimeout(FX.start, 0);
  else doc.addEventListener('DOMContentLoaded', FX.start);
})(window);
