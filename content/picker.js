/**
 * Selektor-Picker: Nutzer klickt ein Element an, die Extension merkt sich einen
 * Selektor dafuer. Notwendig, weil Snapchat gehashte Klassennamen ausliefert
 * und sich das Markup jederzeit aendern kann.
 */
(function () {
  'use strict';

  const SCDC = (window.SCDC = window.SCDC || {});
  const dom = SCDC.dom;
  const picker = (SCDC.picker = {});

  let active = false;
  let overlay = null;
  let resolveFn = null;

  function onMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay) return;
    const r = el.getBoundingClientRect();
    overlay.style.top = `${r.top}px`;
    overlay.style.left = `${r.left}px`;
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
    overlay.dataset.target = dom.cssPath(el);
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    stop();
    if (resolveFn) resolveFn(el ? dom.cssPath(el) : null);
    resolveFn = null;
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      stop();
      if (resolveFn) resolveFn(null);
      resolveFn = null;
    }
  }

  function stop() {
    active = false;
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    if (overlay) overlay.remove();
    overlay = null;
    SCDC.hud.setStatus('Auswahl beendet');
  }

  /** Startet den Picker, liefert den gewaehlten CSS-Pfad (oder null). */
  picker.pick = function (kind) {
    if (active) return Promise.resolve(null);
    active = true;
    overlay = document.createElement('div');
    overlay.className = 'scdc-picker';
    document.body.appendChild(overlay);
    SCDC.hud.show();
    SCDC.hud.setStatus(`Element für "${kind}" anklicken (Esc bricht ab)`);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    return new Promise((resolve) => {
      resolveFn = resolve;
    });
  };
})();
