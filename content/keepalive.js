/**
 * Verhindert, dass Snapchat die Seite als "abwesend"/inaktiv markiert und die
 * Chat-Ansicht sperrt, sobald der Tab den Fokus verliert - was IMMER passiert,
 * wenn das Popup dieser Extension geoeffnet wird oder man in ein anderes
 * Fenster klickt.
 *
 * Muss als EIGENES content_scripts-Bundle mit run_at "document_start" laufen,
 * VOR Snapchats eigenen Skripten:
 *
 *   Wenn `window` selbst das Event-Ziel ist (z. B. bei "blur"), gibt es keine
 *   Capturing-Phase durch Vorfahren - alle auf `window` registrierten Listener
 *   laufen in Registrierungsreihenfolge, unabhaengig vom capture-Flag. Wird
 *   unser Listener VOR Snapchats eigenem registriert (garantiert durch
 *   document_start, das vor jedem Seiten-Skript ausgefuehrt wird), stoppt
 *   unser stopImmediatePropagation() Snapchats Handler zuverlaessig - nicht
 *   nur zufaellig je nach Registrierungsreihenfolge zur Laufzeit.
 *
 * Zusaetzlich werden document.hidden/visibilityState/hasFocus ueberschrieben,
 * falls Snapchat diese direkt abfragt statt nur auf Events zu lauschen.
 */
(function () {
  'use strict';

  const SCDC = (window.SCDC = window.SCDC || {});
  const keepAlive = (SCDC.keepAlive = {});

  function block(e) {
    e.stopImmediatePropagation();
  }

  window.addEventListener('blur', block, true);
  window.addEventListener('pagehide', block, true);
  document.addEventListener('visibilitychange', block, true);
  document.addEventListener('pagehide', block, true);

  try {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  } catch (_) {
    /* falls der Browser das nicht zulaesst - Event-Blockade greift trotzdem */
  }

  try {
    const realHasFocus = document.hasFocus.bind(document);
    document.hasFocus = () => true;
    keepAlive._realHasFocus = realHasFocus;
  } catch (_) {
    /* ignorieren */
  }

  // Leichte, wiederkehrende Aktivitaets-Signale fuer Idle-Timer, die auf
  // Events statt auf Fokuszustand pruefen. Nur waehrend eines Laufs, damit die
  // Seite sonst unangetastet bleibt.
  let pingTimer = null;
  keepAlive.start = function () {
    if (pingTimer) return;
    pingTimer = setInterval(() => {
      const at = { clientX: 2, clientY: 2, bubbles: true, composed: true };
      document.dispatchEvent(new MouseEvent('mousemove', at));
    }, 15000);
  };
  keepAlive.stop = function () {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
  };
})();
