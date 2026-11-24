/* MOODIFY motion layer - interface sounds (Web Audio API, zero dependencies)
 *
 * Every sound is synthesised on the fly, so there are no audio files to load
 * or break. Sounds are deliberately quiet:
 *   click - soft mechanical tap on buttons, links, tabs
 *   tick  - ultra-quiet tick when hovering key cards / nav links (rate-limited)
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
    var MASTER = 0.9;

    var enabled = FX.storageGet(KEY) !== 'off';
    var ctx = null, master = null, send = null, noise = null;
    var lastPlay = {};
    var lastTick = 0;

    /* ---- audio graph ------------------------------------------------------ */
    function build() {
      master = ctx.createGain();
      master.gain.value = enabled ? MASTER : 0;
      var comp = ctx.createDynamicsCompressor();    // keeps overlapping sounds from clipping
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

      var len = Math.floor(ctx.sampleRate * 0.05);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = noise.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
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
    function level() { return trackPlaying() ? 0.5 : 1; }   // duck under real music

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

    var VOICES = {
      click: function (v) {
        var t = ctx.currentTime;
        tone('sine', 190, 70, t, 0.004, 0.06, 0.3 * v);
        var n = ctx.createBufferSource();
        n.buffer = noise;
        var hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2200;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.2 * v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
        n.connect(hp); hp.connect(g); g.connect(master);
        n.start(t); n.stop(t + 0.04);
      },
      tick: function (v) {
        tone('triangle', 2500, 2050, ctx.currentTime, 0.002, 0.014, 0.05 * v);
      },
      pop: function (v) {
        tone('sine', 520, 900, ctx.currentTime, 0.005, 0.1, 0.16 * v);
      },
      chime: function (v, step) {
        // pentatonic steps so every mood sounds different but always consonant
        var ratios = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25];
        var f = 523.25 * ratios[(step || 0) % ratios.length];
        var t = ctx.currentTime;
        tone('sine', f, f, t, 0.006, 0.9, 0.1 * v, true);
        tone('sine', f * 2, f * 2, t, 0.006, 0.55, 0.035 * v, true);
        tone('sine', f * 3, f * 3, t, 0.006, 0.3, 0.012 * v, false);
        tone('sine', f * 1.5, f * 1.5, t + 0.07, 0.006, 0.8, 0.065 * v, true);
      }
    };

    var MIN_GAP = { click: 25, tick: 110, pop: 80, chime: 150 };

    function play(name, arg) {
      if (!enabled) return;
      var now = global.performance ? global.performance.now() : Date.now();
      if (lastPlay[name] && now - lastPlay[name] < (MIN_GAP[name] || 0)) return;
      if (!ensure()) return;
      lastPlay[name] = now;
      try { VOICES[name](level(), arg); } catch (e) { /* audio is optional */ }
    }
    FX.sound = { play: play };

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
    var HOVER = '.fx-tilt, header nav a, .player-queue-item, .player-mode-tab, .mood-tag';
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
