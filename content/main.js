/**
 * Steuerung im Content-Script: haelt den Zustand, nimmt Befehle aus dem Popup
 * entgegen und faehrt Scan- bzw. Loeschlaeufe.
 *
 * Der Zustand lebt hier (nicht im Popup), damit ein Lauf weiterlaeuft, wenn das
 * Popup geschlossen wird. Er wird zusaetzlich in chrome.storage.local
 * gespiegelt, damit das Popup beim Wiederoeffnen den Fortschritt sieht.
 */
(function () {
  'use strict';

  const SCDC = (window.SCDC = window.SCDC || {});
  const dom = SCDC.dom;

  SCDC.state = {
    phase: 'idle', // idle | scanning | scanned | deleting | done | error
    status: 'Bereit',
    abort: false,
    scan: null,
    progress: { deleted: 0, failed: 0 },
    lastRun: null,
    error: null
  };

  SCDC.persist = function () {
    try {
      chrome.storage.local.set({ scdcState: JSON.parse(JSON.stringify(SCDC.state)) });
    } catch (_) {
      /* Extension-Kontext evtl. invalidiert - egal */
    }
  };

  SCDC.abort = function (reason) {
    SCDC.state.abort = true;
    SCDC.hud.setStatus(reason || 'Abgebrochen');
    SCDC.hud.log('Abbruch angefordert');
    SCDC.persist();
  };

  document.addEventListener(
    'keydown',
    (e) => {
      // `isTrusted` unterscheidet echte Tastendruecke von synthetischen.
      // Ohne diese Pruefung stoppt der Lauf sich selbst: deleter.closeMenu()
      // und confirmDialog() senden Escape, um ein Menue zu schliessen - das
      // landete hier und galt als "Nutzer hat abgebrochen".
      if (!e.isTrusted) return;
      if (e.key === 'Escape' && (SCDC.state.phase === 'scanning' || SCDC.state.phase === 'deleting')) {
        SCDC.abort('Mit Esc gestoppt');
      }
    },
    true
  );

  async function loadSettings() {
    const stored = await chrome.storage.local.get('scdcSettings');
    return SCDC.applySettings(stored.scdcSettings || {});
  }

  /** Chats aus der linken Spalte (fuer scope: 'all'). */
  function findChatItems() {
    const list = dom.queryFirst(document, SCDC.activeSelectors.chatList);
    const root = list || document.body;
    const { elements } = dom.queryAllFirstMatching(root, SCDC.activeSelectors.chatListItem);
    // Nur Eintraege mit Text und plausibler Hoehe.
    return elements.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 36 && r.height < 160 && dom.textOf(el).length > 0;
    });
  }

  async function openChat(el) {
    await dom.click(el);
    // Absendernamen aus dem vorigen Chat gelten hier nicht mehr.
    SCDC.scanner.resetSenders();
    await dom.sleep(SCDC.timing.afterMenuClick + 500);
  }

  async function doScan(payload) {
    await loadSettings();
    // Was ueber Absender gelernt wurde, gilt nur fuer den geoeffneten Chat.
    SCDC.scanner.resetSenders();
    SCDC.state.abort = false;
    SCDC.state.phase = 'scanning';
    SCDC.state.error = null;
    SCDC.hud.show();
    SCDC.hud.setStatus('Analyse läuft …');
    SCDC.persist();
    SCDC.keepAlive.start();

    try {
      const scope = payload.scope || SCDC.settings.scope;
      let result;

      if (scope === 'all') {
        const chats = findChatItems();
        if (!chats.length) throw new Error('Keine Chatliste gefunden.');
        const totals = {};
        const ownTotals = {};
        const records = [];
        let total = 0;
        let visited = 0;

        for (const chat of chats) {
          if (SCDC.state.abort) break;
          const name = dom.textOf(chat).slice(0, 30);
          SCDC.hud.setStatus(`Analysiere Chat ${visited + 1}/${chats.length}: ${name}`);
          await openChat(chat);
          const r = await SCDC.scanner.scanConversation({ loadHistory: payload.loadHistory !== false });
          if (r.ok) {
            total += r.total;
            for (const id of SCDC.TYPE_ORDER) {
              totals[id] = (totals[id] || 0) + (r.counts[id] || 0);
              ownTotals[id] = (ownTotals[id] || 0) + (r.own[id] || 0);
            }
            records.push(...r.records);
          }
          visited++;
        }
        result = { ok: true, total, counts: totals, own: ownTotals, records, chats: visited };
      } else {
        result = await SCDC.scanner.scanConversation({ loadHistory: payload.loadHistory !== false });
        result.chats = 1;
      }

      if (!result.ok) throw new Error(result.error || 'Analyse fehlgeschlagen.');

      SCDC.state.scan = result;
      SCDC.state.phase = 'scanned';
      SCDC.hud.setStatus(`Analyse fertig: ${result.total} Nachrichten`);
      SCDC.persist();
      return { ok: true, scan: result };
    } catch (err) {
      SCDC.state.phase = 'error';
      SCDC.state.error = String(err.message || err);
      SCDC.hud.setStatus(`Fehler: ${SCDC.state.error}`);
      SCDC.persist();
      return { ok: false, error: SCDC.state.error };
    } finally {
      SCDC.keepAlive.stop();
    }
  }

  async function doDelete(payload) {
    await loadSettings();
    SCDC.scanner.resetSenders();
    SCDC.state.abort = false;
    SCDC.state.phase = 'deleting';
    SCDC.state.progress = { deleted: 0, failed: 0 };
    SCDC.state.error = null;
    SCDC.hud.show();
    SCDC.hud.clearMarks();
    SCDC.persist();
    SCDC.keepAlive.start();

    const config = {
      types: payload.types || [],
      onlyOwn: payload.onlyOwn !== false,
      dryRun: !!payload.dryRun,
      maxDeletions: Number(payload.maxDeletions || 0)
    };

    try {
      if (!config.types.length) throw new Error('Kein Datentyp ausgewählt.');

      let deleted = 0;
      let failed = 0;
      let unsaved = 0; // Teilmenge von `deleted`: nur entspeichert, nicht geloescht
      const reasons = Object.create(null); // Grund -> Anzahl, fuer die Abschlussmeldung
      let blockedError = null;

      const mergeReasons = (r) => {
        for (const [k, v] of Object.entries(r.reasons || {})) reasons[k] = (reasons[k] || 0) + v;
      };
      const scope = payload.scope || SCDC.settings.scope;

      if (scope === 'all') {
        const chats = findChatItems();
        if (!chats.length) throw new Error('Keine Chatliste gefunden.');
        let idx = 0;
        for (const chat of chats) {
          if (SCDC.state.abort) break;
          idx++;
          SCDC.hud.setStatus(`Chat ${idx}/${chats.length} wird bereinigt …`);
          await openChat(chat);
          const container = dom.findConversation();
          if (container) await SCDC.scanner.loadFullHistory(container);
          const r = await SCDC.deleter.runOnConversation(config);
          deleted += r.deleted;
          failed += r.failed;
          unsaved += r.unsaved || 0;
          mergeReasons(r);
          SCDC.state.progress = { deleted, failed };
          SCDC.persist();
          if (r.blocked) {
            blockedError = r.error;
            break;
          }
        }
      } else {
        const r = await SCDC.deleter.runOnConversation(config);
        deleted = r.deleted;
        failed = r.failed;
        unsaved = r.unsaved || 0;
        mergeReasons(r);
        if (r.blocked || r.nothingMatched) blockedError = r.error;
      }

      SCDC.state.progress = { deleted, failed };

      if (blockedError) {
        SCDC.state.phase = 'error';
        SCDC.state.error = blockedError;
        SCDC.hud.setStatus(`Blockiert: ${blockedError}`);
        SCDC.persist();
        return { ok: false, error: blockedError, deleted, failed, unsaved, reasons };
      }

      SCDC.state.phase = 'done';
      SCDC.state.lastRun = {
        deleted,
        failed,
        unsaved,
        reasons,
        dryRun: config.dryRun,
        types: config.types,
        aborted: SCDC.state.abort
      };
      const verb = config.dryRun ? 'markiert' : 'erledigt';
      // "gelöscht" waere gelogen, wenn nur entspeichert wurde - bei fremden
      // Nachrichten laesst Snapchat nichts anderes zu.
      const detail = !config.dryRun && unsaved ? ` (davon ${unsaved} nur entspeichert)` : '';
      SCDC.hud.setStatus(`Fertig: ${deleted} ${verb}${detail}, ${failed} übersprungen`);
      SCDC.hud.clearHighlight();
      SCDC.persist();
      return { ok: true, deleted, failed, unsaved, reasons, aborted: SCDC.state.abort };
    } catch (err) {
      SCDC.state.phase = 'error';
      SCDC.state.error = String(err.message || err);
      SCDC.hud.setStatus(`Fehler: ${SCDC.state.error}`);
      SCDC.persist();
      return { ok: false, error: SCDC.state.error };
    } finally {
      SCDC.keepAlive.stop();
    }
  }

  /**
   * Read-only Inspektion fuer den Fall, dass Erkennung oder Loeschen nicht
   * funktionieren. Loescht nichts, oeffnet hoechstens testweise ein Menue und
   * schliesst es wieder. Ergebnis geht als Konsolenausgabe an die Seite,
   * damit man Details direkt in den DevTools nachsehen kann.
   */
  async function doDiagnose() {
    await loadSettings();
    const out = { containerFound: false, messageCount: 0, samples: [], menuOpened: false, menuItems: [] };

    const container = dom.findConversation();
    out.containerFound = !!container;
    if (!container) {
      console.warn('[SCDC Diagnose]', 'Kein Chatbereich gefunden.', out);
      return out;
    }

    const messages = SCDC.scanner.findMessages(container);
    out.messageCount = messages.length;
    // Wie viele Zeilen haben eine EIGENE Kopfzeile? Der Rest sind gruppierte
    // Folgenachrichten - genau die, die die alte Erkennung uebersehen hat.
    out.mitEigenerKopfzeile = messages.filter((el) => {
      try {
        return !!(el.querySelector && el.querySelector('header'));
      } catch (_) {
        return false;
      }
    }).length;

    out.backdrop = container ? dom.backdropBehind(container) : null;
    // Wie ein frischer Lauf: sonst haengt das Ergebnis davon ab, was ein
    // frueherer Lauf ueber Hover und Rechtsklick gelernt hat.
    SCDC.deleter.resetHoverProof();

    for (const el of messages.slice(-6)) {
      const { type, flags } = SCDC.scanner.classify(el);
      const sample = {
        type,
        saved: flags.saved,
        // Geschaetzt (Ausrichtung) - die verbindliche Auskunft steht weiter
        // unten unter `eigenLautLeiste`.
        ownGeschaetzt: SCDC.scanner.isOwnMessage(el, container),
        absender: SCDC.scanner.senderKey(el),
        // Wohin das simulierte Ueberfahren zielt - trifft es nicht den Inhalt,
        // erscheint die Aktionsleiste nicht.
        hoverZiel: (() => {
          const z = dom.deepestInside(el);
          const r = z.getBoundingClientRect();
          return `${z.tagName.toLowerCase()}.${(z.className || '').toString().split(' ')[0] || '-'} ` +
            `${Math.round(r.width)}x${Math.round(r.height)}${z === el ? ' (= ganze Zeile!)' : ''}`;
        })(),
        candidates: dom.candidates(el).slice(0, 3),
        // Farbkette: zeigt, WO die "gespeichert"-Hervorhebung sitzt und wie
        // sie sich von einer nicht gespeicherten Nachricht unterscheidet.
        farben: dom.mainChain(el, 4).map((n) => {
          const r = n.getBoundingClientRect();
          let bg = '';
          try {
            bg = getComputedStyle(n).backgroundColor || '';
          } catch (_) {
            bg = '?';
          }
          return `${n.tagName.toLowerCase()}.${(n.className || '').toString().split(' ')[0] || '-'} ` +
            `${Math.round(r.width)}x${Math.round(r.height)} ${bg}`;
        }),
        hintergrundErkannt: dom.ownBackground(el, 4)
      };

      // Aktionsleiste oeffnen und aufschreiben, was wirklich drinsteht. Genau
      // hier scheitert die Zuordnung Position->Aktion, sobald Snapchat eine
      // andere Symbolanzahl zeigt als die bekannten 3 (fremd) / 4 (eigen).
      SCDC.deleter.letzterWeg = '';
      const menu = await SCDC.deleter.openMenu(el);
      sample.weg = menu ? SCDC.deleter.letzterWeg : '';
      if (menu && menu.toolbar) {
        out.menuOpened = true;
        sample.symbole = menu.toolbar.length;
        // Die einzige verlaessliche Herkunftsauskunft: der Papierkorb (4.
        // Symbol) erscheint nur bei eigenen Nachrichten.
        sample.eigenLautLeiste = SCDC.deleter.ownFromToolbar(menu);
        sample.icons = menu.toolbar.map((b, i) => {
          const r = b.getBoundingClientRect();
          const p = b.querySelector('path');
          return `#${i} x=${Math.round(r.left)} ${Math.round(r.width)}x${Math.round(r.height)} ` +
            `d=${((p && p.getAttribute('d')) || '(kein path)').slice(0, 55)}`;
        });
      } else if (menu && typeof menu.querySelectorAll === 'function') {
        out.menuOpened = true;
        out.menuItems = Array.from(menu.querySelectorAll('*'))
          .map((n) => dom.textOf(n))
          .filter((t) => t && t.length < 80);
        sample.symbole = 0;
        sample.eigenLautLeiste = SCDC.deleter.ownFromMenu(menu);
        // Nur die Blaetter: sonst steht jeder Eintrag mehrfach drin (einmal
        // pro umschliessendem Container).
        sample.menuePunkte = Array.from(new Set(
          Array.from(menu.querySelectorAll('*'))
            .filter((n) => !n.children || !n.children.length)
            .map((n) => dom.textOf(n))
            .filter((t) => t && t.length < 60)
        )).slice(0, 12);
        await SCDC.deleter.closeMenu();
      } else {
        sample.symbole = 0;
        sample.versteckteIcons = SCDC.deleter.hiddenIconButtons(el);
      }
      await dom.unhover(el);
      out.samples.push(sample);
    }

    console.info('[SCDC Diagnose] Ergebnis:', out);
    return out;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.cmd) return;

    switch (msg.cmd) {
      case 'ping':
        sendResponse({ ok: true, state: SCDC.state });
        return true;

      case 'getState':
        sendResponse({ ok: true, state: SCDC.state });
        return true;

      case 'scan':
        doScan(msg).then(sendResponse);
        return true;

      case 'delete':
        doDelete(msg).then(sendResponse);
        return true;

      case 'abort':
        SCDC.abort('Über das Menü gestoppt');
        sendResponse({ ok: true });
        return true;

      case 'reset':
        SCDC.state.phase = 'idle';
        SCDC.state.scan = null;
        SCDC.state.progress = { deleted: 0, failed: 0 };
        SCDC.state.error = null;
        SCDC.hud.clearMarks();
        SCDC.hud.hide();
        SCDC.persist();
        sendResponse({ ok: true, state: SCDC.state });
        return true;

      case 'diagnose':
        doDiagnose().then((result) => sendResponse({ ok: true, result }));
        return true;

      case 'pick':
        loadSettings()
          .then(() => SCDC.picker.pick(msg.kind))
          .then((selector) => sendResponse({ ok: true, selector }));
        return true;

      default:
        sendResponse({ ok: false, error: 'Unbekannter Befehl' });
        return true;
    }
  });

  loadSettings().then(() => {
    SCDC.persist();
  });
})();
