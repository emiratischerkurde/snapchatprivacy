/*
 * DOM-Inspektion fuer Snapchat Web -- Diagnosewerkzeug, kein Teil der Extension.
 *
 * Zweck: das echte Markup sichtbar machen, damit die Selektoren der Extension
 * auf Tatsachen statt auf Vermutungen beruhen.
 *
 * Diese Datei ist absichtlich reines ASCII (keine Umlaute, Pfeile,
 * Anfuehrungszeichen-Sonderzeichen etc.) -- solche Zeichen werden beim
 * Kopieren ueber manche Zwischenablagen/Editoren beschaedigt und fuehren zu
 * kryptischen Fehlern wie "X is not defined" beim Einfuegen in die Konsole.
 *
 * VERWENDUNG
 *   1. snapchat.com/web/ oeffnen, anmelden, den betroffenen Chat oeffnen
 *   2. F12 -> Reiter "Console"
 *      Falls Chrome das Einfuegen blockiert: erst  allow pasting  tippen, Enter
 *   3. Diese Datei komplett kopieren, einfuegen, Enter
 *      -> laedt "snapchat-dom-dump.txt" herunter
 *   4. Fuer das Hover-/Kontextmenue:
 *        scdcCapture()      in die Konsole tippen, Enter
 *        -> dann SOFORT mit der Maus ueber eine Nachricht fahren und dort
 *           ruhig liegen bleiben, bis die Aufnahme meldet, dass sie fertig ist
 *        -> laedt "snapchat-menu-dump.txt" herunter
 *
 *      Die Aufnahme laeuft 12 Sekunden. Das ist noetig, weil das Hover-Menue
 *      wieder verschwindet, sobald die Maus die Nachricht verlaesst -- es wird
 *      deshalb WAEHREND des Schwebens festgehalten, nicht danach.
 *
 * DATENSCHUTZ
 *   Nachrichtentexte werden ersetzt durch [N Zeichen Text] -- der Inhalt
 *   deiner Chats landet NICHT im Dump. Kurze Beschriftungen bleiben lesbar,
 *   weil genau die gebraucht werden ("Snap", "Gespeichert", "Loeschen").
 *   ABER: in aria-label/title-Attributen koennen Kontaktnamen stehen. Oeffne
 *   die heruntergeladenen Dateien einmal und ueberflieg sie, bevor du sie
 *   weitergibst.
 */
