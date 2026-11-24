/* MOODIFY motion layer - interface sounds (Web Audio API, zero dependencies)
 *
 * Every sound is synthesised on the fly, so there are no audio files to load
 * or break. Sounds are deliberately quiet:
 *   click - crisp mechanical tap on buttons, links, tabs
 *   tick  - very light tick when hovering key cards / nav links (rate-limited)
 *   chime - gentle two-note harmonic chime when a mood is chosen
 *   pop   - short rising pop when a form is submitted
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is
 * created on the first click / key press. A Sound On / Mute button is added to
 * the page header; the choice is remembered in localStorage. UI sounds are
 * turned down while a track is playing and the hover tick is skipped.
 */
(function (global) {
  'use strict';
  var FX = global.MoodifyFX;
  if (!FX || !FX.register) return;

  FX.register('sound', function (FX) {
    var doc = document;
    var AC = global.AudioContext || global.webkitAudioContext;
    var KEY = 'moodify.sound';
    var MASTER = 1;

    var enabled = FX.storageGet(KEY) !== 'off';
    var ctx = null, master = null, send = null, noise = null, noiseLong = null;
    var lastPlay = {};
    var lastTick = 0;

    /* ---- audio graph ------------------------------------------------------ */
    function build() {
      master = ctx.createGain();
      master.gain.value = enabled ? MASTER : 0;
      var comp = ctx.createDynamicsCompressor();    // keeps overlapping sounds from clipping
      comp.threshold.value = -10;
      comp.knee.value = 8;
      comp.ratio.value = 3;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      master.connect(comp);
      comp.connect(ctx.destination);

      // a small feedback delay gives the chime some air
      send = ctx.createGain();
      send.gain.value = 0.32;
      var delay = ctx.createDelay(0.5);
      delay.delayTime.value = 0.14;
      var fb = ctx.createGain();
      fb.gain.value = 0.3;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2800;
      send.connect(delay);
      delay.connect(lp);
      lp.connect(fb);
      fb.connect(delay);
      lp.connect(master);

      /* seeded noise: every click sounds identical instead of randomly quiet/loud */
      var seed = 1234567;
      function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; }
      var longLen = Math.floor(ctx.sampleRate * 0.4);
      noiseLong = ctx.createBuffer(1, longLen, ctx.sampleRate);
      var ld = noiseLong.getChannelData(0);
      for (var j = 0; j < longLen; j++) ld[j] = rnd();

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
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return true;
    }

    function trackPlaying() {
      var a = doc.getElementById('audioPlayer');
      return !!(a && !a.paused && !a.ended);
    }
    function level() { return trackPlaying() ? 0.45 : 1; }   // duck under real music

    /* ---- voices ------------------------------------------------------------- */
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

    /* Voices are tuned to be clearly audible on laptop speakers and phones:
     * most of the energy sits between 400 Hz and 4 kHz (small speakers cannot
     * reproduce a low thump). Peaks land around -9 dBFS for a click. */
    function burst(t, centre, q, peak, decay) {
      var n = ctx.createBufferSource();
      n.buffer = noise;
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = centre;
      bp.Q.value = q;
      var g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      n.connect(bp); bp.connect(g); g.connect(master);
      n.start(t); n.stop(t + decay + 0.01);
    }

    var VOICES = {
      click: function (v) {
        var t = ctx.currentTime;
        burst(t, 3200, 0.9, 0.26 * v, 0.03);               // crisp key-cap transient
        tone('triangle', 1650, 560, t, 0.002, 0.055, 0.28 * v);   // plastic "tock"
        tone('sine', 330, 150, t, 0.003, 0.08, 0.21 * v);        // warm body
      },
      swoosh: function (v) {
        var t = ctx.currentTime;
        var n = ctx.createBufferSource();
        n.buffer = noiseLong;
        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 1.3;
        bp.frequency.setValueAtTime(500, t);
        bp.frequency.exponentialRampToValueAtTime(3400, t + 0.3);
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.07);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
        n.connect(bp); bp.connect(g); g.connect(master);
        n.start(t); n.stop(t + 0.4);
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
      chime: function (v, step) {
        // pentatonic steps so every mood sounds different but always consonant
        var ratios = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25];
        var f = 523.25 * ratios[(step || 0) % ratios.length];
        var t = ctx.currentTime;
        tone('sine', f, f, t, 0.006, 1.1, 0.25 * v, true);
        tone('sine', f * 2, f * 2, t, 0.006, 0.7, 0.1 * v, true);
        tone('sine', f * 3, f * 3, t, 0.006, 0.4, 0.05 * v, false);
        tone('sine', f * 1.5, f * 1.5, t + 0.08, 0.006, 0.95, 0.16 * v, true);
        tone('sine', f * 2.5, f * 2.5, t + 0.16, 0.006, 0.8, 0.07 * v, true);
        burst(t, 6000, 2, 0.06 * v, 0.02);                 // tiny sparkle on the attack
      }
    };

    var MIN_GAP = { click: 25, tick: 90, pop: 80, chime: 150, swoosh: 300 };

    function pulse() {
      toggle.classList.remove('fx-live');
      void toggle.offsetWidth;          // restart the CSS animation
      toggle.classList.add('fx-live');
    }

    function play(name, arg) {
      if (!enabled) return;
      var now = global.performance ? global.performance.now() : Date.now();
      if (lastPlay[name] && now - lastPlay[name] < (MIN_GAP[name] || 0)) return;
      if (!ensure()) return;
      lastPlay[name] = now;
      try { VOICES[name](level(), arg); pulse(); } catch (e) { /* audio is optional */ }
    }
    FX.sound = { play: play, state: function () { return ctx ? ctx.state : (AC ? 'not-created' : 'unsupported'); }, enabled: function () { return enabled; } };

    /* ---- toggle button -------------------------------------------------------- */
    var toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.className = 'fx-sound-toggle';
    toggle.setAttribute('aria-label', 'Interface sounds');
    toggle.innerHTML = FX.icons.soundOn + FX.icons.soundOff;

    function paintToggle() {
      toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      toggle.title = enabled ? 'Interface sounds: on (click to mute)' : 'Interface sounds: off (click to turn on)';
    }

    function setEnabled(on) {
      enabled = on;
      FX.storageSet(KEY, on ? 'on' : 'off');
      paintToggle();
      if (on) {
        if (ensure()) {
          master.gain.cancelScheduledValues(ctx.currentTime);
          master.gain.setTargetAtTime(MASTER, ctx.currentTime, 0.02);
        }
        play('chime', 0);
      } else if (ctx && master) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      }
    }
    toggle.addEventListener('click', function () { setEnabled(!enabled); });
    paintToggle();

    function mountToggle() {
      var account = FX.qs('[class$="-account"]');
      if (account) { account.insertBefore(toggle, account.firstChild); return; }

      var header = FX.qs('header');
      if (header && header.children.length >= 2) {
        // login / register / setup: put the toggle beside the right-hand caption
        var last = header.lastElementChild;
        var cluster = doc.createElement('div');
        cluster.className = 'fx-header-cluster';
        header.insertBefore(cluster, last);
        cluster.appendChild(last);
        cluster.appendChild(toggle);
        return;
      }
      var nav = FX.qs('ul.navbar-nav');
      if (nav) {
        var li = doc.createElement('li');
        li.className = 'nav-item d-flex align-items-center';
        li.appendChild(toggle);
        nav.appendChild(li);
        return;
      }
      toggle.classList.add('fx-sound-floating');
      doc.body.appendChild(toggle);
    }
    mountToggle();

    /* Wake the audio engine on the very first click / key press / touch anywhere
     * (browsers only allow audio after a gesture), not only on buttons. */
    var hint = null;
    function hideHint() {
      if (!hint) return;
      var h = hint;
      hint = null;
      h.classList.remove('in');
      global.setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 500);
    }
    function unlock() { if (enabled) ensure(); hideHint(); }
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (type) {
      doc.addEventListener(type, unlock, { capture: true, passive: true, once: true });
    });

    /* One-time hint per browser session so people know sound exists and how it starts. */
    function showHint() {
      if (!AC) return;
      try {
        if (global.sessionStorage.getItem('moodify.hint') === '1') return;
        global.sessionStorage.setItem('moodify.hint', '1');
      } catch (e) { /* private mode: show it anyway */ }
      hint = doc.createElement('div');
      hint.className = 'fx-sound-hint';
      hint.setAttribute('role', 'status');
      hint.innerHTML = (enabled ? FX.icons.soundOn : FX.icons.soundOff) + '<span>' +
        (enabled ? 'Sound is on. Click anywhere to hear it, or tap the speaker button to mute.'
                 : 'Sound is muted. Tap the speaker button to turn it on.') + '</span>';
      doc.body.appendChild(hint);
      global.requestAnimationFrame(function () { if (hint) hint.classList.add('in'); });
      global.setTimeout(hideHint, 7500);
    }
    FX.whenOpen(function () { global.setTimeout(showHint, 700); });

    /* ---- event wiring ------------------------------------------------------------ */
    var CLICKABLE = 'button, a[href], [role="button"], [role="tab"], input[type="submit"], summary, select';

    // pointerdown gives the lowest latency, which is what makes a click feel tactile
    doc.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || !e.target.closest) return;
      var el = e.target.closest(CLICKABLE);
      if (!el || el.disabled || el.closest('.fx-sound-toggle')) return;
      play('click');
    }, true);

    // keyboard activation (Enter / Space) on controls
    doc.addEventListener('keydown', function (e) {
      if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
      var el = e.target && e.target.closest && e.target.closest('button, [role="tab"], a[href]');
      if (!el || el.disabled || el.closest('.fx-sound-toggle')) return;
      play('click');
    }, true);

    // hover tick: mouse only, only after sound is unlocked, never over music
    var HOVER = '.fx-tilt, header nav a, .fx-magnetic, .player-queue-item, .player-mode-tab, .mood-tag, .mood-tile';
    if (FX.flags.finePointer) {
      doc.addEventListener('pointerover', function (e) {
        if (!enabled || !ctx || ctx.state !== 'running' || e.pointerType !== 'mouse') return;
        if (!e.target.closest) return;
        var el = e.target.closest(HOVER);
        if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
        var now = global.performance.now();
        if (now - lastTick < 120) return;                       // global rate limit
        if (el.__fxTick && now - el.__fxTick < 800) return;     // per-element cool-down
        if (trackPlaying()) return;
        el.__fxTick = lastTick = now;
        play('tick');
      }, { passive: true });
    }

    // choosing a mood -> chime (and the ambient layer pulses)
    FX.on('mood', function (d) {
      if (d.action) play('chime', d.palette && d.palette.note);
    });

    // submitting a form -> short pop, unless the page cancelled the submit
    // (for example the "delete playlist" confirmation)
    doc.addEventListener('submit', function (e) {
      if (!e.defaultPrevented) play('pop');
    });
  });
})(window);
