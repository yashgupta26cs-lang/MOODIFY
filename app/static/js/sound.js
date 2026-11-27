/* MOODIFY interface sounds - one global Sound Manager (Web Audio API, zero dependencies)
 *
 * Every sound is synthesised on the fly, so there are no audio files to load or
 * break. This file is loaded on every page and listens once, at the document
 * level, so it works everywhere and keeps working after the app swaps in a new
 * page without a reload.
 *
 *   click - soft, crisp tap: buttons, links, sidebar items, mood cards, playlist
 *           and track cards, player controls
 *   pop   - small confirmation when a favourite is added or a track is saved
 *   chime - gentle two-note chime: playlist created, form saved, signed in
 *   tick  - very light tick (favourite removed, something dismissed)
 *   error - short low double-blip when something did not work
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is
 * created (and resumed) on the very first pointer, touch or key press.
 * The Sound On / Mute button in the top bar (#soundToggle) is wired here and
 * the choice is kept in localStorage ("moodify.sound"), so it survives reloads
 * and every page. Nothing here changes how the music player works; UI sounds
 * are turned down while a track is playing.
 */
(function (global) {
  'use strict';
  if (global.MoodifySound) return;

  var doc = document;
  var AC = global.AudioContext || global.webkitAudioContext;
  var KEY = 'moodify.sound';

  function get() { try { return global.localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { global.localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } }

  var enabled = get() !== 'off';
  var ctx = null, master = null, send = null, noise = null;
  var last = {};

  /* ---- audio graph ---------------------------------------------------------- */
  function build() {
    master = ctx.createGain();
    master.gain.value = enabled ? 1 : 0;
    var comp = ctx.createDynamicsCompressor();          // overlapping sounds never clip
    comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 3;
    comp.attack.value = 0.002; comp.release.value = 0.12;
    master.connect(comp);
    comp.connect(ctx.destination);

    // a small feedback delay gives the chime some air
    send = ctx.createGain();
    send.gain.value = 0.32;
    var delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.14;
    var fb = ctx.createGain(); fb.gain.value = 0.3;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
    send.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(master);

    // seeded noise: every click sounds the same instead of randomly quiet or loud
    var seed = 1234567;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; }
    var len = Math.floor(ctx.sampleRate * 0.05);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noise.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = rnd();
  }

  function ensure() {
    if (!AC) return false;
    if (!ctx) {
      try { ctx = new AC(); build(); } catch (e) { ctx = null; return false; }
    }
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) { /* retry on next gesture */ } }
    return true;
  }

  function musicPlaying() {
    var a = doc.getElementById('audioPlayer');
    return !!(a && !a.paused && !a.ended);
  }
  function level() { return musicPlaying() ? 0.6 : 1; }       // sit under real music

  /* ---- voices -------------------------------------------------------------------- */
  function tone(type, f0, f1, t, attack, decay, peak, wet) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g);
    g.connect(master);
    if (wet) g.connect(send);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }
  function burst(t, centre, q, peak, decay) {
    var n = ctx.createBufferSource();
    n.buffer = noise;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = centre; bp.Q.value = q;
    var g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    n.connect(bp); bp.connect(g); g.connect(master);
    n.start(t); n.stop(t + decay + 0.01);
  }

  // Tuned for laptop speakers and phones: most energy sits between 400 Hz and 4 kHz.
  var VOICES = {
    click: function (v) {
      var t = ctx.currentTime;
      burst(t, 3200, 0.9, 0.26 * v, 0.03);                        // crisp key-cap transient
      tone('triangle', 1650, 560, t, 0.002, 0.055, 0.28 * v);     // plastic "tock"
      tone('sine', 330, 150, t, 0.003, 0.08, 0.21 * v);           // warm body
    },
    tick: function (v) {
      var t = ctx.currentTime;
      tone('triangle', 2900, 2300, t, 0.002, 0.026, 0.11 * v);
      tone('sine', 1450, 1200, t, 0.002, 0.03, 0.05 * v);
      burst(t, 5200, 1.5, 0.05 * v, 0.014);
    },
    pop: function (v) {
      var t = ctx.currentTime;
      tone('sine', 420, 980, t, 0.004, 0.13, 0.3 * v);
      tone('triangle', 840, 1960, t, 0.004, 0.09, 0.1 * v);
      burst(t, 4200, 1.2, 0.12 * v, 0.02);
    },
    chime: function (v) {
      var f = 659.25;                                              // E5, then a fifth above
      var t = ctx.currentTime;
      tone('sine', f, f, t, 0.006, 0.9, 0.24 * v, true);
      tone('sine', f * 2, f * 2, t, 0.006, 0.6, 0.09 * v, true);
      tone('sine', f * 1.5, f * 1.5, t + 0.09, 0.006, 0.85, 0.16 * v, true);
      tone('sine', f * 3, f * 3, t + 0.09, 0.006, 0.4, 0.04 * v, false);
      burst(t, 6000, 2, 0.05 * v, 0.02);
    },
    error: function (v) {
      var t = ctx.currentTime;
      tone('triangle', 300, 220, t, 0.004, 0.09, 0.22 * v);
      tone('triangle', 260, 190, t + 0.11, 0.004, 0.12, 0.2 * v);
    }
  };
  var MIN_GAP = { click: 25, tick: 60, pop: 80, chime: 150, error: 150 };

  function play(name) {
    if (!enabled || !VOICES[name]) return false;
    var now = global.performance ? global.performance.now() : Date.now();
    if (last[name] && now - last[name] < (MIN_GAP[name] || 0)) return false;
    if (!ensure()) return false;
    last[name] = now;
    try { VOICES[name](level()); pulse(); return true; } catch (e) { return false; }   // audio is optional
  }

  /* ---- Sound On / Mute button (top bar) ------------------------------------------------- */
  function toggleButton() { return doc.getElementById('soundToggle'); }
  function paint() {
    var b = toggleButton();
    if (!b) return;
    b.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    b.setAttribute('aria-label', enabled ? 'Sound effects on. Press to mute' : 'Sound effects muted. Press to turn on');
    b.title = enabled ? 'Sound effects: on (click to mute)' : 'Sound effects: muted (click to turn on)';
  }
  function pulse() {
    var b = toggleButton();
    if (!b || !enabled) return;
    b.classList.remove('live'); void b.offsetWidth; b.classList.add('live');
  }
  function setEnabled(on) {
    enabled = !!on;
    set(enabled ? 'on' : 'off');
    paint();
    if (enabled) {
      if (ensure()) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(1, ctx.currentTime, 0.02); }
      play('chime');
    } else if (ctx && master) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    }
  }

  /* ---- global wiring: one set of listeners for the whole app --------------------------- */
  // 1. unlock the AudioContext on the first gesture (autoplay policy)
  function unlock() {
    ensure();
    if (ctx && ctx.state === 'running') {
      ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(function (n) { doc.removeEventListener(n, unlock, true); });
    }
  }
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(function (n) { doc.addEventListener(n, unlock, true); });

  // 2. a soft click on everything you can press
  var PRESSABLE = 'a[href], button, summary, [role="button"], [role="radio"], [role="tab"], input[type="submit"], input[type="button"], input[type="checkbox"], .auth-form input:not([type="hidden"]), .dash-cover, .dash-mood';
  doc.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var tog = t.closest('#soundToggle');
    if (tog) { setEnabled(!enabled); return; }
    var el = t.closest(PRESSABLE);
    if (!el || el.disabled || el.hasAttribute('data-nosound') || el.closest('[data-nosound]')) return;
    if (el.getAttribute('aria-disabled') === 'true') return;
    var kind = el.getAttribute('data-sfx') || 'click';
    if (kind === 'none') return;
    play(VOICES[kind] ? kind : 'click');
  }, true);

  paint();
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', paint);

  global.MoodifySound = {
    play: play,
    sync: paint,
    enabled: function () { return enabled; },
    setEnabled: setEnabled,
    state: function () { return ctx ? ctx.state : (AC ? 'not-created' : 'unsupported'); }
  };
})(window);
