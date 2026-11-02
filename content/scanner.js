/**
 * Scanner: laedt den Chatverlauf nach, findet Nachrichtenelemente,
 * klassifiziert sie nach Datentyp und zaehlt sie.
 */
(function () {
  'use strict';

  const SCDC = (window.SCDC = window.SCDC || {});
  const dom = SCDC.dom;
  const scanner = (SCDC.scanner = {});

  /**
   * Datums-Trenner ("Gestern", "12. Mai") - eine Zeile, deren einziges Kind ein
   * <time> ist. Keine Nachricht, also nichts zum Anfassen.
   */
  scanner.isDateSeparator = function (el) {
    const kids = Array.from((el && el.children) || []);
    if (kids.length !== 1) return false;
    return String(kids[0].tagName || '').toLowerCase() === 'time';
  };

  /** Wie viele <li> liegen zwischen dieser Zeile und dem Chatbereich? */
  function zeilenTiefe(li, container) {
    let n = 0;
    for (let p = li.parentElement; p && p !== container; p = p.parentElement) {
      if (String(p.tagName || '').toLowerCase() === 'li') n++;
    }
    return n;
  }
  scanner.rowDepth = zeilenTiefe; // fuer die Tests

  /**
   * Nachrichtenzeilen - nach dem per DOM-Dump bestaetigten Aufbau:
   *
   *   ul#cv-…                      Chatbereich
   *     li                         Gruppen-Huelle (Tiefe 0) ODER Datums-Trenner
   *       div > ul
   *         li                     NACHRICHT (Tiefe 1), erste mit <header>
   *         li                     Folgenachricht derselben Gruppe, ohne <header>
   *
   * Jede Nachricht sitzt GENAU EINE <li>-Ebene unter einer Huelle - auch eine
   * einzelne, ungruppierte (im Dump bestaetigt). Alles Tiefere, etwa die
   * zitierte Vorschau in einer Antwort, ist keine eigene Nachricht.
   *
   * Vorgaenger, die daran gescheitert sind:
   *  - 'li:has(> header)' fand nur die ERSTE Nachricht jeder Gruppe; der Rest
   *    tauchte erst in Folgelaeufen auf.
   *  - "jedes <li> ohne verschachteltes <li>" griff bei Antworten das Zitat ab
   *    statt der Antwort.
   *  - Eine Flaechenregel fuer Huellen haette jede Gruppe verfehlt: die Huelle
   *    ist 491 px breit, die Nachrichten darin nur 300 px - sie belegen also
   *    nie die ganze Flaeche, und die Huelle waere als Nachricht durchgegangen.
   */
  scanner.messageRows = function (container) {
    let lis = [];
    try {
      lis = Array.from(container.querySelectorAll('li'));
    } catch (_) {
      return [];
    }
    const sichtbar = lis.filter((li) => {
      if (!dom.isVisible(li)) return false;
      if (scanner.isDateSeparator(li)) return false;
      return li.getBoundingClientRect().height >= 14;
    });
    const nachrichten = sichtbar.filter((li) => zeilenTiefe(li, container) === 1);
    if (nachrichten.length) return nachrichten;
    // Kein Gruppen-Aufbau (falls Snapchat ihn je abschafft): dann sind die
    // Zeilen direkt im Chatbereich die Nachrichten.
    return sichtbar.filter((li) => zeilenTiefe(li, container) === 0);
  };

  /**
   * Nachrichtenzeilen im Konversationscontainer.
   * Bevorzugt echte Listenelemente; faellt sonst auf direkte Kinder zurueck,
   * die gross genug sind, um eine Nachricht zu sein.
   */
  scanner.findMessages = function (container) {
    if (!container) return [];

    // 1. Eigener Selektor aus den Einstellungen hat immer Vorrang.
    const custom = ((SCDC.settings.customSelectors || {}).message || '').trim();
    if (custom) {
      try {
        const list = Array.from(container.querySelectorAll(custom)).filter(dom.isVisible);
        // Gleiche Schwelle wie unten: ein Selektor, der genau ein Element
        // trifft, ist eher ein Vertipper als eine Nachrichtenliste.
        if (list.length >= 2) return list;
      } catch (_) {
        /* ungueltiger Nutzer-Selektor - weiter mit der Struktur */
      }
    }

    // 2. Strukturell (deckt auch gruppierte Folgenachrichten ab).
    const rows = scanner.messageRows(container);
    if (rows.length >= 2) return rows;

    const { elements } = dom.queryAllFirstMatching(container, SCDC.activeSelectors.message);
    if (elements.length >= 2) return elements;

    // Fallback: direkte Kinder des Scrollbereichs, die Text oder Medien tragen.
    const kids = Array.from(container.children);
    const inner = kids.length === 1 ? Array.from(kids[0].children) : kids;
    return inner.filter((el) => {
      if (!dom.isVisible(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.height < 14) return false;
      return dom.textOf(el).length > 0 || el.querySelector('img, video, canvas, svg');
    });
  };

  /**
   * Absender-Kennung einer Nachricht: der Name aus der Kopfzeile, ohne Ziffern.
   *
   * Der Name wiederholt sich bei jeder Nachricht desselben Absenders, der
   * Zeitstempel nicht - deshalb fliegen Ziffern raus. Ergebnis ist ein
   * Schluessel, unter dem sich merken laesst, was die Aktionsleiste ueber
   * diesen Absender verraten hat (siehe rememberSender).
   *
   * Nur die ERSTE Zeile einer Gruppe traegt eine Kopfzeile; die Folgezeilen
   * gehoeren zum selben Absender und erben den Namen deshalb von der naechsten
   * Zeile darueber. Die Suche geht bewusst nur ueber Geschwister und verlaesst
   * die Liste nie: ein Name aus einem anderen Teil der Seite waere schlimmer
   * als gar keiner, weil er unter "Nur meine Nachrichten" zum stillen
   * Ueberspringen fuehren wuerde. Findet sich keiner, gibt es eben keinen
   * Schluessel - dann wird die Zeile einzeln ueberfahren, was auch stimmt.
   */
  function headerIn(el) {
    try {
      return (el && el.querySelector && el.querySelector('header')) || null;
    } catch (_) {
      return null;
    }
  }

  scanner.senderKey = function (el) {
    let header = null;
    for (let node = el, i = 0; node && i < 40; node = node.previousElementSibling, i++) {
      header = headerIn(node);
      if (header) break;
    }
    if (!header) return '';
    const raw = header.innerText || header.textContent || '';
    // Alles ausser Buchstaben raus: damit fallen Uhrzeit ("12:33"), Trennzeichen
    // und Emoji weg, uebrig bleibt der reine Name. Bleibt danach nichts uebrig
    // (z. B. ein Name nur aus Emoji), gibt es eben keinen Schluessel - dann
    // wird jede Nachricht einzeln ueberfahren, was auch funktioniert.
    const key = dom.norm(raw.replace(/[^\p{L}\p{M}\s'’-]/gu, ' '));
    return key.length >= 2 && key.length <= 60 ? key : '';
  };

  /**
   * Was die Aktionsleiste ueber einen Absender verraten hat.
   *
   * Ob eine Nachricht von einem selbst stammt, laesst sich am DOM nicht ablesen
   * (siehe isOwnMessage). Die Aktionsleiste weiss es sicher - sie erscheint aber
   * erst beim Ueberfahren, also viel zu spaet fuer einen Scan. Also: einmal
   * ueberfahren, Ergebnis unter dem Absendernamen merken, und alle weiteren
   * Nachrichten desselben Absenders sind sofort eingeordnet. In einem Zweierchat
   * genuegt so ein einziger Hover je Seite.
   */
  scanner.senderMemory = new Map();

  scanner.resetSenders = function () {
    scanner.senderMemory = new Map();
  };

  scanner.rememberSender = function (el, own) {
    const key = scanner.senderKey(el);
    if (key) scanner.senderMemory.set(key, !!own);
  };

  /** true/false, wenn der Absender bekannt ist - sonst null (= noch unbekannt). */
  scanner.knownOwn = function (el) {
    const key = scanner.senderKey(el);
    if (!key || !scanner.senderMemory.has(key)) return null;
    return scanner.senderMemory.get(key);
  };

  /**
   * Eigene vs. fremde Nachricht - eine SCHAETZUNG, keine Auskunft.
   *
   * Zuerst das Gelernte (siehe rememberSender), dann der in den Optionen
   * hinterlegte Anzeigename. Bleibt beides ohne Ergebnis, entscheidet die
   * horizontale Ausrichtung - und die ist bei Snapchat Web unbrauchbar, weil
   * dort BEIDE Seiten linksbuendig stehen (unterschieden nur durch die Farbe
   * des Namens). Genau daran sind eigene Nachrichten reihenweise als "fremd"
   * durchgefallen. Verbindlich ist deshalb allein die Aktionsleiste, siehe
   * deleter.ownFromToolbar().
   */
  scanner.isOwnMessage = function (el, container) {
    const gelernt = scanner.knownOwn(el);
    if (gelernt !== null) return gelernt;

    const text = dom.textOf(el);
    const own = dom.norm(SCDC.settings.ownUsername);
    if (own && text.startsWith(own)) return true;
    if (dom.matchesAny(text.slice(0, 30), ['du:', 'ich:', 'me:', 'you:'])) return true;

    const cRect = container.getBoundingClientRect();
    const mRect = el.getBoundingClientRect();
    if (mRect.width >= cRect.width * 0.92) {
      // Volle Breite: Ausrichtung ueber den Inhalt bestimmen.
      const inner = el.querySelector('*');
      if (inner) {
        const iRect = inner.getBoundingClientRect();
        const gapLeft = iRect.left - mRect.left;
        const gapRight = mRect.right - iRect.right;
        if (Math.abs(gapLeft - gapRight) > 24) return gapLeft > gapRight;
      }
      const align = getComputedStyle(el).textAlign;
      if (align === 'right') return true;
      return false;
    }
    const centerMsg = mRect.left + mRect.width / 2;
    const centerBox = cRect.left + cRect.width / 2;
    return centerMsg > centerBox;
  };

  /**
   * Ordnet einer Nachricht genau einen Datentyp zu.
   * Reihenfolge ist wichtig: spezifische Medientypen vor generischem "Snap",
   * Text zuletzt als Fallback.
   */
  scanner.classify = function (el) {
    const flags = { saved: false };

    // "Gespeichert" ist ein Zustand, kein exklusiver Typ - separat merken.
    const T = SCDC.TYPES;
    const allKeywords = (type) => (T[type].keywords.de || []).concat(T[type].keywords.en || []);

    // Jede Textquelle EINZELN pruefen, nicht verkettet (dom.candidates statt
    // dom.textOf): Snapchats aria-labels sind oft ganze Saetze und wuerden mit
    // dem Nachrichtentext zusammengeklebt fast immer ueber jede sinnvolle
    // Laengengrenze schiessen - das eigentliche kurze Statuslabel ("Snap",
    // "Video-Notiz") bleibt so erkennbar, egal wie viel Text drumherum haengt.
    const candidates = dom.candidates(el);
    const matchAnyCandidate = (keywords) =>
      candidates.some((c) => c.length <= 60 && dom.matchesAny(c, keywords));

    // "Gespeichert" laesst sich hier NICHT zuverlaessig feststellen: Snapchat
    // vermerkt es weder im Text noch in einem Attribut, und auch nicht per
    // Hintergrundfarbe (per Diagnose geprueft - gespeicherte und nicht
    // gespeicherte Nachrichten sind identisch eingefaerbt). Verlaesslich ist
    // allein das Umschalt-Icon der Aktionsleiste, und das erscheint erst beim
    // Ueberfahren. Der Deleter liest es dort aus (deleter.savedStateFromToolbar);
    // hier bleibt es bei einem Keyword-Treffer, falls eine Sprachversion doch
    // ein Textlabel zeigt.
    if (matchAnyCandidate(allKeywords('saved'))) flags.saved = true;

    const order = ['video_note', 'audio_note', 'snap_video', 'attachment', 'snap_photo'];
    for (const id of order) {
      if (matchAnyCandidate(allKeywords(id))) return { type: id, flags };
    }

    // Medien-Heuristik ohne Textlabel: Video-/Bildelemente im Knoten.
    if (el.querySelector('video')) return { type: 'snap_video', flags };
    if (el.querySelector('audio')) return { type: 'audio_note', flags };
    const img = el.querySelector('img');
    if (img && img.getBoundingClientRect().height > 60) return { type: 'snap_photo', flags };

    return { type: 'text', flags };
  };

  /**
   * Scrollt den Verlauf nach oben, bis nichts mehr nachgeladen wird.
   * Snapchat rendert virtualisiert - deshalb wird die Anzahl der gefundenen
   * Nachrichten UND die Scrollhoehe als Fortschrittssignal genutzt.
   */
  scanner.loadFullHistory = async function (container, onProgress) {
    if (!container) return 0;
    let idleRounds = 0;
    let lastCount = -1;
    let lastHeight = -1;
    let steps = 0;

    while (steps < SCDC.timing.historyMaxSteps && idleRounds < SCDC.timing.historyIdleRounds) {
      if (SCDC.state.abort) break;
      container.scrollTop = 0;
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
      await dom.sleep(SCDC.timing.historyStep);

      const count = scanner.findMessages(container).length;
      const height = container.scrollHeight;
      if (count === lastCount && height === lastHeight) idleRounds++;
      else idleRounds = 0;

      lastCount = count;
      lastHeight = height;
      steps++;
      if (onProgress) onProgress({ steps, count });
    }
    // Zurueck ans Ende, damit die Ansicht wieder normal aussieht.
    container.scrollTop = container.scrollHeight;
    await dom.sleep(200);
    return lastCount;
  };

  /**
   * Vollstaendiger Scan der offenen Konversation.
   * Liefert Zaehler je Typ plus Metadaten fuer die Anzeige im Popup.
   */
  scanner.scanConversation = async function (opts) {
    const options = opts || {};
    const container = dom.findConversation();
    if (!container) {
      return { ok: false, error: 'Kein Chatbereich gefunden. Ist ein Chat geöffnet?' };
    }

    if (options.loadHistory !== false) {
      await scanner.loadFullHistory(container, (p) => {
        SCDC.hud.setStatus(`Verlauf wird geladen … ${p.count} Nachrichten`);
      });
    }

    const messages = scanner.findMessages(container);
    const counts = {};
    const own = {};
    for (const id of SCDC.TYPE_ORDER) {
      counts[id] = 0;
      own[id] = 0;
    }
    let savedCount = 0;
    let savedOwn = 0;
    // Ein Eintrag pro Nachricht - damit das Popup bei mehreren gewaehlten Typen
    // exakt zaehlen kann statt Summen zu bilden (ein gespeicherter Snap zaehlt
    // sowohl bei "Foto-Snaps" als auch bei "Gespeichert").
    const records = [];

    for (const el of messages) {
      if (SCDC.state.abort) break;
      const { type, flags } = scanner.classify(el);
      const isOwn = scanner.isOwnMessage(el, container);
      counts[type] = (counts[type] || 0) + 1;
      if (isOwn) own[type] = (own[type] || 0) + 1;
      if (flags.saved) {
        savedCount++;
        if (isOwn) savedOwn++;
      }
      records.push({ t: type, s: flags.saved ? 1 : 0, o: isOwn ? 1 : 0 });
    }
    counts.saved = savedCount;
    own.saved = savedOwn;

    return {
      ok: true,
      total: messages.length,
      counts,
      own,
      records,
      container: dom.cssPath(container)
    };
  };

  /**
   * Liefert die Nachrichten, die zu den gewaehlten Typen passen.
   * `skip` enthaelt Fingerprints, die bereits fehlgeschlagen sind.
   */
  scanner.collectTargets = function (container, types, onlyOwn, skip) {
    const wanted = new Set(types);
    const out = [];
    for (const el of scanner.findMessages(container)) {
      if (el.dataset.scdcDone === '1') continue;
      const { type, flags } = scanner.classify(el);
      // "Gespeichert" ist ohne Ueberfahren nicht feststellbar (siehe
      // classify): bei dieser Auswahl kommt deshalb jede Nachricht in Frage.
      // Der Deleter liest den Status am Umschalt-Icon der Aktionsleiste und
      // ueberspringt nicht gespeicherte, ohne irgendetwas zu klicken.
      const matches = wanted.has(type) || wanted.has('saved');
      if (!matches) continue;
      const own = scanner.isOwnMessage(el, container);
      // `onlyOwn` darf hier nur ausschliessen, was SICHER fremd ist - also nur
      // das an der Aktionsleiste Gelernte. Die Ausrichtung als Filter zu
      // benutzen war der Fehler, der eigene Nachrichten reihenweise
      // uebersprungen hat. Was noch unbekannt ist, geht an den Deleter; der
      // liest die Aktionsleiste und ueberspringt fremde ohne Klick.
      if (onlyOwn && scanner.knownOwn(el) === false) continue;
      if (skip && skip.has(dom.fingerprint(el))) continue;
      // `own` wird an den Deleter durchgereicht: Snapchat bietet fuer fremde
      // Nachrichten grundsaetzlich KEIN Loeschen an (nur Entspeichern) - das
      // ist eine echte Grenze von Snapchat, kein Fehler der Extension.
      out.push({ el, type, saved: flags.saved, own });
    }
    return out;
  };
})();
