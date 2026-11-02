/**
 * HUD: kleines Overlay auf der Seite mit Live-Status und Not-Aus.
 * Wichtig, weil das Popup beim Wegklicken zerstoert wird - der Lauf laeuft
 * aber im Content-Script weiter.
 */
(function () {
  'use strict';

  const SCDC = (window.SCDC = window.SCDC || {});
  const hud = (SCDC.hud = {});

  let root = null;
  let statusEl = null;
  let logEl = null;
  let lastHighlight = null;

  function build() {
    if (root && root.isConnected) return;
    root = document.createElement('div');
    root.className = 'scdc-hud';
    root.innerHTML = `
      <div class="scdc-hud__bar">
        <span class="scdc-hud__dot"></span>
        <strong class="scdc-hud__title">Daten-Bereiniger</strong>
        <button class="scdc-hud__stop" type="button">Stopp (Esc)</button>
      </div>
      <div class="scdc-hud__status">Bereit</div>
      <div class="scdc-hud__log"></div>
    `;
    document.body.appendChild(root);
    statusEl = root.querySelector('.scdc-hud__status');
    logEl = root.querySelector('.scdc-hud__log');
    root.querySelector('.scdc-hud__stop').addEventListener('click', () => {
      SCDC.abort('Manuell gestoppt');
    });
  }

  hud.show = function () {
    build();
    root.classList.add('scdc-hud--visible');
  };

  hud.hide = function () {
    if (root) root.classList.remove('scdc-hud--visible');
    hud.clearHighlight();
  };

  hud.setStatus = function (text) {
    build();
    SCDC.state.status = text;
    if (statusEl) statusEl.textContent = text;
  };

  hud.log = function (text) {
    build();
    if (!logEl) return;
    const line = document.createElement('div');
    line.textContent = text;
    logEl.appendChild(line);
    while (logEl.childElementCount > 6) logEl.removeChild(logEl.firstChild);
  };

  hud.highlight = function (el) {
    hud.clearHighlight();
    if (!el || !el.isConnected) return;
    el.classList.add('scdc-active');
    lastHighlight = el;
  };

  hud.clearHighlight = function () {
    if (lastHighlight && lastHighlight.isConnected) lastHighlight.classList.remove('scdc-active');
    lastHighlight = null;
  };

  /** Testlauf-Markierungen wieder entfernen. */
  hud.clearMarks = function () {
    for (const el of document.querySelectorAll('.scdc-marked')) el.classList.remove('scdc-marked');
    for (const el of document.querySelectorAll('[data-scdc-done]')) delete el.dataset.scdcDone;
  };
})();
