/**
 * Deleter: oeffnet je Nachricht das Kontextmenue, entspeichert bei Bedarf
 * und bestaetigt den Loeschdialog.
 *
 * Grundsaetze:
 *  - Nie einen Menuepunkt klicken, der auf der Verbotsliste steht.
 *  - Nach jedem Schritt neu im DOM suchen (React tauscht Knoten aus).
 *  - Bei Unklarheit abbrechen statt raten.
 */
(function () {
  'use strict';

  const SCDC = (window.SCDC = window.SCDC || {});
  const dom = SCDC.dom;
  const deleter = (SCDC.deleter = {});

  /** Alle offenen Popup-Container einsammeln (Menue oder Dialog). */
  function findOverlay(selectorKey) {
    const candidates = SCDC.activeSelectors[selectorKey];
    for (const sel of candidates) {
      let nodes = [];
      try {
        nodes = Array.from(document.querySelectorAll(sel));
      } catch (_) {
        continue;
      }
      const visible = nodes.filter(dom.isVisible);
      if (visible.length) return visible[visible.length - 1];
    }
    return null;
  }

  /**
   * Fallback-Erkennung eines Menues ohne role="menu":
   * ein neu erschienener, absolut positionierter Container, der einen
   * bekannten Menuepunkt-Text enthaelt.
   */
  function findMenuHeuristically() {
    const all = document.querySelectorAll('body > div, body > div *');
    const known = SCDC.activeLabels.delete.concat(SCDC.activeLabels.unsave);
    // Kontextmenue einer FREMDEN, nicht gespeicherten Nachricht: weder
    // "Löschen" noch "Nicht mehr speichern" - trotzdem ein echtes Menue, das
    // erkannt (und danach geschlossen) werden muss. Daran erkennbar, dass es
    // mindestens zwei typische Eintraege zugleich hat.
    const typisch = [
      ['im chat speichern', 'save in chat'],
      ['antworten', 'reply'],
      ['kopieren', 'copy'],
      ['reagieren', 'react']
    ];
    const istMenue = (text) =>
      dom.matchesAny(text, known) || typisch.filter((g) => dom.matchesAny(text, g)).length >= 2;
    let best = null;
    for (const el of all) {
      if (!dom.isVisible(el)) continue;
      const pos = getComputedStyle(el).position;
      if (pos !== 'absolute' && pos !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 80 || r.width > 460 || r.height < 30 || r.height > 520) continue;
      const text = dom.textOf(el);
      if (!istMenue(text)) continue;
      // Kleinsten passenden Container nehmen (das eigentliche Menue).
      if (!best || r.width * r.height < best.getBoundingClientRect().width * best.getBoundingClientRect().height) {
        best = el;
      }
    }
    return best;
  }

  deleter.waitForMenu = async function () {
    return dom.waitFor(
      () => findOverlay('menu') || findMenuHeuristically(),
      SCDC.timing.menuTimeout,
      60
    );
  };

  /**
   * Aktionen, die Snapchat direkt IN die Nachricht einblendet (statt in ein
   * Overlay). Dann ist die Nachricht selbst der "Menue"-Wurzelknoten.
   */
  function hasInlineActions(el) {
    // Bewusst nur anklickbare Knoten: sonst wuerde eine Chat-Nachricht, die das
    // Wort "löschen" enthaelt, faelschlich als eingeblendetes Menue gelten.
    const clickable = el.querySelectorAll('button, [role="button"], [role="menuitem"], [tabindex]');
    for (const node of clickable) {
      if (!dom.isVisible(node)) continue;
      const text = dom.textOf(node);
      if (!text || text.length > 80) continue;
      if (dom.matchesAny(text, SCDC.activeLabels.delete)) return true;
      if (dom.matchesAny(text, SCDC.activeLabels.unsave)) return true;
    }
    return false;
  }
  deleter.hasInlineActions = hasInlineActions; // fuer die Tests

  /**
   * Snapchat zeigt beim Hovern ueber eine Nachricht eine reine Icon-Toolbar
   * OHNE jeglichen Text/aria-label (nur <svg> in <button>s) - textbasierte
   * Menue-Erkennung (findOverlay/findMenuHeuristically) findet sowas nie.
   *
   * Per Screenshot bestaetigte Reihenfolge, IMMER gleich:
   *   [Reagieren, Speichern/Entspeichern-Toggle, Antworten, (Loeschen)]
   * Der Papierkorb (4. Icon) erscheint NUR bei eigenen Nachrichten - fremde
   * Nachrichten lassen sich bei Snapchat grundsaetzlich nur entspeichern,
   * nie loeschen. Das ist eine echte Grenze von Snapchat, kein Bug hier.
   *
   * Erkennung ist rein strukturell (Button ohne Text, mit <svg>, mehrere
   * Geschwister mit gemeinsamem Groesselternteil), damit gehashte Klassen
   * keine Rolle spielen.
   *
   * WICHTIG - `msg` ist Pflicht: Eine seitenweite Suche findet garantiert die
   * falsche Leiste. Snapchat Web hat mehrere Gruppen textloser Icon-Buttons
   * (Navigationsspalte, Kopfzeile, Eingabezeile), und die stehen alle FRUEHER
   * im DOM als die Nachricht. Genau daran ist die erste Fassung gescheitert:
   * sie griff die Emoji-/Sticker-Leiste der Eingabezeile ab, klickte dort auf
   * Position 2 und oeffnete damit die Emoji-Auswahl statt zu entspeichern.
   * Per echtem DOM-Dump bestaetigt liegt die Aktionsleiste INNERHALB der
   * Nachrichtenzeile (li > … > span > div.gFryU > div > button).
   */
  function collectToolbarGroups(root, mitUnsichtbaren) {
    const groups = new Map();
    let buttons = [];
    try {
      buttons = Array.from(root.querySelectorAll('button'));
    } catch (_) {
      return groups;
    }
    for (const btn of buttons) {
      if (!mitUnsichtbaren && !dom.isVisible(btn)) continue;
      if (dom.textOf(btn)) continue; // reine Icon-Buttons haben keinen Text
      if (!btn.querySelector('svg')) continue;
      const group = btn.parentElement && btn.parentElement.parentElement;
      if (!group) continue;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(btn);
    }
    return groups;
  }

  /** Ueberlappen sich zwei Rechtecke? (fuer Toolbars in einem Portal) */
  function overlaps(a, b) {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  function findIconToolbar(msg) {
    if (!msg) return null;

    const pick = (groups, filter) => {
      let best = null;
      for (const [group, buttons] of groups) {
        // Bis zu 5: Textnachrichten haben zusaetzlich "Kopieren" (per Foto belegt).
        if (buttons.length < 2 || buttons.length > 5) continue;
        if (!dom.isVisible(group)) continue;
        if (filter && !filter(group)) continue;
        // Groesste passende Gruppe gewinnt: die Aktionsleiste hat mehr Icons
        // als eine zufaellige Zweiergruppe im selben Bereich.
        if (!best || buttons.length > best.length) best = buttons;
      }
      return best;
    };

    // 1. Innerhalb der Nachricht - der bestaetigte Normalfall.
    const inside = pick(collectToolbarGroups(msg));
    if (inside) return inside;

    // 2. Fallback fuer den Fall, dass Snapchat die Leiste doch mal in ein
    //    Portal ausserhalb der Nachricht rendert: seitenweit suchen, aber NUR
    //    Gruppen akzeptieren, die die Nachricht auch wirklich ueberdecken.
    const msgRect = msg.getBoundingClientRect();
    return pick(collectToolbarGroups(document), (group) => overlaps(group.getBoundingClientRect(), msgRect));
  }
  deleter.findIconToolbar = findIconToolbar; // fuer die Tests

  /**
   * Die Aktionsleiste DIESER Nachricht, auch wenn sie unsichtbar ist.
   *
   * Blendet Snapchat die Leiste per CSS `:hover` ein, liegt sie die ganze Zeit
   * fertig im DOM und wird nur sichtbar, solange eine ECHTE Maus darueber
   * steht - per Skript laesst sich :hover grundsaetzlich nicht ausloesen. Genau
   * das ergab "es passiert nur etwas, wenn ich den Finger auf die Nachricht
   * lege". Klicken laesst sich ein unsichtbarer Button aber trotzdem: Reacts
   * Klick-Logik fragt nicht nach Sichtbarkeit.
   *
   * Bewusst NUR innerhalb der Nachricht (kein seitenweiter Rueckfall wie in
   * findIconToolbar): unsichtbar laesst sich nicht pruefen, ob eine Leiste die
   * Nachricht ueberdeckt, und eine fremde Leiste waere ein Fehlklick. Die
   * Anzahl (3/4) und das Umschalt-Icon werden danach genauso geprueft wie bei
   * einer sichtbaren Leiste.
   */
  deleter.findHiddenToolbar = function (msg) {
    if (!msg) return null;
    let best = null;
    for (const [, buttons] of collectToolbarGroups(msg, true)) {
      if (buttons.length < 3 || buttons.length > 5) continue;
      if (!best || buttons.length > best.length) best = buttons;
    }
    return best;
  };

  /**
   * Icon-Buttons, die zwar im DOM stehen, aber unsichtbar sind.
   *
   * Unterscheidet zwei sehr verschiedene Fehlerursachen, die sonst beide als
   * "kein Menü" erscheinen:
   *  - 0 versteckte Buttons: die Leiste wird gar nicht erst gerendert, der
   *    Hover kam also nicht an.
   *  - >0: die Leiste ist da, aber ausgeblendet - dann haengt die Sichtbarkeit
   *    an CSS `:hover`, und das laesst sich per Skript grundsaetzlich nicht
   *    ausloesen (nur echte Mausbewegungen setzen :hover).
   */
  function hiddenIconButtons(el) {
    let n = 0;
    let buttons = [];
    try {
      buttons = Array.from(el.querySelectorAll('button'));
    } catch (_) {
      return 0;
    }
    for (const btn of buttons) {
      if (dom.textOf(btn)) continue;
      if (!btn.querySelector('svg')) continue;
      if (!dom.isVisible(btn)) n++;
    }
    return n;
  }
  deleter.hiddenIconButtons = hiddenIconButtons; // fuer die Tests

  /**
   * Hat der Hover in diesem Lauf schon einmal eine Aktionsleiste geoeffnet?
   * Ist er einmal bewiesen, heisst "keine Leiste" nicht mehr "falsche Technik",
   * sondern "das ist keine Nachricht" - siehe openMenu.
   */
  deleter.hoverWorked = false;
  deleter.textNurPerRechtsklick = false;
  deleter.letzterWeg = '';
  /** Aktiver dom.scrollWaechter waehrend eines Laufs, sonst null. */
  deleter.scrollSchutz = null;
  deleter.resetHoverProof = function () {
    deleter.hoverWorked = false;
    deleter.textNurPerRechtsklick = false;
  };

  /** Duerfen Rechtsklick/Langdruck noch versucht werden? Siehe openMenu. */
  deleter.mayUseFallbacks = function () {
    return !deleter.hoverWorked;
  };

  /**
   * Keine Aktionsleiste - war das ein Fehlschlag oder gar keine Nachricht?
   *
   * Der Unterschied entscheidet, ob der Lauf abbricht: vier Fehlschlaege in
   * Folge gelten als "Snapchat blockiert die Ansicht". Zeilen, die nie eine
   * Nachricht waren (das Zitat in einer Antwort etwa), duerfen diesen Zaehler
   * nicht fuellen - sonst stirbt ein gesunder Lauf an einer Handvoll Zitate.
   * Umgekehrt bleibt ein echter Fehlschlag erkennbar: ausgeblendete Symbole
   * heissen "Leiste ist da, kommt aber nicht durch", und solange der Hover
   * ueberhaupt noch nichts geoeffnet hat, ist jeder Fehlversuch verdaechtig.
   */
  deleter.classifyMissingMenu = function (hidden) {
    if (deleter.hoverWorked && !hidden) return { ok: false, reason: 'keine-nachricht' };
    return {
      ok: false,
      menuFailure: true,
      reason: hidden ? `toolbar-da-aber-unsichtbar(${hidden})` : 'kein-menue'
    };
  };

  /**
   * Menue oeffnen. Reihenfolge nach beobachtetem Verhalten:
   * Hover blendet die Aktionen bereits ein - Rechtsklick ist nur Fallback.
   * Gibt entweder ein DOM-Element (klassisches Menue) oder
   * `{ toolbar: [...Buttons] }` (Icon-Toolbar) zurueck.
   */
  deleter.openMenu = async function (el) {
    // Nur scrollen, wenn die Zeile nicht schon ganz zu sehen ist: bei jeder
    // Nachricht die Scroll-Pause abzuwarten kostete Zeit, ohne etwas zu bewirken.
    const schutz = deleter.scrollSchutz;
    if (!dom.isInViewport(el, schutz && schutz.scroller)) {
      const scrollen = () =>
        el.scrollIntoView({ block: 'center', behavior: 'instant' in Element.prototype ? 'instant' : 'auto' });
      if (schutz) schutz.eigen(scrollen);
      else scrollen();
      await dom.sleep(SCDC.timing.afterScroll);
    }

    // Hat sich in diesem Lauf schon gezeigt, dass Textnachrichten nur per
    // Rechtsklick ein Menue bekommen, gar nicht erst 1,5 s auf die Leiste warten.
    if (deleter.textNurPerRechtsklick && istTextzeile(el)) {
      const direkt = await deleter.openContextMenu(el);
      if (direkt) return direkt;
    }

    // 1. Hover - der normale Weg bei Snapchat Web.
    await dom.hover(el);
    // Die Leiste wird eingeblendet. Wer mitten in der Animation zugreift,
    // sieht nur einen Teil der Symbole - und eine Leiste mit unerwarteter
    // Anzahl wird (zu Recht) nicht angefasst. Deshalb erst akzeptieren, wenn
    // die Anzahl zweimal hintereinander gleich ist.
    let letzteAnzahl = -1;
    let menu = await dom.waitFor(() => {
      const toolbar = findIconToolbar(el);
      if (toolbar) {
        if (toolbar.length === letzteAnzahl) return { toolbar };
        letzteAnzahl = toolbar.length;
        return null;
      }
      letzteAnzahl = -1;
      return findOverlay('menu') || findMenuHeuristically() || (hasInlineActions(el) ? el : null);
    }, SCDC.timing.hoverTimeout, 60);
    if (menu) {
      if (menu.toolbar) deleter.hoverWorked = true;
      deleter.letzterWeg = menu.toolbar ? 'leiste' : 'menue';
      return menu;
    }

    // Leiste vorhanden, aber nur per CSS :hover sichtbar? Dann die
    // unsichtbaren Buttons benutzen (siehe findHiddenToolbar).
    const versteckt = deleter.findHiddenToolbar(el);
    if (versteckt) {
      deleter.letzterWeg = 'versteckte-leiste';
      return { toolbar: versteckt, hidden: true };
    }

    // 2. Hover-Aktionsbutton ("…"/"Mehr"), falls die Aktionen dahinter liegen.
    //    Nur solange der Hover noch nicht bewiesen ist (siehe unten).
    if (deleter.mayUseFallbacks()) {
      const more = Array.from(el.querySelectorAll('button, [role="button"]')).find((b) =>
        dom.matchesAny(dom.textOf(b), ['mehr', 'more', 'optionen', 'options', '…', '...'])
      );
      if (more) {
        await dom.click(more);
        menu = await deleter.waitForMenu();
        if (menu) {
          deleter.letzterWeg = 'mehr-button';
          return menu;
        }
      }
    }

    // 3. Rechtsklick - auch wenn der Hover bei anderen Nachrichten klappt.
    //    Per Diagnose belegt: bei Textnachrichten erscheint die Leiste auf
    //    den simulierten Zeiger nicht (bei Snaps schon), Snapchats
    //    Kontextmenue mit "Löschen"/"Nicht mehr im Chat speichern" oeffnet
    //    sich aber. Frueher war der Rechtsklick nach bewiesenem Hover
    //    gesperrt, weil er auf zitierten Vorschauen in Antworten landete -
    //    die sind heute keine eigenen Zeilen mehr (Tiefenregel im Scanner),
    //    und gezielt wird nur noch auf Inhalt dieser Zeile (dom.deepestInside).
    menu = await deleter.openContextMenu(el);
    if (menu) {
      // Lernen auch dann, wenn der Hover in diesem Lauf noch nie geklappt hat:
      // in einem reinen Textchat gibt es keinen Snap, der ihn beweisen koennte,
      // und dann kostete JEDE Nachricht erst 1,5 s vergebliches Warten.
      if (istTextzeile(el)) deleter.textNurPerRechtsklick = true;
      return menu;
    }

    if (!deleter.mayUseFallbacks()) return hasInlineActions(el) ? el : null;

    // 4. Langer Druck (Touch-Logik).
    await dom.longPress(el, SCDC.timing.longPress);
    menu = await deleter.waitForMenu();
    if (menu) {
      deleter.letzterWeg = 'langer-druck';
      return menu;
    }

    return hasInlineActions(el) ? el : null;
  };

  function istTextzeile(el) {
    try {
      return SCDC.scanner.classify(el).type === 'text';
    } catch (_) {
      return false;
    }
  }

  /**
   * Snapchats Kontextmenue per Rechtsklick auf den INHALT der Zeile.
   *
   * Nicht auf die Zeilenmitte: in einer Antwort laege dort womoeglich das
   * Zitat, und dessen Menue gehoert zur zitierten Nachricht - ein "Löschen"
   * darin traefe die falsche. Oeffnet sich etwas, das nicht als Menue erkannt
   * wird, wird es geschlossen, damit es die naechsten Schritte nicht blockiert.
   */
  deleter.openContextMenu = async function (el) {
    const ziel = dom.deepestInside(el);
    await dom.rightClick(ziel);
    const menu = await deleter.waitForMenu();
    if (menu) {
      deleter.letzterWeg = 'rechtsklick';
      return menu;
    }
    await deleter.closeMenu();
    return null;
  };

  deleter.closeMenu = async function () {
    dom.pressEscape();
    await dom.sleep(150);
    if (findOverlay('menu')) {
      // Klick ins Leere ausserhalb des Menues.
      const at = { clientX: 4, clientY: Math.round(window.innerHeight / 2) };
      dom.fire(document.body, 'pointerdown', at);
      dom.fire(document.body, 'mousedown', at);
      dom.fire(document.body, 'pointerup', Object.assign({ buttons: 0 }, at));
      dom.fire(document.body, 'mouseup', Object.assign({ buttons: 0 }, at));
      dom.fire(document.body, 'click', Object.assign({ buttons: 0 }, at));
      await dom.sleep(150);
    }
  };

  /**
   * Sucht einen klickbaren Eintrag, dessen Text zu `labels` passt und der NICHT
   * auf der Verbotsliste steht. Nimmt den kleinsten passenden Knoten, damit
   * nicht versehentlich der ganze Menuecontainer geklickt wird.
   *
   * `opts.exclude` schliesst zusaetzlich Eintraege aus, die zu einer anderen
   * Label-Gruppe gehoeren. Noetig, weil sich Begriffe ueberschneiden: das
   * Delete-Label "remove" passt auch auf "Remove from saved" - stuenden beide
   * im Menue, entschiede sonst die Elementgroesse, also der Zufall.
   */
  deleter.findItem = function (root, labels, opts) {
    if (!root) return null;
    const exclude = (opts && opts.exclude) || null;
    const forbidden = SCDC.activeLabels.forbidden;
    const pool = new Set();
    for (const sel of SCDC.activeSelectors.menuItem) {
      try {
        for (const n of root.querySelectorAll(sel)) pool.add(n);
      } catch (_) {
        /* ignorieren */
      }
    }
    if (!pool.size) {
      for (const n of root.querySelectorAll('*')) pool.add(n);
    }

    let best = null;
    let bestArea = Infinity;
    for (const node of pool) {
      if (!dom.isVisible(node)) continue;
      const text = dom.textOf(node);
      if (!text || text.length > 80) continue;
      if (!dom.matchesAny(text, labels)) continue;
      if (exclude && dom.matchesAny(text, exclude)) continue;

      // Verbotene Aktionen ausschliessen - aber nur, wenn der verbotene Begriff
      // nicht selbst Teil des gesuchten Treffers ist ("speichern" vs "nicht mehr speichern").
      const isForbidden = forbidden.some((f) => {
        const nf = dom.norm(f);
        if (!text.includes(nf)) return false;
        return !labels.some((l) => dom.norm(l).includes(nf) && text.includes(dom.norm(l)));
      });
      if (isForbidden) continue;

      const r = node.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > 0 && area < bestArea) {
        best = node;
        bestArea = area;
      }
    }
    return best;
  };

  /**
   * Ob Snapchat nach einer Aktion nachfragt, ist vorher nicht bekannt - und das
   * Warten darauf war der mit Abstand groesste Zeitfresser: kommt kein Dialog,
   * verfaellt bei JEDER Nachricht der volle dialogTimeout (2,6 s), also mehr als
   * der ganze Rest des Durchlaufs zusammen. Kein Tempo half dagegen, weil eine
   * Obergrenze nicht schneller wird, wenn man sie kuerzt - sie verfaellt nur
   * frueher.
   *
   * Also nachmessen statt raten: die ersten Male voll abwarten, und wenn dabei
   * nie ein Dialog kam, danach nur noch kurz nachsehen. Taucht doch einer auf,
   * gilt sofort wieder die volle Obergrenze.
   *
   * Getrennt je Aktionsart: gut moeglich, dass Snapchat beim Loeschen nachfragt,
   * beim Entspeichern aber nicht. Mit einem gemeinsamen Zaehler wuerde die eine
   * Beobachtung die andere Aktion unnoetig ausbremsen.
   */
  const DIALOG_PROBE_AFTER = 2; // so viele dialoglose Durchlaeufe genuegen als Beleg
  // Bewusst NICHT vom Tempo abhaengig: wie lange ein Dialog braucht, um
  // aufzutauchen, ist eine Eigenschaft von Snapchat, keine Geschmacksfrage.
  // Vorher wurde ohnehin schon afterMenuClick abgewartet - zusammen reicht das
  // reichlich fuer einen Dialog, der noch kommt.
  const DIALOG_PROBE_MS = 900; // danach nur noch so lange nachsehen
  const dialogProbes = Object.create(null);

  function probeFor(kind) {
    const k = kind || 'default';
    if (!dialogProbes[k]) dialogProbes[k] = { seen: false, misses: 0 };
    return dialogProbes[k];
  }

  deleter.resetDialogProbes = function () {
    for (const k of Object.keys(dialogProbes)) delete dialogProbes[k];
  };

  /** Beobachtung festhalten: kam bei dieser Aktionsart ein Dialog oder nicht? */
  deleter.noteDialogResult = function (kind, hadDialog) {
    const probe = probeFor(kind);
    if (hadDialog) {
      // Einmal gesehen heisst: hier wird nachgefragt. Ab jetzt wieder voll warten.
      probe.seen = true;
      probe.misses = 0;
    } else {
      probe.misses++;
    }
  };

  /** Wie lange auf einen Dialog gewartet wird - voll oder nur noch kurz. */
  deleter.dialogTimeoutFor = function (kind) {
    const probe = probeFor(kind);
    const voll = SCDC.timing.dialogTimeout;
    if (probe.seen || probe.misses < DIALOG_PROBE_AFTER) return voll;
    return Math.min(DIALOG_PROBE_MS, voll);
  };

  /** Bestaetigungsdialog abarbeiten. Kein Dialog = kein Fehler. */
  deleter.confirmDialog = async function (kind) {
    const dialog = await dom.waitFor(() => findOverlay('dialog'), deleter.dialogTimeoutFor(kind), 50);
    deleter.noteDialogResult(kind, !!dialog);
    if (!dialog) return { confirmed: false, hadDialog: false };

    const btn = deleter.findItem(dialog, SCDC.activeLabels.confirmDelete);
    if (!btn) {
      dom.pressEscape();
      return { confirmed: false, hadDialog: true };
    }
    await dom.click(btn);
    // Warten, bis der Dialog weg ist - nicht pauschal: meist ist er nach
    // wenigen Hundertstelsekunden zu, und ein noch offener Dialog wuerde den
    // naechsten Rechtsklick abfangen.
    await dom.waitFor(() => !dialog.isConnected || !dom.isVisible(dialog), 1500, 50);
    return { confirmed: true, hadDialog: true };
  };

  /**
   * Findet den Aktions-Button in einem Menue - egal ob klassisches Text-Menue
   * oder Snapchats textlose Icon-Toolbar (siehe findIconToolbar).
   *
   * Bei der Icon-Toolbar gilt die per Screenshot bestaetigte, feste
   * Reihenfolge [Reagieren, Speichern/Entspeichern, Antworten, (Loeschen)] -
   * Loeschen (Index 3) existiert dort nur, wenn wirklich 4 Icons da sind.
   *
   * Nur die bestaetigten Groessen 3 (fremde Nachricht) und 4 (eigene) werden
   * akzeptiert. Bei jeder anderen Anzahl ist die Zuordnung Position->Aktion
   * geraten - und ein Fehlklick waere hier sichtbar (Index 0 sendet eine
   * Reaktion, Index 2 oeffnet die Antwort). Lieber melden als raten.
   */
  /**
   * Speicherstatus aus dem Umschalt-Icon der Aktionsleiste lesen.
   *
   * Das ist die einzige verlaessliche Quelle (siehe SCDC.ICON_PATHS). Ist das
   * Icon unbekannt, wird KEIN Status geraten: ein Fehlgriff wuerde eine
   * ungespeicherte Nachricht speichern statt zu entspeichern.
   */
  deleter.savedStateFromToolbar = function (toolbar) {
    if (!toolbar || toolbar.length < 3 || toolbar.length > 5) {
      return { known: false, path: '' };
    }
    const p = toolbar[1].querySelector('path');
    const d = (p && p.getAttribute('d')) || '';
    const kurz = d.slice(0, 24);
    const beginntMit = (list) => (list || []).some((sig) => d.startsWith(sig));
    if (beginntMit(SCDC.ICON_PATHS.saved)) return { known: true, saved: true, path: kurz };
    if (beginntMit(SCDC.ICON_PATHS.unsaved)) return { known: true, saved: false, path: kurz };
    return { known: false, path: kurz };
  };

  /**
   * Eigene oder fremde Nachricht - abgelesen an der Aktionsleiste.
   *
   * Der Papierkorb (4. Symbol) erscheint ausschliesslich bei eigenen
   * Nachrichten; fremde bekommen nur [Reagieren, Speichern, Antworten].
   * Das ist die einzige verlaessliche Auskunft: am DOM selbst ist die Herkunft
   * nicht ablesbar, und die frueher benutzte Ausrichtung ("eigene stehen
   * rechts") stimmt bei Snapchat Web nicht - dort stehen beide Seiten links.
   * Genau daran wurden eigene Nachrichten als "fremde Nachricht, nicht
   * gespeichert" uebersprungen.
   *
   * null = keine Aussage (klassisches Textmenue oder unerwartete Anzahl).
   */
  deleter.ownFromToolbar = function (menu) {
    if (!menu || !menu.toolbar) return null;
    // 5 = eigene Textnachricht [Reagieren, Speichern, Antworten, Kopieren, Papierkorb].
    if (menu.toolbar.length === 5) return true;
    // 4 ist doppeldeutig: eigener Snap [.., Papierkorb] ODER fremde
    // Textnachricht [.., Kopieren] (per Diagnose belegt). Das letzte Symbol
    // entscheidet.
    if (menu.toolbar.length === 4) return !istKopieren(menu.toolbar[3]);
    if (menu.toolbar.length === 3) return false;
    return null;
  };

  /** Ist dieser Button das "Kopieren"-Symbol? (Nur Textnachrichten haben es.) */
  function istKopieren(btn) {
    if (!btn || typeof btn.querySelector !== 'function') return false;
    const p = btn.querySelector('path');
    const d = (p && p.getAttribute('d')) || '';
    return (SCDC.ICON_PATHS.copy || []).some((sig) => d.startsWith(sig));
  }
  deleter.istKopieren = istKopieren; // fuer die Tests

  /**
   * Eigene Nachricht? Fuer beide Menue-Arten.
   *
   * Leiste: siehe ownFromToolbar. Klassisches Kontextmenue (Rechtsklick, der
   * Weg bei Textnachrichten, deren Leiste auf den simulierten Zeiger nicht
   * erscheint): "Löschen" bietet Snapchat nur bei eigenen Nachrichten an.
   */
  deleter.ownFromMenu = function (menu) {
    if (!menu) return null;
    if (menu.toolbar) return deleter.ownFromToolbar(menu);
    return !!deleter.pickAction(menu, 'delete');
  };

  deleter.pickAction = function (menu, kind) {
    if (menu && menu.toolbar) {
      const t = menu.toolbar;
      if (t.length < 3 || t.length > 5) return null;
      if (kind === 'unsave') return t[1];
      // Der Papierkorb ist immer das LETZTE Symbol: Index 3 bei Snaps (4 Symbole),
      // Index 4 bei Textnachrichten (5 Symbole, mit "Kopieren" davor).
      if (kind === 'delete') {
        if (t.length === 5) return t[4];
        // Bei der fremden Textnachricht sitzt hier "Kopieren", kein Papierkorb.
        if (t.length === 4) return istKopieren(t[3]) ? null : t[3];
        return null;
      }
      return null;
    }
    if (kind === 'unsave') return deleter.findItem(menu, SCDC.activeLabels.unsave);
    // Unsave-Eintraege ausschliessen, damit nicht "Remove from saved" als
    // Loeschen durchgeht (siehe findItem-Kommentar zu opts.exclude).
    if (kind === 'delete') return deleter.findItem(menu, SCDC.activeLabels.delete, { exclude: SCDC.activeLabels.unsave });
    return null;
  };

  /**
   * Loescht eine einzelne Nachricht.
   * Gespeicherte Inhalte werden zuerst entspeichert, sonst blockiert Snapchat
   * das Loeschen bzw. der Menuepunkt fehlt.
   *
   * Wichtige Snapchat-Grenze (per Screenshot bestaetigt): fuer FREMDE
   * Nachrichten gibt es UEBERHAUPT KEIN Loeschen, nur Entspeichern. Das ist
   * keine Einschraenkung der Extension, sondern von Snapchat selbst - wird
   * hier deshalb nicht mehr als Fehler behandelt, sondern als vollstaendige
   * Aktion gewertet, sobald entspeichert wurde.
   */
  async function runDeleteMessage(target, opts) {
    const options = opts || {};
    const el = target.el;
    if (!el || !el.isConnected) return { ok: false, reason: 'weg' };

    let menu = await deleter.openMenu(el);
    if (!menu) {
      return deleter.classifyMissingMenu(hiddenIconButtons(el));
    }

    // Ob eine Nachricht gespeichert ist, steht erst hier fest: nur die
    // geoeffnete Aktionsleiste verraet es (ueber ihr Umschalt-Icon). Der Wert
    // aus dem Scan ist bloss ein Keyword-Treffer und meist unbekannt.
    const status = menu.toolbar ? deleter.savedStateFromToolbar(menu.toolbar) : null;
    // Klassisches Kontextmenue: gespeichert ist, was "Nicht mehr im Chat
    // speichern" anbietet.
    let istGespeichert = status
      ? status.known && status.saved
      : !!deleter.pickAction(menu, 'unsave') || !!target.saved;

    // Eigene Textnachricht (5 Symbole, per Foto belegt): ihr Speichern-Symbol
    // ist eine Sprechblase statt des Lesezeichens und noch nicht bekannt. Das
    // macht hier aber nichts - es wird gar nicht angefasst, sondern direkt der
    // Papierkorb geklickt. Ein Klick auf den Papierkorb aendert den
    // Speicherstatus nicht, und eigene Nachrichten lassen sich auch gespeichert
    // loeschen. Raten waere nur am Umschalter gefaehrlich.
    if (status && !status.known && menu.toolbar.length === 5) {
      istGespeichert = false;
    } else if (status && !status.known) {
      await deleter.closeMenu();
      const n = menu.toolbar.length;
      // Nicht raten: an Position 2 sitzt der Speichern-Umschalter, und ein
      // Fehlgriff wuerde eine ungespeicherte Nachricht speichern - das sieht
      // das Gegenueber.
      return { ok: false, reason: `speicher-status-unbekannt(${n} Symbole, ${status.path})` };
    }

    // Herkunft genauso: die Aktionsleiste weiss es, `target.own` hat nur
    // geraten. Das Ergebnis geht als `own` zurueck, damit der Aufrufer es sich
    // fuer alle weiteren Nachrichten desselben Absenders merken kann.
    const ausLeiste = deleter.ownFromMenu(menu);
    const istEigen = ausLeiste === null ? !!target.own : ausLeiste;

    if (options.onlyOwn && !istEigen) {
      await deleter.closeMenu();
      return { ok: false, own: istEigen, reason: 'fremde-nachricht-uebersprungen' };
    }

    if (!istEigen && !istGespeichert) {
      // Nichts zu tun: weder eigene Nachricht (loeschbar) noch gespeichert
      // (entspeicherbar).
      await deleter.closeMenu();
      return { ok: false, own: istEigen, reason: 'fremde-nachricht-nicht-gespeichert' };
    }

    // Eigene Nachricht, und "Löschen" wird schon angeboten? Dann direkt
    // loeschen. Snapchat loescht eigene Nachrichten auch gespeichert, beidseitig
    // - vorher zu entspeichern kostete pro Nachricht einen zweiten Klick, eine
    // Dialogprobe und ein zweites Menue, ohne am Ergebnis etwas zu aendern.
    // Fehlt der Eintrag (weil Snapchat ihn bei Gespeichertem verbirgt), bleibt
    // es beim Weg ueber das Entspeichern.
    // Schritt 1: entspeichern, falls noetig.
    if (deleter.mussErstEntspeichern(menu, istEigen, istGespeichert)) {
      const unsave = deleter.pickAction(menu, 'unsave');
      if (!unsave) {
        await deleter.closeMenu();
        // Anzahl mitgeben: nur so ist erkennbar, WELCHE Leiste Snapchat hier
        // zeigt - bekannt sind 3 (fremde Nachricht) und 4 (eigene).
        const n = menu && menu.toolbar ? menu.toolbar.length : 0;
        return { ok: false, own: istEigen, reason: `kein-entspeichern-icon(${n} Symbole)` };
      }
      await dom.click(unsave);
      await dom.sleep(SCDC.timing.afterMenuClick);
      await deleter.confirmDialog('unsave');
      await dom.pause(SCDC.timing.afterMenuClick);

      // Verifizieren statt hoffen - und zwar an derselben Quelle, die den
      // Status ueberhaupt hergibt: das Umschalt-Icon muss jetzt "speichern"
      // zeigen. Der frueher benutzte Hintergrundvergleich taugte dafuer nicht,
      // weil die Nachrichtenblase immer gleich eingefaerbt ist.
      if (el.isConnected) {
        await dom.unhover(el);
        await dom.sleep(SCDC.timing.afterMenuClick);
        const nachher = await deleter.openMenu(el);
        if (nachher && nachher.toolbar) {
          const s2 = deleter.savedStateFromToolbar(nachher.toolbar);
          if (!s2.known || s2.saved) {
            await deleter.closeMenu();
            return { ok: false, own: istEigen, reason: 'entspeichern-ohne-wirkung' };
          }
          menu = nachher;
        } else if (nachher) {
          // Kontextmenue: bietet es immer noch "Nicht mehr speichern" an,
          // hat der Klick nichts bewirkt.
          if (deleter.pickAction(nachher, 'unsave')) {
            await deleter.closeMenu();
            return { ok: false, own: istEigen, reason: 'entspeichern-ohne-wirkung' };
          }
          menu = nachher;
        } else if (!menu.toolbar) {
          // Das alte Kontextmenue ist mit dem Klick zugegangen - darin laesst
          // sich nichts mehr anklicken.
          menu = null;
        }
      }

      if (!istEigen) {
        // Ein offenes Kontextmenue legt sich ueber die Seite - schliessen.
        if (menu && !menu.toolbar) await deleter.closeMenu();
        return { ok: true, own: istEigen, unsavedOnly: true };
      }
      if (!el.isConnected) return { ok: true, own: istEigen, unsavedOnly: true };
      if (!menu) return { ok: false, own: istEigen, menuFailure: true, reason: 'kein-menue-nach-unsave' };
    }

    // Schritt 2: loeschen (nur bei eigenen Nachrichten moeglich).
    const del = deleter.pickAction(menu, 'delete');
    if (!del) {
      await deleter.closeMenu();
      return { ok: false, own: istEigen, reason: 'kein-loeschen-eintrag' };
    }
    await dom.click(del);
    // Kein fester Schlaf: confirmDialog fragt ohnehin laufend nach dem Dialog.

    const res = await deleter.confirmDialog('delete');
    if (res.hadDialog && !res.confirmed) {
      await deleter.closeMenu();
      return { ok: false, own: istEigen, reason: 'dialog-unklar' };
    }

    await dom.pause(SCDC.timing.betweenDeletes);
    return { ok: true, own: istEigen };
  }

  /** Siehe Schritt 1 in runDeleteMessage. */
  deleter.mussErstEntspeichern = function (menu, istEigen, istGespeichert) {
    if (!istGespeichert) return false;
    return !(istEigen && deleter.pickAction(menu, 'delete'));
  };

  /** Mittlere Dauer der letzten (bis zu 12) Nachrichten in Sekunden, 0 = noch keine. */
  deleter.sekundenProNachricht = function (dauern) {
    const letzte = dauern.slice(-12);
    if (!letzte.length) return 0;
    return letzte.reduce((a, b) => a + b, 0) / letzte.length / 1000;
  };

  /** 45 -> "45 s", 200 -> "3 min 20 s", 4000 -> "1 h 7 min". */
  deleter.formatDauer = function (sekunden) {
    const s = Math.max(0, Math.round(sekunden));
    if (s < 60) return `${s} s`;
    if (s < 3600) {
      const rest = s % 60;
      return `${Math.floor(s / 60)} min${rest ? ` ${rest} s` : ''}`;
    }
    const min = Math.round((s % 3600) / 60);
    return `${Math.floor(s / 3600)} h${min ? ` ${min} min` : ''}`;
  };

  deleter.deleteMessage = async function (target, opts) {
    try {
      return await runDeleteMessage(target, opts);
    } finally {
      // Den eigenen Hover nie stehen lassen: eine ueberfahrene Zeile ist
      // eingefaerbt wie eine gespeicherte und wuerde in der naechsten Runde
      // als "gespeichert" durchgehen.
      if (target && target.el && target.el.isConnected) await dom.unhover(target.el);
    }
  };

  /**
   * Loescht alle Treffer in der offenen Konversation.
   * Arbeitet von unten nach oben und sucht nach jedem Schritt neu, weil die
   * virtualisierte Liste Knoten wiederverwendet.
   */
  deleter.runOnConversation = async function (config) {
    const container = dom.findConversation();
    if (!container) return { deleted: 0, failed: 0, error: 'Kein Chatbereich gefunden.' };

    // Was ueber Bestaetigungsdialoge und den Hover gelernt wurde, gilt pro
    // Konversation neu.
    deleter.resetDialogProbes();
    deleter.resetHoverProof();

    // Snapchats Sprung ans Chatende nach jedem Loeschen abfangen (siehe
    // dom.scrollWaechter). Der Chatbereich ist selbst der Scroller.
    const scroller =
      container.scrollHeight > container.clientHeight ? container : dom.findScrollContainer() || container;
    deleter.scrollSchutz = dom.scrollWaechter(scroller);
    try {
      return await laufen(container, config);
    } finally {
      deleter.scrollSchutz.stop();
      deleter.scrollSchutz = null;
    }
  };

  async function laufen(container, config) {
    const skip = new Set();
    // Dauer der letzten Nachrichten in ms - Grundlage fuer Tempoanzeige und ETA.
    const dauern = [];
    let deleted = 0;
    let failed = 0;
    // Fremde Nachrichten koennen bei Snapchat nur entspeichert, nie geloescht
    // werden. Getrennt zaehlen, damit die Meldung am Ende nicht "geloescht"
    // behauptet, wo tatsaechlich nur entspeichert wurde.
    let unsaved = 0;
    // Gruende der Fehlschlaege mitzaehlen: "0 erledigt, 1 übersprungen" allein
    // sagt nichts darueber, WORAN es lag.
    const reasons = Object.create(null);
    let guard = 0;
    let consecutiveMenuFailures = 0;
    const limit = config.maxDeletions > 0 ? config.maxDeletions : Infinity;
    // Menue-Oeffnen ist der Schritt, der am ehesten an einer blockierten Seite
    // scheitert (z. B. Snapchats "Abwesend"-Sperre). Statt sich durch
    // Hunderte Nachrichten stumm durchzuscheitern, nach ein paar Fehlschlagen
    // in Folge klar melden statt weiterzuraten.
    const MENU_FAILURE_LIMIT = 4;

    while (guard < 5000) {
      guard++;
      if (SCDC.state.abort) break;
      if (deleted >= limit) break;
      if (consecutiveMenuFailures >= MENU_FAILURE_LIMIT) {
        return {
          deleted,
          failed,
          unsaved,
          reasons,
          blocked: true,
          error:
            'Kontextmenü ließ sich mehrfach nicht öffnen. Vermutlich blockiert Snapchat die Ansicht (z. B. weil der Tab kurz nicht im Vordergrund war) oder die Selektoren passen nicht mehr. Tab aktiv im Vordergrund lassen und erneut versuchen, notfalls Selektoren in den Einstellungen prüfen.'
        };
      }

      const targets = SCDC.scanner.collectTargets(container, config.types, config.onlyOwn, skip);
      if (!targets.length) {
        // Schon im ERSTEN Durchgang nichts gefunden? Dann lag es nicht daran,
        // dass alles abgearbeitet ist - dann hat die Erkennung versagt. Das
        // muss als Diagnose raus statt als stilles "0 gelöscht, 0 übersprungen".
        //
        // Die Herkunft spielt hier bewusst KEINE Rolle mehr: sie steht erst
        // beim Ueberfahren fest, `onlyOwn` filtert an dieser Stelle also
        // nichts (siehe scanner.collectTargets).
        if (guard === 1) {
          const seen = SCDC.scanner.findMessages(container).length;
          const typen = config.types.join(', ');
          return {
            deleted,
            failed,
            nothingMatched: true,
            error:
              `Keine passende Nachricht gefunden. Im Chat-Bereich wurden ${seen} Elemente als Nachrichten erkannt, ` +
              `aber keines davon als Typ [${typen}] eingestuft. ` +
              (seen === 0
                ? 'Da 0 Nachrichten erkannt wurden, passt der Chat-Bereich-Selektor nicht zum aktuellen Snapchat-Layout.'
                : 'Die Nachrichten werden also gefunden, aber falsch klassifiziert.') +
              ' Bitte in den Einstellungen die Diagnose starten.'
          };
        }
        break;
      }

      const target = targets[targets.length - 1]; // von unten nach oben
      // Tempo mitschreiben: sonst laesst sich nicht beurteilen, ob eine andere
      // Tempo-Einstellung ueberhaupt etwas bringt.
      // ETA aus den letzten Nachrichten statt aus dem ganzen Lauf: die ersten
      // sind langsamer (Dialog- und Hover-Proben), danach wird es schneller.
      const sProNachricht = deleter.sekundenProNachricht(dauern);
      const proNachricht = sProNachricht ? ` · ${sProNachricht.toFixed(1)} s/Nachricht` : '';
      const eta = sProNachricht
        ? ` · noch ca. ${deleter.formatDauer(sProNachricht * Math.min(targets.length, limit - deleted))}`
        : '';
      SCDC.hud.setStatus(`Lösche … ${deleted} erledigt, ${targets.length} offen${proNachricht}${eta}`);
      SCDC.hud.highlight(target.el);

      if (config.dryRun) {
        target.el.dataset.scdcDone = '1';
        target.el.classList.add('scdc-marked');
        deleted++;
        consecutiveMenuFailures = 0;
        await dom.sleep(60);
        continue;
      }

      const nachrichtStart = Date.now();
      const res = await deleter.deleteMessage(target, { onlyOwn: config.onlyOwn });
      // Was die Aktionsleiste ueber die Herkunft verraten hat, gilt ab jetzt
      // fuer alle Nachrichten desselben Absenders - ohne sie einzeln
      // ueberfahren zu muessen. In einem Zweierchat genuegt so ein Hover je
      // Seite, danach laeuft der Rest ohne Leerlauf durch.
      if (typeof res.own === 'boolean') SCDC.scanner.rememberSender(target.el, res.own);
      if (res.ok) {
        deleted++;
        if (res.unsavedOnly) unsaved++;
        consecutiveMenuFailures = 0;
        if (target.el.isConnected) target.el.dataset.scdcDone = '1';
      } else {
        failed++;
        reasons[res.reason] = (reasons[res.reason] || 0) + 1;
        if (res.menuFailure) consecutiveMenuFailures++;
        else consecutiveMenuFailures = 0;
        skip.add(dom.fingerprint(target.el));
        if (target.el.isConnected) target.el.dataset.scdcDone = '1';
        SCDC.hud.log(`Übersprungen (${res.reason})`);
        await dom.sleep(Math.min(250, SCDC.timing.afterMenuClick));
      }
      dauern.push(Date.now() - nachrichtStart);
      SCDC.state.progress = { deleted, failed };
      SCDC.persist();
    }

    // Sonderfall klar benennen: nichts erledigt, und alles Uebersprungene lag
    // allein an "Nur meine Nachrichten". Als blosses "0 erledigt, N
    // übersprungen" sieht das nach einem Fehler aus, ist aber der Normalfall
    // in jedem Chat, in dem die gesuchten Inhalte vom Gegenueber stammen.
    if (!deleted && failed && reasons['fremde-nachricht-uebersprungen'] === failed) {
      return {
        deleted,
        failed,
        unsaved,
        reasons,
        nothingMatched: true,
        error:
          `${failed} passende Nachricht(en) gefunden, aber alle stammen von deinem Gegenüber ` +
          '(erkannt an der Aktionsleiste: nur eigene Nachrichten haben ein Löschen-Symbol). ' +
          'Mit „Nur meine Nachrichten (beidseitige Löschung)“ wird davon nichts angefasst. ' +
          'Snapchat erlaubt bei fremden Nachrichten ohnehin kein Löschen – nur Entspeichern. ' +
          'Deaktiviere die Option, um sie wenigstens zu entspeichern.'
      };
    }

    return { deleted, failed, unsaved, reasons };
  }
})();
