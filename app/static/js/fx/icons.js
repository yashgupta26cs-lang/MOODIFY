/* MOODIFY motion layer - small inline SVG graphics
 *
 * Icons for the sound toggle and search button, a tiny waveform ornament for
 * section kickers, and line illustrations for empty states. All are drawn with
 * currentColor so they follow the mood accent. Nothing here changes page
 * structure: the artwork is added next to existing text, and the original text
 * stays in place for screen readers.
 */
(function (global) {
  'use strict';
  var FX = global.MoodifyFX;
  if (!FX || !FX.register) return;

  var STROKE = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

  var icons = FX.icons = {
    soundOn:
      '<svg class="fx-ico-on" viewBox="0 0 24 24" ' + STROKE + ' aria-hidden="true">' +
      '<path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4z" fill="currentColor" fill-opacity=".2"/>' +
      '<path d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path d="M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/></svg>',
    soundOff:
      '<svg class="fx-ico-off" viewBox="0 0 24 24" ' + STROKE + ' aria-hidden="true">' +
      '<path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4z" fill="currentColor" fill-opacity=".12"/>' +
      '<path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    search:
      '<svg class="fx-btn-ico" viewBox="0 0 24 24" ' + STROKE + ' aria-hidden="true">' +
      '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>',
    wave:
      '<svg class="fx-wave-ico" viewBox="0 0 18 12" aria-hidden="true"><g fill="currentColor">' +
      '<rect x="1" y="4" width="2" height="4" rx="1"/><rect x="5" y="1" width="2" height="10" rx="1"/>' +
      '<rect x="9" y="3" width="2" height="6" rx="1"/><rect x="13" y="0" width="2" height="12" rx="1"/></g></svg>',

    /* ---- empty-state illustrations (viewBox 132 x 96) ---- */
    emptyPlaylist:
      '<svg class="fx-empty-art" viewBox="0 0 132 96" ' + STROKE + ' aria-hidden="true">' +
      '<rect class="fx-soft" x="24" y="12" width="88" height="56" rx="10"/>' +
      '<rect x="14" y="24" width="88" height="56" rx="10" fill="currentColor" fill-opacity=".06"/>' +
      '<circle cx="44" cy="52" r="15"/><circle cx="44" cy="52" r="4.5" fill="currentColor" fill-opacity=".55" stroke="none"/>' +
      '<path class="fx-soft" d="M68 44h22M68 54h16M68 64h9"/>' +
      '<circle cx="104" cy="74" r="12" fill="#0a1821"/><path d="M104 68v12M98 74h12"/></svg>',
    emptyTrack:
      '<svg class="fx-empty-art" viewBox="0 0 132 96" ' + STROKE + ' aria-hidden="true">' +
      '<rect x="30" y="14" width="72" height="68" rx="14" fill="currentColor" fill-opacity=".06"/>' +
      '<path d="M76 30v28.5a8 8 0 1 1-4-6.9V36.5l-18 4.5v22a8 8 0 1 1-4-6.9V37l26-7z" fill="currentColor" fill-opacity=".14"/>' +
      '<path class="fx-soft" d="M16 30l3 6M12 54h7M20 74l4-5M114 24l-3 6M118 52h-7M112 72l-4-5"/></svg>',
    emptyMood:
      '<svg class="fx-empty-art" viewBox="0 0 132 96" ' + STROKE + ' aria-hidden="true">' +
      '<path class="fx-soft" d="M18 18v60h96"/>' +
      '<path d="M26 62c12-26 22 6 34-12s20-14 30-26 16 8 22-2" />' +
      '<circle cx="26" cy="62" r="3.4" fill="currentColor" stroke="none"/><circle cx="60" cy="50" r="3.4" fill="currentColor" fill-opacity=".6" stroke="none"/>' +
      '<circle cx="90" cy="24" r="3.4" fill="currentColor" fill-opacity=".6" stroke="none"/><circle cx="112" cy="22" r="3.4" fill="currentColor" fill-opacity=".35" stroke="none"/></svg>',
    emptySearch:
      '<svg class="fx-empty-art" viewBox="0 0 132 96" ' + STROKE + ' aria-hidden="true">' +
      '<circle cx="58" cy="44" r="26" fill="currentColor" fill-opacity=".06"/><path d="M78 64l22 22"/>' +
      '<path class="fx-soft" d="M44 38h28M44 48h18"/><path d="M96 14l2.6 5.4L104 22l-5.4 2.6L96 30l-2.6-5.4L88 22l5.4-2.6z" fill="currentColor" fill-opacity=".5" stroke="none"/></svg>'
  };

  FX.register('icons', function (FX) {
    var doc = document;

    /* search button glyph -> SVG (aria-label stays on the button) */
    FX.qsa('.home-search button').forEach(function (b) { b.innerHTML = icons.search; });

    /* waveform ornament before each section kicker */
    FX.qsa('.home-eyebrow, .library-kicker, .pl-kicker, .pd-kicker, .rf-kicker, .mo-kicker, .player-kicker')
      .forEach(function (k) { k.insertAdjacentHTML('afterbegin', icons.wave); });

    /* empty-state artwork */
    var EMPTY = [
      ['.pl-empty', icons.emptyPlaylist],
      ['.pd-empty', icons.emptyTrack],
      ['.home-empty', icons.emptyTrack],
      ['.rf-empty', icons.emptyTrack],
      ['.library-empty', icons.emptySearch],
      ['.mo-empty', icons.emptyMood]
    ];
    EMPTY.forEach(function (pair) {
      FX.qsa(pair[0]).forEach(function (el) {
        if (el.querySelector('.fx-empty-art')) return;
        el.insertAdjacentHTML('afterbegin', pair[1]);
        el.classList.add('fx-has-art');
      });
    });
  });
})(window);
