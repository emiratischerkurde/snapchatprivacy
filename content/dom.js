/**
 * DOM-Werkzeuge: Warten, Event-Simulation, Container-Erkennung.
 *
 * Snapchat Web ist eine React-App. React haengt seine Listener am Root und
 * wertet das Event-Objekt aus, nicht `isTrusted` - synthetische Events mit
 * `bubbles: true, composed: true` kommen deshalb an. Wichtig ist, die volle
 * Sequenz (pointer -> mouse -> click) zu senden, weil viele Komponenten auf
 * `pointerdown` statt auf `click` reagieren.
 */
(function () {
  'use strict';

  const SCDC = (window.SCDC = window.SCDC || {});
  const dom = (SCDC.dom = {});

  dom.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Wartezeit + zufaelliger Aufschlag, damit der Ablauf nicht taktgenau wirkt. */
  dom.pause = function (ms) {
    const jitter = Math.random() * (SCDC.timing.jitter || 0);
    return dom.sleep(ms + jitter);
  };

  dom.norm = function (s) {
    return (s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  /** Sichtbarer Text eines Elements inkl. aria-label/title/alt, als ein String. */
  dom.textOf = function (el) {
    if (!el) return '';
    const parts = [el.getAttribute?.('aria-label'), el.getAttribute?.('title'), el.innerText || el.textContent];
    for (const img of el.querySelectorAll?.('img[alt], [aria-label]') || []) {
      parts.push(img.getAttribute('alt'), img.getAttribute('aria-label'));
    }
    return dom.norm(parts.filter(Boolean).join(' '));
  };

  /**
   * Einzelne Textquellen eines Elements, GETRENNT statt verkettet.
   *
   * Wichtig fuer die Typ-Erkennung: Snapchats aria-labels sind oft ganze Saetze
   * ("Foto-Snap, geöffnet, vor 3 Stunden, von X gesendet, zum Ansehen tippen").
   * Klebt man aria-label + title + Bild-Alt-Texte + Nachrichtentext zusammen
   * (wie dom.textOf es tut), wird der resultierende String fast immer zu lang
   * fuer eine verlaessliche Kurz-Label-Pruefung. Getrennt geprueft bleibt das
   * eigentliche Statuslabel kurz, auch wenn drumherum viel Text haengt.
   */
  dom.candidates = function (el) {
    if (!el) return [];
    const out = [];
    const add = (s) => {
      const n = dom.norm(s);
      if (n) out.push(n);
    };
    add(el.getAttribute?.('aria-label'));
    add(el.getAttribute?.('title'));
    const raw = el.innerText || el.textContent || '';
    const lines = raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length) {
      add(lines[lines.length - 1]); // Statuslabel/Zeitstempel steht meist zuletzt
      add(lines[0]);
    }
    for (const img of el.querySelectorAll?.('img[alt], [aria-label]') || []) {
      add(img.getAttribute('alt'));
      add(img.getAttribute('aria-label'));
    }
    return Array.from(new Set(out));
  };

  /** Prueft, ob einer der Suchbegriffe als Teilstring vorkommt. */
  dom.matchesAny = function (text, needles) {
    const t = dom.norm(text);
    if (!t) return false;
    return (needles || []).some((n) => n && t.includes(dom.norm(n)));
  };

  dom.isVisible = function (el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  };

  const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent', '']);
  let cachedPageBg = null;

  /** Allgemeine Hintergrundfarbe der Seite (fuer den Kontrast-Vergleich unten). */
  dom.pageBackground = function () {
    if (cachedPageBg === null) {
      try {
        cachedPageBg = getComputedStyle(document.body).backgroundColor || '';
      } catch (_) {
        cachedPageBg = '';
      }
    }
    return cachedPageBg;
  };

  /** Eigene Hintergrundfarbe, sofern gesetzt und nicht transparent. */
  function bgOf(el) {
    let bg = '';
    try {
      bg = getComputedStyle(el).backgroundColor || '';
    } catch (_) {
      bg = '';
    }
    return bg && !TRANSPARENT.has(bg) ? bg : null;
  }

  /**
   * Element plus die Kette seiner jeweils GROESSTEN Kinder.
   *
   * Nicht alle Kinder durchsuchen: eine Nachricht enthaelt neben der Blase
   * auch Kopfzeile, Avatar und Zeitstempel. Eine Tiefensuche findet dort
   * irgendeine Farbe und haelt sie faelschlich fuer die Hervorhebung. Die
   * Hervorhebung liegt aber immer auf dem flaechenmaessig dominanten Element.
   */
  dom.mainChain = function (el, depth) {
    const out = [];
    let node = el;
    for (let i = 0; node && i <= depth; i++) {
      out.push(node);
      let biggest = null;
      let best = 0;
      for (const child of node.children || []) {
        const r = child.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > best) {
          best = area;
          biggest = child;
        }
      }
      node = biggest;
    }
    return out;
  };

  /** Erste nicht-transparente Hintergrundfarbe entlang der Hauptkette. */
  dom.ownBackground = function (el, depth) {
    if (!el || depth < 0) return null;
    for (const node of dom.mainChain(el, depth)) {
      const bg = bgOf(node);
      if (bg) return bg;
    }
    return null;
  };

  /**
   * Farbe, die HINTER einem Element liegt: erste nicht-transparente
   * Hintergrundfarbe in der Vorfahrenkette.
   *
   * Bewusst nicht `document.body` als globale Referenz: bei Snapchat traegt
   * body oft gar keine Farbe (die sitzt auf einem App-Root weiter innen).
   * Waere die Referenz dann transparent, wuerde JEDE Nachricht mit
   * irgendeinem Hintergrund als hervorgehoben gelten.
   */
  dom.backdropBehind = function (el) {
    let node = el && el.parentElement;
    while (node) {
      const bg = bgOf(node);
      if (bg) return bg;
      node = node.parentElement;
    }
    return dom.pageBackground();
  };

  // Frueher stand hier dom.isHighlighted(): "Nachricht hebt sich farblich ab
  // == gespeichert". Per Diagnose an echten Nachrichten widerlegt - die
  // Nachrichtenblase ist IMMER rgb(51, 50, 50), unabhaengig vom Speicherstatus.
  // Der Status steckt allein im Umschalt-Icon der Aktionsleiste, siehe
  // deleter.savedStateFromToolbar(). Die Farbfunktionen oben bleiben, weil die
  // Diagnose sie zum Sichtbarmachen solcher Annahmen braucht.

  /** Erster Treffer aus einer Kandidatenliste von Selektoren. */
  dom.queryFirst = function (root, candidates) {
    for (const sel of candidates || []) {
      try {
        const el = (root || document).querySelector(sel);
        if (el && dom.isVisible(el)) return el;
      } catch (_) {
        /* ungueltiger Nutzer-Selektor - ignorieren */
      }
    }
    return null;
  };

  /** Alle Treffer des ERSTEN Selektors, der ueberhaupt etwas liefert. */
  dom.queryAllFirstMatching = function (root, candidates) {
    for (const sel of candidates || []) {
      try {
        const list = Array.from((root || document).querySelectorAll(sel)).filter(dom.isVisible);
        if (list.length) return { selector: sel, elements: list };
      } catch (_) {
        /* ignorieren */
      }
    }
    return { selector: null, elements: [] };
  };

  /**
   * Findet das scrollbare Element mit dem meisten Inhalt - das ist bei
   * Snapchat Web zuverlaessig die Nachrichtenliste, auch ohne stabile Selektoren.
   */
  /**
   * Liegt das Element in der Navigationsspalte (Freundesliste/Chat-Feed)?
   * Die ist ebenfalls gross und scrollbar und darf NIE als Chatbereich gelten.
   */
  function inNavigation(el) {
    for (let n = el; n; n = n.parentElement) {
      if (String(n.tagName || '').toLowerCase() === 'nav') return true;
      if (n.getAttribute && n.getAttribute('role') === 'navigation') return true;
    }
    return false;
  }
  dom.inNavigation = inNavigation;

  dom.findScrollContainer = function (root) {
    const scope = root || document.body;
    let best = null;
    let bestScore = 0;
    const all = scope.querySelectorAll('*');
    for (const el of all) {
      if (inNavigation(el)) continue;
      const overflowY = getComputedStyle(el).overflowY;
      if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
      if (el.scrollHeight <= el.clientHeight + 40) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 200 || rect.height < 200) continue;
      // Bevorzuge grosse Flaeche mit viel ueberstehendem Inhalt.
      const score = rect.width * rect.height + (el.scrollHeight - el.clientHeight) * 100;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  };

  /** Konversationsbereich: erst per Selektor, sonst per Scroll-Heuristik. */
  /**
   * Chatbereich finden.
   *
   * Per DOM-Dump bestaetigt ist das ul#cv-<konversations-uuid>, selbst der
   * Scroller. Es wird bewusst OHNE Sichtbarkeitspruefung gesucht: Snapchat Web
   * blendet den Chat aus, sobald der Tab den Fokus verliert (Popup oder
   * Einstellungsseite geoeffnet). Mit Sichtbarkeitspruefung fiel die Suche dann
   * auf "groesster scrollbarer Bereich" zurueck - und das war die
   * Freundesliste links. Deren Eintraege ("6. okt.", "rayane") galten danach
   * als Nachrichten, und ihre Buttons als Aktionsleiste.
   *
   * Die Navigationsspalte ist deshalb in jedem Rueckfall ausgeschlossen. Lieber
   * "kein Chat gefunden" als die Freundesliste bearbeiten.
   */
  dom.findConversation = function () {
    const custom = ((SCDC.settings && SCDC.settings.customSelectors) || {}).conversation;
    if (custom && custom.trim()) {
      try {
        const el = document.querySelector(custom.trim());
        if (el && !inNavigation(el)) return dom.findScrollContainer(el) || el;
      } catch (_) {
        /* ungueltiger Nutzer-Selektor - weiter */
      }
    }

    const cv = document.querySelector('[id^="cv-"]');
    if (cv && !inNavigation(cv)) return dom.findScrollContainer(cv) || cv;

    const bySelector = dom.queryFirst(document, SCDC.activeSelectors.conversation);
    if (bySelector && !inNavigation(bySelector)) {
      const inner = dom.findScrollContainer(bySelector);
      return inner || bySelector;
    }
    const main = document.querySelector('main') || document.body;
    return dom.findScrollContainer(main) || dom.findScrollContainer(document.body);
  };

  /** Wartet, bis `fn()` einen truthy-Wert liefert, oder laeuft in den Timeout. */
  dom.waitFor = async function (fn, timeout, interval) {
    const step = interval || 90;
    const deadline = Date.now() + (timeout || 2000);
    while (Date.now() < deadline) {
      if (SCDC.state && SCDC.state.abort) return null;
      let value = null;
      try {
        value = fn();
      } catch (_) {
        value = null;
      }
      if (value) return value;
      await dom.sleep(step);
    }
    return null;
  };

  function fire(el, type, init) {
    const opts = Object.assign(
      { bubbles: true, cancelable: true, composed: true, view: window, button: 0, buttons: 1 },
      init || {}
    );
    let ev;
    if (type.startsWith('pointer')) {
      opts.pointerId = 1;
      opts.pointerType = 'mouse';
      opts.isPrimary = true;
      ev = new PointerEvent(type, opts);
    } else if (type.startsWith('mouse') || type === 'click' || type === 'contextmenu' || type === 'dblclick') {
      ev = new MouseEvent(type, opts);
    } else {
      ev = new Event(type, opts);
    }
    el.dispatchEvent(ev);
    return ev;
  }
  dom.fire = fire;

  /**
   * Liegt das Element vollstaendig im sichtbaren Ausschnitt - des Fensters
   * und, falls angegeben, auch des Scrollbereichs (der schneidet unten die
   * Eingabezeile ab)?
   */
  dom.isInViewport = function (el, scroller) {
    try {
      const r = el.getBoundingClientRect();
      const h = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!(r.height > 0 && r.top >= 0 && r.bottom <= h)) return false;
      if (scroller) {
        const s = scroller.getBoundingClientRect();
        if (r.top < s.top || r.bottom > s.bottom) return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  };

  /**
   * Haelt die Scrollposition, waehrend geloescht wird.
   *
   * Snapchat springt nach jedem Loeschen ans Ende des Chats (zu den neuesten
   * Nachrichten). Die naechste Nachricht liegt aber direkt UEBER der eben
   * geloeschten - also musste jedes Mal zurueckgescrollt, gewartet und bei
   * einem virtualisierten Verlauf neu gerendert werden. Das kostete mehr Zeit
   * als das Loeschen selbst.
   *
   * Deshalb wird jeder Sprung nach UNTEN, den nicht die Extension selbst
   * ausgeloest hat, sofort zurueckgenommen. Nach oben darf es jederzeit gehen:
   * so verschiebt sich die Ansicht etwa, wenn eine Nachricht verschwindet
   * und der Inhalt kuerzer wird. Eigenes Scrollen laeuft ueber `eigen()`.
   */
  dom.SCROLL_SPRUNG_PX = 40;
  dom.scrollWaechter = function (scroller) {
    const leer = { scroller: null, korrekturen: 0, eigen: (fn) => fn(), stop: () => {} };
    if (!scroller || typeof scroller.addEventListener !== 'function') return leer;

    let soll = scroller.scrollTop;
    let eigenesScrollen = false;
    const w = { scroller, korrekturen: 0 };

    const onScroll = () => {
      if (!eigenesScrollen && scroller.scrollTop > soll + dom.SCROLL_SPRUNG_PX) {
        scroller.scrollTop = soll;
        w.korrekturen++;
        return;
      }
      soll = scroller.scrollTop;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });

    w.eigen = function (fn) {
      eigenesScrollen = true;
      try {
        return fn();
      } finally {
        // Ein "instant"-Scroll setzt scrollTop sofort; das zugehoerige
        // scroll-Event kommt erst einen Frame spaeter und sieht dann keine
        // Abweichung mehr.
        soll = scroller.scrollTop;
        eigenesScrollen = false;
      }
    };
    w.stop = function () {
      scroller.removeEventListener('scroll', onScroll);
    };
    return w;
  };

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return {
      clientX: Math.round(r.left + r.width / 2),
      clientY: Math.round(r.top + r.height / 2)
    };
  }
  dom.centerOf = centerOf;

  /** Vollstaendige Klick-Sequenz an der Elementmitte. */
  dom.click = async function (el) {
    if (!el || !el.isConnected) return false;
    const at = centerOf(el);
    fire(el, 'pointerover', at);
    fire(el, 'pointerenter', at);
    fire(el, 'mouseover', at);
    fire(el, 'pointermove', at);
    fire(el, 'mousemove', at);
    fire(el, 'pointerdown', at);
    fire(el, 'mousedown', at);
    await dom.sleep(45);
    fire(el, 'pointerup', Object.assign({ buttons: 0 }, at));
    fire(el, 'mouseup', Object.assign({ buttons: 0 }, at));
    fire(el, 'click', Object.assign({ buttons: 0 }, at));
    return true;
  };

  /**
   * Mauszeiger auf ein Element setzen, ohne zu klicken.
   *
   * Snapchat blendet die Nachrichtenaktionen ("Löschen", "Nicht mehr im Chat
   * speichern") bereits beim Ueberfahren ein - Rechtsklick ist gar nicht noetig.
   * `mouseenter`/`pointerenter` bubbeln NICHT, deshalb werden sie einzeln auf
   * der Vorfahrenkette gefeuert; React haengt seine onMouseEnter-Logik zwar an
   * die Delegation von `mouseover`, aber manche Komponenten hoeren direkt.
   */
  /**
   * Tiefstes Element unter einem Punkt, das noch zu `el` gehoert.
   *
   * Mehrere Punkte probieren, weil ueber der Mitte einer Nachricht auch mal
   * etwas anderes liegen kann (eigenes HUD-Overlay, Bild-Overlay).
   */
  /** Traegt das Element selbst sichtbaren Inhalt (Text direkt darin, Bild, Video)? */
  function hatEigenenInhalt(n) {
    const tag = String(n.tagName || '').toLowerCase();
    if (tag === 'img' || tag === 'video' || tag === 'canvas') return true;
    if (n.childNodes) {
      for (const c of n.childNodes) {
        if (c.nodeType === 3 && c.nodeValue && c.nodeValue.trim()) return true;
      }
      return false;
    }
    // Test-Attrappe ohne childNodes: Blattknoten mit Text.
    return !(n.children && n.children.length) && !!(n.innerText || '').trim();
  }

  function inKopfzeile(n, el) {
    for (let p = n; p && p !== el; p = p.parentElement) {
      if (String(p.tagName || '').toLowerCase() === 'header') return true;
    }
    return false;
  }

  /**
   * Liegt n in einer TIEFEREN Listenzeile innerhalb von el? So steckt das
   * Zitat in einer Antwort in der Zeile - wer darauf zielt, bekommt die
   * Aktionen der ZITIERTEN Nachricht, nicht die der Antwort.
   */
  function inUnterzeile(n, el) {
    if (String(el.tagName || '').toLowerCase() !== 'li') return false;
    for (let p = n; p && p !== el; p = p.parentElement) {
      if (String(p.tagName || '').toLowerCase() === 'li') return true;
    }
    return false;
  }

  function tiefe(n, el) {
    let d = 0;
    for (let p = n; p && p !== el; p = p.parentElement) d++;
    return d;
  }

  /**
   * Tiefstes Element unter dem Zeiger, das noch zu `el` gehoert - gemessen an
   * Punkten, an denen wirklich INHALT liegt.
   *
   * Frueher zielte das nur auf die Mitte der Zeile. Die Zeile ist 300 px breit:
   * ein Snap fuellt sie aus, die Mitte trifft das Bild. Ein kurzer Text ("ok",
   * "😊") steht aber links und ist nur ein paar Pixel breit - in der Mitte liegt
   * leerer Zeilenhintergrund, und Snapchat blendet die Aktionsleiste nur ein,
   * wenn der Zeiger auf dem Inhalt selbst steht. Genau deshalb klappte es bei
   * Snaps und bei Textnachrichten nie (38-mal "keine Aktionsleiste").
   *
   * Deshalb zuerst die Mitte jedes Inhalts-Elements probieren (Text, Bild,
   * Video), dann wie bisher die Zeilenmitte. Gewonnen hat der TIEFSTE Treffer,
   * weil React onMouseEnter nur an das Ziel und dessen Vorfahren liefert. Die
   * Kopfzeile (Name, Uhrzeit) zaehlt nur im Notfall: sie ist nicht die Blase.
   */
  function deepestInside(el) {
    const punkte = [];
    let inhalt = [];
    try {
      inhalt = Array.from(el.querySelectorAll('*'));
    } catch (_) {
      inhalt = [];
    }
    for (const n of inhalt) {
      if (punkte.length >= 8) break;
      if (!hatEigenenInhalt(n) || inKopfzeile(n, el) || inUnterzeile(n, el)) continue;
      const nr = n.getBoundingClientRect();
      if (nr.width < 2 || nr.height < 2) continue;
      punkte.push([nr.left + nr.width / 2, nr.top + nr.height / 2]);
    }
    const r = el.getBoundingClientRect();
    for (const f of [0.5, 0.25, 0.75]) punkte.push([r.left + r.width / 2, r.top + r.height * f]);

    let besterInhalt = null;
    let besteTiefe = -1;
    let notfall = null;
    for (const [x, y] of punkte) {
      let hit = null;
      try {
        hit = document.elementFromPoint(Math.round(x), Math.round(y));
      } catch (_) {
        hit = null;
      }
      if (!hit || !(hit === el || el.contains(hit))) continue;
      if (inUnterzeile(hit, el)) continue;
      if (inKopfzeile(hit, el)) {
        if (!notfall) notfall = hit;
        continue;
      }
      const d = tiefe(hit, el);
      if (d > besteTiefe) {
        besteTiefe = d;
        besterInhalt = hit;
      }
    }
    return besterInhalt || notfall || el;
  }
  dom.deepestInside = deepestInside;

  dom.hover = async function (el) {
    if (!el || !el.isConnected) return false;

    // Auf das TIEFSTE Element unter dem Zeiger zielen, nicht auf die
    // Nachrichtenzeile selbst. React synthetisiert onMouseEnter nur fuer das
    // Ereignisziel und dessen VORFAHREN - dispatcht man auf der Zeile, sehen
    // die inneren Container, die den Hover-Zustand halten, nie ein Event.
    // Genau daran scheiterte die Aktionsleiste: mit echter Maus erschien sie,
    // mit synthetischen Events nicht.
    const target = deepestInside(el);
    const at = centerOf(target);
    const hoverInit = Object.assign({ buttons: 0 }, at);

    // enter-Kette von aussen nach innen, wie eine echte Maus sie erzeugt.
    const chain = [];
    for (let node = target, i = 0; node && i < 12; node = node.parentElement, i++) {
      chain.push(node);
      if (node === el) break;
    }
    for (const n of chain.reverse()) {
      fire(n, 'pointerenter', Object.assign({ bubbles: false }, hoverInit));
      fire(n, 'mouseenter', Object.assign({ bubbles: false }, hoverInit));
    }

    fire(target, 'pointerover', hoverInit);
    fire(target, 'mouseover', hoverInit);
    fire(target, 'pointermove', hoverInit);
    fire(target, 'mousemove', hoverInit);
    return true;
  };

  /**
   * Hover-Zustand wieder aufheben - das Gegenstueck zu dom.hover().
   *
   * Noetig, bevor das Aussehen einer Nachricht bewertet wird: Snapchat faerbt
   * die ueberfahrene Zeile ein, genau wie eine gespeicherte. Prueft man den
   * Hintergrund, ohne den eigenen Hover zurueckzunehmen, sieht jede gerade
   * bearbeitete Nachricht weiterhin "gespeichert" aus.
   */
  dom.unhover = async function (el) {
    if (!el || !el.isConnected) return false;
    const target = deepestInside(el);
    // relatedTarget soll ausserhalb liegen, damit React es als Verlassen des
    // Elements wertet. Nur setzen, wenn es ein echtes Event-Ziel ist - sonst
    // steigt der Event-Konstruktor mit einem TypeError aus. `null` ist auch
    // in Ordnung: React deutet das als "Zeiger hat das Fenster verlassen".
    const init = { buttons: 0, clientX: 0, clientY: 0 };
    if (typeof EventTarget !== 'undefined' && document.body instanceof EventTarget) {
      init.relatedTarget = document.body;
    }

    const chain = [];
    for (let node = target, i = 0; node && i < 12; node = node.parentElement, i++) {
      chain.push(node);
      if (node === el) break;
    }
    // leave-Kette von innen nach aussen - umgekehrt zu dom.hover().
    for (const n of chain) {
      fire(n, 'pointerleave', Object.assign({ bubbles: false }, init));
      fire(n, 'mouseleave', Object.assign({ bubbles: false }, init));
    }
    fire(target, 'pointerout', init);
    fire(target, 'mouseout', init);
    return true;
  };

  /** Rechtsklick (oeffnet bei Snapchat Web das Nachrichtenmenue). */
  dom.rightClick = async function (el) {
    if (!el || !el.isConnected) return false;
    const at = centerOf(el);
    fire(el, 'pointerover', at);
    fire(el, 'mouseover', at);
    fire(el, 'pointermove', at);
    fire(el, 'mousemove', at);
    fire(el, 'pointerdown', Object.assign({ button: 2, buttons: 2 }, at));
    fire(el, 'mousedown', Object.assign({ button: 2, buttons: 2 }, at));
    await dom.sleep(30);
    fire(el, 'pointerup', Object.assign({ button: 2, buttons: 0 }, at));
    fire(el, 'mouseup', Object.assign({ button: 2, buttons: 0 }, at));
    fire(el, 'contextmenu', Object.assign({ button: 2, buttons: 0 }, at));
    return true;
  };

  /** Langer Druck - Fallback fuer Komponenten mit Touch-Logik. */
  dom.longPress = async function (el, ms) {
    if (!el || !el.isConnected) return false;
    const at = centerOf(el);
    fire(el, 'pointerover', at);
    fire(el, 'mouseover', at);
    fire(el, 'pointermove', at);
    fire(el, 'pointerdown', at);
    fire(el, 'mousedown', at);
    await dom.sleep(ms || 650);
    fire(el, 'pointerup', Object.assign({ buttons: 0 }, at));
    fire(el, 'mouseup', Object.assign({ buttons: 0 }, at));
    return true;
  };

  dom.pressEscape = function () {
    for (const target of [document.activeElement || document.body, document.body]) {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true })
      );
      target.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true })
      );
    }
  };

  /** Kurzer, stabiler Fingerabdruck einer Nachricht (fuer Fehler-Blacklist). */
  dom.fingerprint = function (el) {
    const t = dom.textOf(el).slice(0, 120);
    let hash = 0;
    for (let i = 0; i < t.length; i++) {
      hash = (hash << 5) - hash + t.charCodeAt(i);
      hash |= 0;
    }
    const r = el.getBoundingClientRect();
    return `${hash}:${Math.round(r.width)}x${Math.round(r.height)}`;
  };

  /** CSS-Pfad fuer den Selektor-Picker. */
  dom.cssPath = function (el) {
    if (!el || el.nodeType !== 1) return '';
    for (const attr of ['data-testid', 'aria-label', 'role', 'id']) {
      const val = el.getAttribute(attr);
      if (val && val.length < 60) {
        const sel = attr === 'id' ? `#${CSS.escape(val)}` : `[${attr}="${CSS.escape(val)}"]`;
        try {
          if (document.querySelectorAll(sel).length > 0) return sel;
        } catch (_) {
          /* ignorieren */
        }
      }
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      const testid = node.getAttribute('data-testid');
      if (testid) {
        parts.unshift(`[data-testid="${CSS.escape(testid)}"]`);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
})();