(function () {
  'use strict';

  var MAX_TEXT = 30; // laengerer sichtbarer Text gilt als Nachrichteninhalt
  var MAX_ATTR = 140; // aria-label/title duerfen laenger sein, die sind strukturell
  var MAX_CHILDREN = 8;
  var MAX_LINES = 2500;
  var CAPTURE_MS = 12000;
  var SNAPSHOT_DELAY = 160; // nach dem Einfuegen kurz warten, damit Layout steht

  /* ---------- Ausgabepuffer ---------- */

  function Buf() {
    this.lines = [];
    this.truncated = false;
  }
  Buf.prototype.add = function (s) {
    if (this.lines.length >= MAX_LINES) {
      this.truncated = true;
      return;
    }
    this.lines.push(s);
  };
  Buf.prototype.text = function () {
    return this.lines.join('\n') + (this.truncated ? '\n\n[gekuerzt, Zeilenlimit erreicht]' : '');
  };

  /* ---------- Redaktion ---------- */

  function clean(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  /** Sichtbarer Text: lang = vermutlich Nachrichteninhalt -> ersetzen. */
  function redactText(s) {
    var t = clean(s);
    if (!t) return '';
    if (t.length <= MAX_TEXT) return JSON.stringify(t);
    return '[' + t.length + ' Zeichen Text]';
  }

  /** Attributwert: bleibt lesbar (strukturell), nur hart gekappt. */
  function attrValue(name, value) {
    var v = clean(value);
    if (name === 'src' || name === 'href' || name === 'srcset') {
      return v.slice(0, 50) + (v.length > 50 ? '...' : '');
    }
    // SVG-Pfaddaten sind keine personenbezogenen Daten (nur Icon-Geometrie) -
    // ungekuerzt lassen, sonst laesst sich das Icon (Papierkorb? Lesezeichen?
    // Pfeil?) aus dem Dump nicht mehr identifizieren.
    if (name === 'd') return v;
    if (v.length > MAX_ATTR) return v.slice(0, MAX_ATTR) + '...';
    return v;
  }

  function describeAttrs(el) {
    var parts = [];
    var attrs = el.attributes || [];
    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i];
      if (a.name === 'style' || a.name === 'class') continue;
      parts.push(a.name + '="' + attrValue(a.name, a.value) + '"');
    }
    return parts.join(' ');
  }

  function describeClasses(el) {
    var c = [];
    if (el.classList) {
      for (var i = 0; i < el.classList.length; i++) c.push(el.classList[i]);
    }
    return c.length ? '.' + c.join('.') : '';
  }

  function describe(el) {
    var tag = el.tagName ? el.tagName.toLowerCase() : '?';
    var s = '<' + tag + describeClasses(el);
    var attrs = describeAttrs(el);
    if (attrs) s += ' ' + attrs;
    s += '>';

    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (r && (r.width || r.height)) {
      s += '  [' + Math.round(r.width) + 'x' + Math.round(r.height) + ' @' + Math.round(r.left) + ',' + Math.round(r.top) + ']';
    }
    // Nur direkt in DIESEM Knoten stehender Text, damit sich Text nicht auf
    // jeder Verschachtelungsebene wiederholt.
    var ownText = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) ownText += el.childNodes[i].nodeValue;
    }
    ownText = clean(ownText);
    if (ownText) s += '  Text=' + redactText(ownText);
    return s;
  }

  /** Baum in einen Zeilen-Array schreiben (eigenstaendig, fuer Snapshots). */
  function treeLines(el, depth, indent, sink) {
    if (!el || depth < 0) return;
    sink.push(indent + describe(el));
    var kids = el.children || [];
    var limit = Math.min(kids.length, MAX_CHILDREN);
    for (var i = 0; i < limit; i++) treeLines(kids[i], depth - 1, indent + '  ', sink);
    if (kids.length > limit) sink.push(indent + '  ... +' + (kids.length - limit) + ' weitere');
  }

  function tree(buf, el, depth, indent) {
    var sink = [];
    treeLines(el, depth, indent, sink);
    for (var i = 0; i < sink.length; i++) buf.add(sink[i]);
  }

  function pathOf(el) {
    var parts = [];
    var node = el;
    var guard = 0;
    while (node && node.nodeType === 1 && guard++ < 12) {
      var seg = node.tagName.toLowerCase();
      if (node.id) seg += '#' + node.id;
      var t = node.getAttribute && node.getAttribute('data-testid');
      if (t) seg += '[data-testid=' + t + ']';
      parts.unshift(seg);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    var st;
    try {
      st = getComputedStyle(el);
    } catch (e) {
      return false;
    }
    if (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') return false;
    var r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  /* ---------- Scrollbare Container ---------- */

  function scrollers() {
    var f = [];
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var st;
      try {
        st = getComputedStyle(el);
      } catch (e) {
        continue;
      }
      if (st.overflowY !== 'auto' && st.overflowY !== 'scroll') continue;
      if (el.scrollHeight <= el.clientHeight + 20) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 120) continue;
      f.push(el);
    }
    f.sort(function (a, b) {
      var ra = a.getBoundingClientRect();
      var rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    });
    return f;
  }

  /* ---------- Download ---------- */

  function download(name, text) {
    try {
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
      return true;
    } catch (e) {
      return false;
    }
  }

  function finish(name, text, globalName) {
    console.log(text);
    window[globalName] = text;
    var ok = download(name, text);
    console.log(
      (ok ? 'OK: Datei "' + name + '" heruntergeladen.' : 'Download fehlgeschlagen -- nutze: copy(' + globalName + ')')
    );
  }

  /* ---------- Hauptdump ---------- */

  function main() {
    var buf = new Buf();
    buf.add('=== SNAPCHAT DOM-INSPEKTION ===');
    buf.add('URL: ' + location.href);
    buf.add('Sprache: ' + (document.documentElement.lang || '(nicht gesetzt)'));
    buf.add('Viewport: ' + window.innerWidth + 'x' + window.innerHeight);
    buf.add('Extension-Content-Script geladen: ' + (window.SCDC ? 'JA' : 'NEIN'));
    if (window.SCDC && window.SCDC.dom) {
      var picked = null;
      try {
        picked = window.SCDC.dom.findConversation();
      } catch (e) {
        /* egal */
      }
      buf.add('Von der Extension gewaehlter Chat-Container: ' + (picked ? pathOf(picked) : '(keiner)'));
      if (picked) {
        try {
          buf.add('  -> dort erkannte Nachrichten: ' + window.SCDC.scanner.findMessages(picked).length);
        } catch (e) {
          buf.add('  -> findMessages warf einen Fehler: ' + e);
        }
      }
    }
    buf.add('');

    var sc = scrollers();
    buf.add('--- SCROLLBARE CONTAINER (' + sc.length + ' gefunden, groesster zuerst) ---');
    for (var i = 0; i < Math.min(sc.length, 6); i++) {
      var el = sc[i];
      var r = el.getBoundingClientRect();
      buf.add(
        '[' + (i + 1) + '] ' + el.tagName.toLowerCase() + describeClasses(el) +
        '  scrollHeight=' + el.scrollHeight + ' clientHeight=' + el.clientHeight +
        ' scrollTop=' + el.scrollTop + '  rect=' + Math.round(r.width) + 'x' + Math.round(r.height)
      );
      var at = describeAttrs(el);
      if (at) buf.add('     attrs: ' + at);
      buf.add('     direkte Kinder: ' + el.children.length);
      buf.add('     Pfad: ' + pathOf(el));
    }
    buf.add('');

    if (sc.length) {
      var top = sc[0];
      buf.add('--- STRUKTUR DES GROESSTEN SCROLLERS (Tiefe 3) ---');
      tree(buf, top, 3, '');
      buf.add('');

      var host = top;
      while (host.children.length === 1 && host.children[0].children.length > 1) host = host.children[0];
      buf.add('--- VERMUTLICHE NACHRICHTENLISTE ---');
      buf.add('Pfad: ' + pathOf(host));
      buf.add('Anzahl Kinder: ' + host.children.length);
      buf.add('');

      var kids = Array.prototype.slice.call(host.children);
      var sample = kids.slice(-6);
      buf.add('--- STICHPROBE: LETZTE ' + sample.length + ' EINTRAEGE (je Tiefe 4) ---');
      for (var k = 0; k < sample.length; k++) {
        buf.add('');
        buf.add('### Eintrag ' + (k + 1) + ' (von unten: ' + (sample.length - k) + ')');
        tree(buf, sample[k], 4, '');
      }
    } else {
      buf.add('!! Kein scrollbarer Container gefunden. Ist wirklich ein Chat geoeffnet?');
    }

    finish('snapchat-dom-dump.txt', buf.text(), 'SCDCDUMP');
    console.log('Jetzt fuer das Hover-Menue:  scdcCapture()  eintippen und danach sofort mit der Maus ueber eine Nachricht fahren.');
  }

  /* ---------- Phase 2: Aufnahme mit Zeitfenster ---------- */

  /*
   * Das Hover-Menue wird ausgehaengt, sobald die Maus die Nachricht verlaesst.
   * Ein nachtraegliches Einsammeln (erst hovern, dann Funktion aufrufen)
   * findet deshalb nichts mehr. Stattdessen wird WAEHREND des Schwebens
   * aufgenommen: neu eingefuegte Knoten werden kurz nach dem Einfuegen
   * serialisiert, solange sie noch im DOM haengen.
   */

  var capturing = false;
  var shots = []; // { el, lines }  el nur zur Dedupe-Pruefung zur Aufnahmezeit
  var hoverShots = [];
  var lastHoverKey = '';

  function snapshot(el) {
    if (!capturing || !isVisible(el)) return;
    var r = el.getBoundingClientRect();
    if (r.width < 60 || r.height < 20) return;

    // Dedupe: verschachtelte Treffer zusammenfassen, aeussersten behalten.
    for (var i = 0; i < shots.length; i++) {
      var prev = shots[i].el;
      if (prev.isConnected && prev.contains(el)) return; // schon abgedeckt
      if (prev.isConnected && el.contains(prev)) {
        shots.splice(i, 1);
        i--;
      }
    }
    var lines = [];
    treeLines(el, 5, '', lines);
    shots.push({ el: el, lines: lines });
  }

  var observer = new MutationObserver(function (records) {
    if (!capturing) return;
    for (var i = 0; i < records.length; i++) {
      var added = records[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        if (added[j].nodeType !== 1) continue;
        (function (node) {
          setTimeout(function () {
            snapshot(node);
          }, SNAPSHOT_DELAY);
        })(added[j]);
      }
    }
  });

  function onMove(e) {
    if (!capturing) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    var key = pathOf(el);
    if (key === lastHoverKey) return;
    lastHoverKey = key;

    // Vorfahrenkette festhalten: zeigt, wie eine Nachrichtenzeile aufgebaut ist.
    var chain = [];
    var node = el;
    for (var i = 0; i < 6 && node; i++) {
      chain.push(repeatStr('  ', i) + describe(node));
      node = node.parentElement;
    }
    hoverShots.push({ path: key, chain: chain.reverse() });
    if (hoverShots.length > 12) hoverShots.shift();
  }

  function repeatStr(s, n) {
    var out = '';
    for (var i = 0; i < n; i++) out += s;
    return out;
  }

  window.scdcCapture = function (seconds) {
    var ms = (seconds ? seconds * 1000 : CAPTURE_MS);
    shots = [];
    hoverShots = [];
    lastHoverKey = '';
    capturing = true;
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('mousemove', onMove, true);

    console.log('AUFNAHME LAEUFT (' + Math.round(ms / 1000) + 's) -- jetzt mit der Maus ueber eine Nachricht fahren und dort bleiben!');

    setTimeout(function () {
      capturing = false;
      observer.disconnect();
      document.removeEventListener('mousemove', onMove, true);

      var buf = new Buf();
      buf.add('=== HOVER-/KONTEXTMENUE-AUFNAHME ===');
      buf.add('URL: ' + location.href);
      buf.add('Aufnahmedauer: ' + Math.round(ms / 1000) + 's');
      buf.add('');

      buf.add('--- NEU EINGEBLENDETE CONTAINER (' + shots.length + ') ---');
      if (!shots.length) {
        buf.add('!! Waehrend der Aufnahme ist nichts Sichtbares neu eingefuegt worden.');
        buf.add('   Moegliche Gruende: Maus war nicht ueber einer Nachricht, oder das');
        buf.add('   Menue wird nicht neu eingefuegt, sondern nur per CSS eingeblendet.');
        buf.add('   In dem Fall hilft die Hover-Kette unten weiter.');
      }
      for (var i = 0; i < Math.min(shots.length, 6); i++) {
        buf.add('');
        buf.add('### Container ' + (i + 1));
        for (var j = 0; j < shots[i].lines.length; j++) buf.add(shots[i].lines[j]);
      }
      buf.add('');

      buf.add('--- HOVER-KETTE: WORUEBER DIE MAUS GEFAHREN IST (' + hoverShots.length + ' Positionen) ---');
      buf.add('(zeigt den Aufbau einer Nachrichtenzeile von aussen nach innen)');
      for (var h = 0; h < hoverShots.length; h++) {
        buf.add('');
        buf.add('### Position ' + (h + 1) + ': ' + hoverShots[h].path);
        for (var c = 0; c < hoverShots[h].chain.length; c++) buf.add(hoverShots[h].chain[c]);
      }

      finish('snapchat-menu-dump.txt', buf.text(), 'SCDCMENU');
    }, ms);

    return '(Aufnahme gestartet -- jetzt hovern)';
  };

  // Rueckwaertskompatibler Name.
  window.scdcMenu = function () {
    console.log('Bitte scdcCapture() verwenden -- das Hover-Menue verschwindet sonst, bevor es erfasst wird.');
    return window.scdcCapture();
  };

  main();
})();
