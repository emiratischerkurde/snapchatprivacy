// Mini-DOM-Stub, um die Menue-Auswahl und die Klassifizierung ohne Browser zu pruefen.

var failures = 0;
function check(name, actual, expected) {
  var ok = actual === expected;
  if (!ok) failures++;
  print((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '  -> erwartet ' + expected + ', bekam ' + actual));
}

function El(text, opts) {
  opts = opts || {};
  this.text = text || '';
  this.innerText = this.text;
  this.textContent = this.text;
  this.tag = opts.tag || 'div';
  this.role = opts.role || null;
  this.ariaLabel = opts.ariaLabel || null;
  this.title = opts.title || null;
  this.imgAlt = opts.imgAlt || null; // simuliert ein <img alt="..."> Kind
  this.children = opts.children || [];
  this.isConnected = true;
  this.w = opts.w === undefined ? 180 : opts.w;
  this.h = opts.h === undefined ? 34 : opts.h;
  this.left = opts.left === undefined ? 0 : opts.left;
  this.bg = opts.bg === undefined ? '' : opts.bg; // simulierte background-color
  this.opacity = opts.opacity === undefined ? '1' : opts.opacity;
  this.id = opts.id || '';
  this.overflowY = opts.overflowY || 'visible';
  this.scrollHeight = opts.scrollHeight || 0;
  this.clientHeight = opts.clientHeight || 0;
  this.parentElement = null;
  this.previousElementSibling = null;
  this.nextElementSibling = null;
  this.tagName = this.tag.toUpperCase();
  for (var ci = 0; ci < this.children.length; ci++) {
    this.children[ci].parentElement = this;
    if (ci > 0) {
      this.children[ci].previousElementSibling = this.children[ci - 1];
      this.children[ci - 1].nextElementSibling = this.children[ci];
    }
  }
  this.dataset = {};
  this.classList = { add: function () {}, remove: function () {}, contains: function () { return false; } };
}
El.prototype.getAttribute = function (n) {
  if (n === 'role') return this.role;
  if (n === 'aria-label') return this.ariaLabel;
  if (n === 'title') return this.title;
  if (n === 'alt') return this.imgAlt;
  if (n === 'd') return this.d || null; // SVG-Pfad, fuer die Icon-Erkennung
  return null;
};
El.prototype.getBoundingClientRect = function () {
  return { width: this.w, height: this.h, left: this.left, top: 0, right: this.left + this.w, bottom: this.h };
};
El.prototype.descendants = function () {
  var out = [];
  for (var i = 0; i < this.children.length; i++) {
    out.push(this.children[i]);
    out = out.concat(this.children[i].descendants());
  }
  return out;
};
El.prototype.querySelectorAll = function (sel) {
  if (sel === 'img[alt], [aria-label]') {
    var out = [];
    if (this.imgAlt) out.push({ getAttribute: function (n) { return n === 'alt' ? this.imgAlt : null; }.bind(this) });
    return out;
  }
  // Kommagetrennte Selektoren wie 'button, [role="button"], [tabindex]' als ODER.
  var parts = sel.split(',').map(function (s) { return s.trim(); });
  function matchesOne(c, one) {
    if (one === '*') return true;
    if (one === '[role="menuitem"]') return c.role === 'menuitem';
    if (one === '[role="button"]') return c.role === 'button';
    if (one === 'li') return c.tag === 'li';
    if (one === 'button') return c.tag === 'button';
    if (one === 'video') return c.tag === 'video';
    if (one === 'audio') return c.tag === 'audio';
    if (one === 'img') return c.tag === 'img';
    if (one === 'svg') return c.tag === 'svg';
    if (one === 'path') return c.tag === 'path';
    if (one === 'header') return c.tag === 'header';
    if (one === 'time') return c.tag === 'time';
    if (one === '[id^="cv-"]') return (c.id || '').indexOf('cv-') === 0;
    if (one === 'main') return c.tag === 'main';
    // Die alte, engere Regel: <li> mit <header> als DIREKTEM Kind.
    if (one === 'li:has(> header)') {
      return c.tag === 'li' && c.children.some(function (k) { return k.tag === 'header'; });
    }
    if (one === '[tabindex]') return c.tag === 'tabindex-el';
    return false;
  }
  return this.descendants().filter(function (c) {
    return parts.some(function (one) { return matchesOne(c, one); });
  });
};
El.prototype.querySelector = function (sel) {
  var r = this.querySelectorAll(sel);
  return r.length ? r[0] : null;
};
El.prototype.contains = function (other) {
  return other === this || this.descendants().indexOf(other) !== -1;
};
El.prototype.dispatchEvent = function (ev) {
  (this.events = this.events || []).push(ev.type);
  return true;
};

// Globale Browser-Stubs
var window = this;
var document = {
  // __root simuliert "der Rest der Seite" - damit laesst sich pruefen, dass die
  // Toolbar-Suche NICHT seitenweit zugreift (siehe Emoji-Menue-Regression).
  __root: null,
  querySelector: function (sel) { return this.__root ? this.__root.querySelector(sel) : null; },
  querySelectorAll: function (sel) { return this.__root ? this.__root.querySelectorAll(sel) : []; },
  // __hit simuliert, was unter dem Mauszeiger liegt (fuer dom.deepestInside).
  __hit: null,
  // __hitAt(x, y) simuliert koordinatengenau, was wo liegt.
  __hitAt: null,
  elementFromPoint: function (x, y) { return this.__hitAt ? this.__hitAt(x, y) : this.__hit; },
  addEventListener: function () {},
  body: new El('', { bg: 'rgb(24, 24, 24)' })
};
function getComputedStyle(el) {
  return {
    visibility: 'visible',
    display: 'block',
    opacity: '1',
    overflowY: el && el.overflowY ? el.overflowY : 'visible',
    position: 'static',
    textAlign: 'left',
    opacity: el && el.opacity !== undefined ? el.opacity : '1',
    backgroundColor: el && el.bg !== undefined ? el.bg : ''
  };
}
var chrome = { storage: { local: { get: function () { return { then: function (f) { f({}); } }; }, set: function () {} } }, runtime: { onMessage: { addListener: function () {} } } };

// Event-Konstruktoren als Attrappe. In JavaScriptCore gibt es keine
// DOM-Events; im Browser gaebe es echte, die aber ein echtes EventTarget
// verlangen. Bewusst in BEIDEN Umgebungen der Stub, damit der Test ueberall
// dasselbe prueft: dom.fire() reicht das Objekt nur an dispatchEvent()
// weiter, und dort wird ausschliesslich `type` ausgewertet.
function StubEvent(type, init) {
  this.type = type;
  for (var k in init || {}) this[k] = init[k];
}
var Event = StubEvent;
var MouseEvent = StubEvent;
var PointerEvent = StubEvent;
var KeyboardEvent = StubEvent;

load('content/config.js');
load('content/dom.js');
load('content/scanner.js');
// deleter.js braucht SCDC.hud/scanner nur zur Laufzeit, nicht beim Laden.
window.SCDC.hud = { setStatus: function () {}, log: function () {}, highlight: function () {}, clearMarks: function () {}, clearHighlight: function () {} };
window.SCDC.state = { abort: false };
load('content/deleter.js');

var SCDC = window.SCDC;
var L = SCDC.activeLabels;

print('--- Menue-Auswahl ---');

// 1. Normales Nachrichtenmenue: "Löschen" muss gefunden werden.
var menu1 = new El('', { children: [
  new El('Antworten', { role: 'menuitem' }),
  new El('Weiterleiten', { role: 'menuitem' }),
  new El('Löschen', { role: 'menuitem' })
]});
var hit1 = SCDC.deleter.findItem(menu1, L.delete);
check('findet "Löschen"', hit1 && hit1.text, 'Löschen');

// 2. Menue mit "Chat löschen" daneben: darf NUR das einzelne "Löschen" treffen.
var menu2 = new El('', { children: [
  new El('Chat löschen', { role: 'menuitem' }),
  new El('Löschen', { role: 'menuitem' })
]});
var hit2 = SCDC.deleter.findItem(menu2, L.delete);
check('waehlt Nachricht statt Chat', hit2 && hit2.text, 'Löschen');

// 3. Menue mit NUR "Chat löschen": muss null liefern, nicht die Unterhaltung killen.
var menu3 = new El('', { children: [
  new El('Chat löschen', { role: 'menuitem' }),
  new El('Blockieren', { role: 'menuitem' })
]});
var hit3 = SCDC.deleter.findItem(menu3, L.delete);
check('klickt "Chat löschen" NICHT', hit3, null);

// 4. "Nicht mehr speichern" darf nicht am Verbot "speichern" scheitern.
var menu4 = new El('', { children: [
  new El('Nicht mehr speichern', { role: 'menuitem' }),
  new El('Löschen', { role: 'menuitem' })
]});
var hit4 = SCDC.deleter.findItem(menu4, L.unsave);
check('findet "Nicht mehr speichern"', hit4 && hit4.text, 'Nicht mehr speichern');

// 5. "Im Chat speichern" darf NICHT als Unsave durchgehen.
var menu5 = new El('', { children: [
  new El('Im Chat speichern', { role: 'menuitem' }),
  new El('Löschen', { role: 'menuitem' })
]});
var hit5 = SCDC.deleter.findItem(menu5, L.unsave);
check('klickt "Im Chat speichern" NICHT', hit5, null);

// 6. Gefaehrliche Eintraege bleiben tabu.
var menu6 = new El('', { children: [
  new El('Melden', { role: 'menuitem' }),
  new El('Freund entfernen', { role: 'menuitem' }),
  new El('Konto löschen', { role: 'menuitem' })
]});
check('klickt "Konto löschen" NICHT', SCDC.deleter.findItem(menu6, L.delete), null);

// 7. Englische Oberflaeche.
var menu7 = new El('', { children: [
  new El('Reply', { role: 'menuitem' }),
  new El('Delete', { role: 'menuitem' })
]});
var hit7 = SCDC.deleter.findItem(menu7, L.delete);
check('findet "Delete" (EN)', hit7 && hit7.text, 'Delete');

// 8. Realer Wortlaut: "Nicht mehr im Chat speichern" (nicht "nicht mehr speichern").
var menu8 = new El('', { children: [
  new El('Nicht mehr im Chat speichern', { role: 'menuitem' }),
  new El('Löschen', { role: 'menuitem' })
]});
var hit8 = SCDC.deleter.findItem(menu8, L.unsave);
check('findet "Nicht mehr im Chat speichern"', hit8 && hit8.text, 'Nicht mehr im Chat speichern');

// 9. "Remove from saved" darf nicht als Löschen durchgehen (Label "remove").
var menu9 = new El('', { children: [
  new El('Remove from saved', { role: 'menuitem' }),
  new El('Delete', { role: 'menuitem' })
]});
var hit9 = SCDC.deleter.findItem(menu9, L.delete, { exclude: L.unsave });
check('wählt "Delete" statt "Remove from saved"', hit9 && hit9.text, 'Delete');

print('--- Icon-Toolbar (Snapchat zeigt hier KEINEN Text, nur SVG-Icons) ---');

// Reihenfolge per Screenshot bestaetigt: [Reagieren, Speichern/Entspeichern,
// Antworten, (Loeschen)]. Loeschen existiert nur bei 4 Icons (eigene Nachricht).
var toolbar3 = { toolbar: ['react', 'unsave-oder-save', 'reply'] }; // fremde Nachricht
check('Toolbar mit 3 Icons: Index 1 ist Speichern/Entspeichern', SCDC.deleter.pickAction(toolbar3, 'unsave'), 'unsave-oder-save');
check('Toolbar mit 3 Icons: KEIN Loeschen verfuegbar', SCDC.deleter.pickAction(toolbar3, 'delete'), null);

var toolbar4 = { toolbar: ['react', 'unsave-oder-save', 'reply', 'trash'] }; // eigene Nachricht
check('Toolbar mit 4 Icons: Index 1 ist Speichern/Entspeichern', SCDC.deleter.pickAction(toolbar4, 'unsave'), 'unsave-oder-save');
check('Toolbar mit 4 Icons: letztes Icon ist Loeschen', SCDC.deleter.pickAction(toolbar4, 'delete'), 'trash');

// Ungewohnte Icon-Anzahl: lieber melden als raten. Ein Fehlklick waere hier
// sichtbar (Index 0 sendet eine Reaktion, Index 2 oeffnet die Antwort).
// Textnachricht (per Foto belegt): [Reagieren, Speichern, Antworten, Kopieren,
// Papierkorb]. Frueher wurden nur 3/4 Symbole akzeptiert - die Fuenferleiste
// galt als "keine Aktionsleiste", und eigene Texte wurden nie geloescht.
var toolbar5 = { toolbar: ['react', 'save', 'reply', 'copy', 'trash'] };
check('Textnachricht (5 Icons): Papierkorb ist das letzte, nicht "Kopieren"', SCDC.deleter.pickAction(toolbar5, 'delete'), 'trash');
check('Textnachricht (5 Icons) gilt als eigene', SCDC.deleter.ownFromToolbar(toolbar5), true);
var leiste5 = iconToolbarEl(5);
check('Fuenferleiste wird als Aktionsleiste gefunden', (SCDC.deleter.findIconToolbar(new El('', { children: [leiste5] })) || []).length, 5);

var toolbar2 = { toolbar: ['a', 'b'] };
check('Toolbar mit 2 Icons: kein Raten beim Entspeichern', SCDC.deleter.pickAction(toolbar2, 'unsave'), null);

// Klassisches Text-Menue faellt weiterhin auf findItem() zurueck.
var klassischesMenu = new El('', { children: [new El('Löschen', { role: 'menuitem' })] });
var pickKlassisch = SCDC.deleter.pickAction(klassischesMenu, 'delete');
check('Text-Menue faellt auf findItem() zurueck', pickKlassisch && pickKlassisch.text, 'Löschen');

// --- Regression: Toolbar-Suche darf NICHT seitenweit laufen ---
// Erste Fassung nahm die erste Gruppe textloser Icon-Buttons im gesamten
// Dokument. Snapchats Eingabezeile/Navigation steht frueher im DOM als die
// Nachricht - Ergebnis: Klick auf Position 2 dieser fremden Leiste, also
// Emoji-Auswahl statt Entspeichern, und trotzdem "erfolgreich" gemeldet.
function iconButton() {
  return new El('', { tag: 'button', children: [new El('', { tag: 'svg' })] });
}
function iconToolbarEl(anzahl, opts) {
  var wrappers = [];
  for (var i = 0; i < anzahl; i++) wrappers.push(new El('', { children: [iconButton()] }));
  return new El('', Object.assign({ children: wrappers }, opts || {}));
}

var eigeneToolbar = iconToolbarEl(3);
var nachrichtMitToolbar = new El('', { left: 500, w: 100, children: [eigeneToolbar] });
var gefunden = SCDC.deleter.findIconToolbar(nachrichtMitToolbar);
check('Toolbar in der Nachricht wird gefunden', gefunden && gefunden.length, 3);
check('gefundene Buttons stammen aus der Nachricht', gefunden && gefunden[1].parentElement.parentElement, eigeneToolbar);

// Fremde Leiste woanders auf der Seite (Eingabezeile), ohne Ueberlappung.
var fremdeLeiste = iconToolbarEl(4, { left: 0, w: 180 });
document.__root = new El('', { children: [fremdeLeiste] });

var nachrichtOhneToolbar = new El('', { left: 500, w: 100, children: [new El('nur Text')] });
check(
  'fremde Icon-Leiste woanders auf der Seite wird NICHT genommen',
  SCDC.deleter.findIconToolbar(nachrichtOhneToolbar),
  null
);

// Gegenprobe: liegt die Leiste ueber der Nachricht (Portal-Rendering),
// ist sie plausibel und darf genutzt werden.
var portalLeiste = iconToolbarEl(3, { left: 500, w: 180 });
document.__root = new El('', { children: [portalLeiste] });
var ausPortal = SCDC.deleter.findIconToolbar(nachrichtOhneToolbar);
check('ueberlappende Leiste (Portal) wird akzeptiert', ausPortal && ausPortal.length, 3);

document.__root = null;

// --- Ausgeblendete Leiste von "gar keine Leiste" unterscheiden ---
// Beides sah bisher wie "kein Menü" aus, hat aber voellig verschiedene
// Ursachen: nicht gerendert (Hover kam nicht an) vs. per CSS :hover
// ausgeblendet (per Skript grundsaetzlich nicht ausloesbar).
var unsichtbareLeiste = iconToolbarEl(3);
unsichtbareLeiste.descendants().forEach(function (n) { if (n.tag === 'button') n.opacity = '0'; });
var nachrichtMitVersteckterLeiste = new El('', { children: [unsichtbareLeiste] });
check('ausgeblendete Icon-Buttons werden gezaehlt', SCDC.deleter.hiddenIconButtons(nachrichtMitVersteckterLeiste), 3);
check('ausgeblendete Leiste gilt nicht als gefunden', SCDC.deleter.findIconToolbar(nachrichtMitVersteckterLeiste), null);
check('sichtbare Leiste zaehlt nicht als versteckt', SCDC.deleter.hiddenIconButtons(nachrichtMitToolbar), 0);

// Leiste nur per CSS :hover sichtbar: sie liegt fertig im DOM und laesst sich
// klicken - nur sehen kann man sie ohne echte Maus nicht.
check('unsichtbare Leiste in der Nachricht wird trotzdem gefunden', (SCDC.deleter.findHiddenToolbar(nachrichtMitVersteckterLeiste) || []).length, 3);
var nurZweiVersteckt = iconToolbarEl(2);
nurZweiVersteckt.descendants().forEach(function (n) { if (n.tag === 'button') n.opacity = '0'; });
check('unsichtbare Leiste mit unerwarteter Anzahl wird NICHT benutzt', SCDC.deleter.findHiddenToolbar(new El('', { children: [nurZweiVersteckt] })), null);
// Kein seitenweiter Rueckfall: eine fremde unsichtbare Leiste waere ein Fehlklick.
var fremdVersteckt = iconToolbarEl(3, { left: 500, w: 180 });
fremdVersteckt.descendants().forEach(function (n) { if (n.tag === 'button') n.opacity = '0'; });
document.__root = new El('', { children: [fremdVersteckt] });
check('unsichtbare Leiste ausserhalb der Nachricht wird NICHT benutzt', SCDC.deleter.findHiddenToolbar(new El('', { left: 500, w: 100 })), null);
document.__root = null;

print('--- Hover-Ziel (React liefert onMouseEnter nur an Vorfahren) ---');

// Regression: dom.hover() feuerte auf der Nachrichtenzeile selbst. React
// synthetisiert onMouseEnter aber nur fuer das Ereignisziel und dessen
// VORFAHREN - die inneren Container, die den Hover-Zustand halten, sahen nie
// ein Event. Deshalb erschien die Leiste nur bei echter Maus.
var innerstes = new El('Bild', { tag: 'img' });
var nachrichtTief = new El('', { children: [new El('', { children: [innerstes] })] });

document.__hit = innerstes;
check('zielt auf das tiefste Element unter dem Zeiger', SCDC.dom.deepestInside(nachrichtTief), innerstes);

// Liegt etwas Fremdes darueber (eigenes HUD-Overlay), nicht blind zuschlagen.
document.__hit = new El('HUD');
check('fremdes Overlay wird nicht als Ziel genommen', SCDC.dom.deepestInside(nachrichtTief), nachrichtTief);

document.__hit = null;
check('ohne Treffer bleibt die Nachricht das Ziel', SCDC.dom.deepestInside(nachrichtTief), nachrichtTief);

// Regression: gezielt wurde nur auf die Zeilenmitte. Bei einem kurzen Text
// ("ok", "😊") liegt dort leerer Zeilenhintergrund - die Aktionsleiste kam nie
// (38-mal "keine Aktionsleiste"), waehrend Snaps die Zeile ausfuellen und
// deshalb funktionierten. Jetzt zaehlt der Punkt, an dem der Text steht.
var kurzerText = new El('ok', { tag: 'span', left: 0, w: 20, h: 20 });
var blase = new El('', { w: 300, h: 22, children: [kurzerText] });
var kopfzeile = new El('miro 12:33', { tag: 'header', w: 300, h: 13 });
var textZeile = new El('', { tag: 'li', w: 300, h: 40, children: [kopfzeile, blase] });
document.__hitAt = function (x) { return x < 25 ? kurzerText : blase; };
check('kurzer Text: Zeiger zielt auf den Text, nicht auf die leere Mitte', SCDC.dom.deepestInside(textZeile), kurzerText);

// Die Kopfzeile (Name, Uhrzeit) ist nicht die Blase - nur im Notfall nehmen.
document.__hitAt = function (x) { return x < 25 ? kopfzeile : blase; };
check('Kopfzeile wird nicht der Blase vorgezogen', SCDC.dom.deepestInside(textZeile), blase);
document.__hitAt = function () { return kopfzeile; };
check('nur Kopfzeile getroffen: besser als gar nichts', SCDC.dom.deepestInside(textZeile), kopfzeile);

// Antwort mit Zitat: das Zitat steckt als tiefere Listenzeile in der Zeile.
// Darauf zu zielen oeffnete die Aktionen der ZITIERTEN Nachricht - ein
// "Löschen" dort traefe die falsche.
var zitatText = new El('alte nachricht', { tag: 'span', left: 0, w: 120, h: 20 });
var zitat = new El('', { tag: 'li', w: 280, h: 30, children: [new El('', { children: [zitatText] })] });
var antwortText = new El('meine antwort', { tag: 'span', left: 150, w: 100, h: 20 });
var antwortZeile = new El('', { tag: 'li', w: 300, h: 60, children: [new El('', { tag: 'ul', children: [zitat] }), antwortText] });
document.__hitAt = function (x) { return x < 130 ? zitatText : antwortText; };
check('Antwort: Zeiger zielt auf die Antwort, nicht auf das Zitat', SCDC.dom.deepestInside(antwortZeile), antwortText);
document.__hitAt = null;

// Gegenstueck: der eigene Hover MUSS zurueckgenommen werden, sonst bleibt die
// Zeile eingefaerbt und die Erfolgspruefung haelt ein gegluecktes
// Entspeichern faelschlich fuer wirkungslos.
var innen = new El('Bild', { tag: 'img' });
var mitte = new El('', { children: [innen] });
var aussen = new El('', { children: [mitte] });
document.__hit = innen;
SCDC.dom.unhover(aussen);
document.__hit = null;

function hat(el, typ) { return (el.events || []).indexOf(typ) !== -1; }
check('unhover meldet Verlassen am innersten Element', hat(innen, 'mouseleave'), true);
check('unhover meldet Verlassen auch an der Nachrichtenzeile', hat(aussen, 'mouseleave'), true);
check('unhover sendet zusaetzlich mouseout', hat(innen, 'mouseout'), true);

print('--- Eingeblendete Aktionen (Hover-Menü in der Nachricht) ---');

// Snapchat blendet die Aktionen beim Hover ein, teils direkt in der Zeile.
// Dann gilt die Nachricht selbst als Menü-Wurzel.
var msgMitAktionen = new El('', { children: [
  new El('«Nachrichtentext»'),
  new El('Löschen', { tag: 'button' })
]});
check('Nachricht mit Löschen-Button = eingeblendete Aktionen', SCDC.deleter.hasInlineActions(msgMitAktionen), true);

var msgMitUnsaveButton = new El('', { children: [
  new El('Nicht mehr im Chat speichern', { tag: 'button' })
]});
check('Nachricht mit Unsave-Button erkannt', SCDC.deleter.hasInlineActions(msgMitUnsaveButton), true);

// Gegenprobe: eine Nachricht, deren TEXT zufällig "löschen" enthält, darf NICHT
// als eingeblendetes Menü gelten - sonst würde in blanken Text geklickt.
var msgNurText = new El('', { children: [
  new El('kannst du das bitte löschen')
]});
check('bloßer Text "löschen" ist kein Menü', SCDC.deleter.hasInlineActions(msgNurText), false);

var msgOhneAlles = new El('', { children: [new El('alles klar')] });
check('normale Nachricht ohne Aktionen', SCDC.deleter.hasInlineActions(msgOhneAlles), false);

print('--- Klassifizierung ---');

function classifyText(t) { return SCDC.scanner.classify(new El(t)).type; }
function savedFlag(t) { return SCDC.scanner.classify(new El(t)).flags.saved; }

check('Statuslabel "Snap" -> snap_photo', classifyText('Snap ⋅ 2 Std.'), 'snap_photo');
check('"Video-Notiz" -> video_note', classifyText('Video-Notiz'), 'video_note');
check('"Sprachnachricht" -> audio_note', classifyText('Sprachnachricht ⋅ 0:12'), 'audio_note');
check('"Video-Snap" -> snap_video', classifyText('Video-Snap ⋅ Geöffnet'), 'snap_video');
check('"Audio Note" (EN) -> audio_note', classifyText('Audio Note'), 'audio_note');
check(
  'langer Satz mit "snap" bleibt Text',
  classifyText('hey schick mir mal nen snap von dem konzert gestern abend das war doch bestimmt cool'),
  'text'
);
check('kurze Textnachricht bleibt Text', classifyText('alles klar bis später'), 'text');
check('"Gespeichert" setzt Flag', savedFlag('Gespeichert ⋅ Snap'), true);
check('normaler Text ohne Flag', savedFlag('bis morgen'), false);

// Regression: verkettetes aria-label/title/innerText/alt (dom.textOf) wurde
// als EIN String geprueft und ueberschritt bei Snapchats langen aria-labels
// fast immer die Laengengrenze - dadurch fiel praktisch alles auf "text"
// zurueck. Jetzt wird jede Quelle EINZELN geprueft (dom.candidates).
var verboseSnap = new El('Foto-Snap von Max, vor 3 Stunden gesendet, zum Ansehen tippen und halten', {
  ariaLabel: 'Snap',
  title: 'Foto-Snap, geöffnet, vor 3 Stunden gesendet, zum Ansehen bitte hier tippen und halten'
});
check('langes aria-label + kurzes Label -> snap_photo erkannt', SCDC.scanner.classify(verboseSnap).type, 'snap_photo');

var verboseAudio = new El('Diese Nachricht enthält eine Sprachnachricht von deinem Kontakt, tippe zum Anhören', {
  imgAlt: 'Audio-Notiz'
});
check('kurzer Bild-Alt-Text zwischen langem Fliesstext -> audio_note', SCDC.scanner.classify(verboseAudio).type, 'audio_note');

var verboseSaved = new El('Ein ziemlich langer Satz der nur beschreibt was in diesem Chat passiert ist', {
  title: 'Gespeichert'
});
check('kurzer title="Gespeichert" trotz langem Fliesstext erkannt', SCDC.scanner.classify(verboseSaved).flags.saved, true);

// Regression: Der Hintergrund taugt NICHT als "gespeichert"-Signal. Per
// Diagnose an echten Nachrichten gemessen: gespeicherte und nicht
// gespeicherte Nachrichten haben identisch rgb(51, 50, 50) auf der Blase.
// Eine frueherere Fassung hat daraus "hebt sich ab == gespeichert"
// geschlossen und dadurch JEDE Nachricht als gespeichert eingestuft.
var blaseWieImmer = new El('', {
  w: 300,
  h: 318,
  children: [new El('', { tag: 'header', w: 300, h: 18 }), new El('', { w: 300, h: 300, bg: 'rgb(51, 50, 50)' })]
});
check('abweichende Blasenfarbe allein bedeutet NICHT gespeichert', SCDC.scanner.classify(blaseWieImmer).flags.saved, false);

print('--- Speicherstatus am Umschalt-Icon ablesen ---');

// Die einzige verlaessliche Quelle. Pfadanfaenge aus der Diagnose an echten
// Nachrichten: mit Schraegstrich = gespeichert, ohne = nicht gespeichert.
function toolbarMitIcon(d, anzahl) {
  var buttons = [];
  for (var i = 0; i < (anzahl || 3); i++) {
    var pfad = new El('', { tag: 'path' });
    pfad.d = i === 1 ? d : 'M0 0';
    buttons.push(new El('', { tag: 'button', children: [pfad] }));
  }
  return buttons;
}

var gespeichertIcon = toolbarMitIcon('M18.742 4.576a.696.696 0 0 0-.984-.984l-.99.99a3.652 3.652');
var s1 = SCDC.deleter.savedStateFromToolbar(gespeichertIcon);
check('Icon mit Schraegstrich -> gespeichert', s1.known && s1.saved, true);

var offenIcon = toolbarMitIcon('M5.47 7.627c0-1.973 1.634-3.545 3.613-3.545h5.834');
var s2 = SCDC.deleter.savedStateFromToolbar(offenIcon);
check('Icon ohne Schraegstrich -> nicht gespeichert', s2.known && !s2.saved, true);

// Unbekanntes Icon: NICHT raten. Ein Fehlgriff wuerde speichern statt
// entspeichern - und das sieht das Gegenueber.
var fremdIcon = toolbarMitIcon('M1 2c3-4 5-6 7-8');
var s3 = SCDC.deleter.savedStateFromToolbar(fremdIcon);
check('unbekanntes Icon liefert keinen Status', s3.known, false);
check('unbekanntes Icon meldet den Pfadanfang zurueck', s3.path, 'M1 2c3-4 5-6 7-8');

// Bei unerwarteter Symbolanzahl ist Position 2 nicht verlaesslich der
// Umschalter - dann gar keine Aussage treffen.
check('unerwartete Symbolanzahl liefert keinen Status', SCDC.deleter.savedStateFromToolbar(toolbarMitIcon('M18.742 4.576', 2)).known, false);
check('Toolbar mit 4 Symbolen wird ausgewertet', SCDC.deleter.savedStateFromToolbar(toolbarMitIcon('M18.742 4.576', 4)).saved, true);

print('--- Gruppierte Nachrichten finden ---');

// Regression: Der Selektor verlangte 'li:has(> header)'. Snapchat fasst
// aufeinanderfolgende Nachrichten desselben Absenders aber zu einer Gruppe
// zusammen und gibt nur der ERSTEN eine Kopfzeile. Die Zeilen darunter wurden
// nie gefunden - sie tauchten erst im naechsten Lauf auf, wenn die Zeile
// darueber weg war. Deshalb waren mehrere Durchlaeufe noetig.
function zeile(opts) {
  return new El('', Object.assign({ tag: 'li' }, opts || {}));
}
var kopf = new El('hannah thomassen 12:33', { tag: 'header' });
var ersteZeile = zeile({ children: [kopf, new El('erste')] });
var zweiteZeile = zeile({ children: [new El('zweite')] }); // KEINE Kopfzeile
var dritteZeile = zeile({ children: [new El('dritte')] });
var datumsTrenner = zeile({ children: [new El('Gestern', { tag: 'time' })] });
var gruppe = zeile({
  children: [new El('', { children: [ersteZeile, zweiteZeile, dritteZeile] })]
});
var liste = new El('', { w: 400, children: [datumsTrenner, gruppe] });

var zeilen = SCDC.scanner.messageRows(liste);
check('alle drei Zeilen der Gruppe werden gefunden', zeilen.length, 3);
check('die Zeile mit Kopfzeile ist dabei', zeilen.indexOf(ersteZeile) !== -1, true);
check('die Zeile OHNE Kopfzeile ebenfalls', zeilen.indexOf(zweiteZeile) !== -1, true);
check('der Gruppen-Container zaehlt nicht als Nachricht', zeilen.indexOf(gruppe), -1);
check('der Datums-Trenner zaehlt nicht als Nachricht', zeilen.indexOf(datumsTrenner), -1);
check('Datums-Trenner wird als solcher erkannt', SCDC.scanner.isDateSeparator(datumsTrenner), true);
check('eine Nachricht ist kein Datums-Trenner', SCDC.scanner.isDateSeparator(zweiteZeile), false);

// Der Absender steht nur in der ersten Zeile - die Folgezeilen gehoeren zur
// selben Gruppe und muessen ihn erben, sonst greift das Absender-Gedaechtnis
// ausgerechnet bei den Zeilen nicht, um die es hier geht.
check('Zeile mit Kopfzeile liefert den Absender', SCDC.scanner.senderKey(ersteZeile), 'hannah thomassen');
check('Folgezeile erbt den Absender von oben', SCDC.scanner.senderKey(dritteZeile), 'hannah thomassen');

// Aber nicht ueber die Liste hinaus: ohne Kopfzeile darueber gibt es keinen
// Schluessel - lieber gar keiner als ein falscher.
var einzelneOhneKopf = zeile({ children: [new El('allein')] });
new El('', { children: [einzelneOhneKopf] });
check('ohne Kopfzeile darueber kein Absender', SCDC.scanner.senderKey(einzelneOhneKopf), '');

print('--- Chatbereich: nie die Freundesliste ---');

// Regression: Snapchat blendet den Chat aus, sobald der Tab den Fokus verliert.
// Die Suche verlangte Sichtbarkeit, fiel deshalb auf "groesster Scroller"
// zurueck und nahm die Freundesliste links (Eintraege "6. okt.", "rayane").
var feed = new El('', { w: 340, h: 499, overflowY: 'auto', scrollHeight: 3774, clientHeight: 499 });
var nav = new El('', { tag: 'nav', children: [feed] });
var chatVersteckt = new El('', { tag: 'ul', id: 'cv-8aeff3c1', w: 0, h: 0, opacity: '0' });
document.__root = new El('', { tag: 'main', children: [nav, chatVersteckt] });
check('ausgeblendeter Chat wird trotzdem als Chatbereich erkannt', SCDC.dom.findConversation(), chatVersteckt);
document.__root = new El('', { children: [new El('', { tag: 'main', children: [nav] })] });
check('ohne Chat wird NICHT die Freundesliste genommen', SCDC.dom.findConversation(), null);
check('Freundesliste liegt in der Navigation', SCDC.dom.inNavigation(feed), true);
document.__root = null;

print('--- Echter Aufbau laut DOM-Dump ---');

// Masse aus dem Dump: Huelle 491 px breit, Nachrichten darin nur 300 px.
// Eine Flaechenregel ("Huelle = vollstaendig von Zeilen belegt") haette die
// Huelle deshalb fuer eine Nachricht gehalten und die drei echten verworfen.
function msg(text, h, mitKopf) {
  var kids = mitKopf ? [new El('hannah 12:33', { tag: 'header', w: 300, h: 13 })] : [];
  kids.push(new El(text, { w: 300, h: h - (mitKopf ? 17 : 0) }));
  kids.push(new El('', { tag: 'ul', w: 300, h: 0 }));
  return new El('', { tag: 'li', w: 300, h: h, children: kids });
}
function huelle(nachrichten, h) {
  return new El('', {
    tag: 'li',
    w: 491,
    h: h,
    children: [new El('', { w: 491, h: h - 2, children: [new El('', { tag: 'ul', w: 491, h: h - 2, children: nachrichten })] })]
  });
}
var m1 = msg('eins', 335, true);
var m2 = msg('zwei', 318, false);
var m3 = msg('drei', 318, false);
var einzeln = msg('allein', 99, true);
var trenner = new El('', { tag: 'li', w: 491, h: 27, children: [new El('11. Juli 2025', { tag: 'time', w: 97, h: 27 })] });
var leer = new El('', { tag: 'li', w: 491, h: 0, children: [new El('', { tag: 'span' })] });
var gruppe3 = huelle([m1, m2, m3], 973);
var gruppe1 = huelle([einzeln], 101);
var cv = new El('', { tag: 'ul', w: 499, h: 534, children: [leer, trenner, gruppe3, gruppe1] });

var echt = SCDC.scanner.messageRows(cv);
check('alle vier Nachrichten werden gefunden', echt.length, 4);
check('Folgenachricht ohne Kopfzeile ist dabei', echt.indexOf(m3) !== -1, true);
check('einzelne Nachricht in eigener Huelle ist dabei', echt.indexOf(einzeln) !== -1, true);
check('breite Huelle zaehlt NICHT als Nachricht', echt.indexOf(gruppe3), -1);
check('Datums-Trenner zaehlt nicht', echt.indexOf(trenner), -1);
check('leere Platzhalterzeile zaehlt nicht', echt.indexOf(leer), -1);
check('Absender wird innerhalb der Gruppe vererbt', SCDC.scanner.senderKey(m3), 'hannah');

// Rueckfall ohne Gruppen-Huellen: dann sind die Zeilen direkt im Chatbereich
// die Nachrichten - Datums-Trenner muessen dort extra aussortiert werden.
var flach = new El('', { tag: 'ul', w: 499, children: [
  new El('', { tag: 'li', w: 491, h: 27, children: [new El('Gestern', { tag: 'time' })] }),
  new El('a', { tag: 'li', w: 300, h: 40 }),
  new El('b', { tag: 'li', w: 300, h: 40 })
] });
check('ohne Gruppen: Zeilen direkt im Chat, ohne Datums-Trenner', SCDC.scanner.messageRows(flach).length, 2);

print('--- Antwort mit Zitat: die Antwort zaehlt, nicht das Zitat ---');

// Liegt das Zitat als eigenes <li> in der Antwort, ist es eine Ebene tiefer
// als jede Nachricht - und wird damit nicht angefasst.
var zitat = new El('', { tag: 'li', w: 200, h: 40, children: [new El('Originalnachricht')] });
var antwort = new El('', {
  tag: 'li',
  w: 300,
  h: 200,
  children: [new El('', { w: 300, h: 150, children: [new El('', { tag: 'ul', children: [zitat] })] }), new El('meine Antwort')]
});
var cvAntwort = new El('', { tag: 'ul', w: 499, children: [huelle([antwort], 202)] });
var antwortZeilen = SCDC.scanner.messageRows(cvAntwort);
check('genau eine Zeile - die Antwort', antwortZeilen.length, 1);
check('die Antwort selbst ist das Ziel', antwortZeilen[0], antwort);
check('das Zitat liegt eine Ebene tiefer', SCDC.scanner.rowDepth(zitat, cvAntwort), 2);

print('--- Notnagel Rechtsklick nur, solange der Hover unbewiesen ist ---');

// Der Rechtsklick oeffnet bei allem, was keine Nachricht ist, Snapchats
// grosses Kontextmenue - das legt sich ueber die Seite. Sobald der Hover
// nachweislich funktioniert, darf er deshalb nicht mehr zuschlagen.
SCDC.deleter.resetHoverProof();
check('am Anfang darf der Notnagel ran', SCDC.deleter.mayUseFallbacks(), true);
SCDC.deleter.hoverWorked = true;
check('sobald der Hover bewiesen ist, nicht mehr', SCDC.deleter.mayUseFallbacks(), false);
SCDC.deleter.resetHoverProof();
check('Zuruecksetzen wirkt', SCDC.deleter.mayUseFallbacks(), true);

// Fehlende Leiste richtig einordnen - davon haengt ab, ob der Lauf abbricht.
check('unbewiesener Hover + nichts da = Fehlschlag', SCDC.deleter.classifyMissingMenu(0).menuFailure, true);
check('ausgeblendete Symbole sind immer ein Fehlschlag', SCDC.deleter.classifyMissingMenu(3).menuFailure, true);
check('und werden mit Anzahl gemeldet', SCDC.deleter.classifyMissingMenu(3).reason, 'toolbar-da-aber-unsichtbar(3)');
SCDC.deleter.hoverWorked = true;
check('bewiesener Hover + gar nichts = keine Nachricht', SCDC.deleter.classifyMissingMenu(0).reason, 'keine-nachricht');
check('und zaehlt NICHT als Fehlschlag', !SCDC.deleter.classifyMissingMenu(0).menuFailure, true);
check('ausgeblendete Symbole bleiben auch dann ein Fehlschlag', SCDC.deleter.classifyMissingMenu(2).menuFailure, true);
SCDC.deleter.resetHoverProof();

print('--- Herkunft an der Aktionsleiste ablesen ---');

// Regression: Die Herkunft wurde ueber die Ausrichtung geraten ("eigene stehen
// rechts"). Bei Snapchat Web stehen BEIDE Seiten links - dadurch galten eigene
// Nachrichten als fremd und wurden mit "fremde-nachricht-nicht-gespeichert"
// uebersprungen, obwohl sie loeschbar waren. Verbindlich ist allein der
// Papierkorb als 4. Symbol.
check('4 Symbole = eigene Nachricht', SCDC.deleter.ownFromToolbar({ toolbar: ['a', 'b', 'c', 'd'] }), true);
check('3 Symbole = fremde Nachricht', SCDC.deleter.ownFromToolbar({ toolbar: ['a', 'b', 'c'] }), false);
check('unerwartete Anzahl trifft keine Aussage', SCDC.deleter.ownFromToolbar({ toolbar: ['a', 'b'] }), null);
check('Textmenue trifft keine Aussage', SCDC.deleter.ownFromToolbar(new El('')), null);

// Regression (per Diagnose belegt): Die fremde Textnachricht hat ebenfalls 4
// Symbole - [Reagieren, Speichern, Antworten, KOPIEREN]. Sie galt deshalb als
// eigene, und "Löschen" haette auf Kopieren geklickt.
function knopfMitPfad(d) {
  var pfad = new El('', { tag: 'path' });
  pfad.d = d;
  return new El('', { tag: 'button', children: [pfad] });
}
var fremderText = { toolbar: [knopfMitPfad('M19.302 3.87'), knopfMitPfad('M5.47 7.627c0'), knopfMitPfad('M12 8.875'), knopfMitPfad('M4.638 6.167A2.362')] };
check('fremde Textnachricht (4 Symbole, letztes = Kopieren) ist NICHT eigen', SCDC.deleter.ownFromToolbar(fremderText), false);
check('fremde Textnachricht: kein Loeschen (nicht auf Kopieren klicken)', SCDC.deleter.pickAction(fremderText, 'delete'), null);
check('fremde Textnachricht: Speichern-Umschalter wird erkannt', SCDC.deleter.savedStateFromToolbar(fremderText.toolbar).known, true);
var eigenerSnap = { toolbar: [knopfMitPfad('M19.302'), knopfMitPfad('M5.47 7.627'), knopfMitPfad('M12 8.875'), knopfMitPfad('M9.1 2.2')] };
check('eigener Snap (4 Symbole, letztes = Papierkorb) bleibt eigen', SCDC.deleter.ownFromToolbar(eigenerSnap), true);
check('eigener Snap: Papierkorb wird geklickt', SCDC.deleter.pickAction(eigenerSnap, 'delete'), eigenerSnap.toolbar[3]);

// Kontextmenue (Rechtsklick, der Weg bei Textnachrichten): "Löschen" gibt es
// nur bei eigenen Nachrichten.
var kontextEigen = new El('', { children: [new El('Antworten', { role: 'menuitem' }), new El('Löschen', { role: 'menuitem' })] });
var kontextFremd = new El('', { children: [new El('Antworten', { role: 'menuitem' }), new El('Kopieren', { role: 'menuitem' })] });
check('Kontextmenue mit "Löschen" = eigene Nachricht', SCDC.deleter.ownFromMenu(kontextEigen), true);
check('Kontextmenue ohne "Löschen" = fremde Nachricht', SCDC.deleter.ownFromMenu(kontextFremd), false);
check('Leiste geht weiter ueber die Symbole', SCDC.deleter.ownFromMenu(fremderText), false);

print('--- Eigene Nachrichten direkt loeschen ---');
// Regression: eigene gespeicherte Nachrichten wurden erst entspeichert, dann
// das Menue neu geoeffnet, dann geloescht - pro Nachricht ein Vielfaches der
// Zeit. Snapchat loescht eigene Nachrichten auch gespeichert.
check('eigene gespeicherte Nachricht mit Papierkorb: direkt loeschen', SCDC.deleter.mussErstEntspeichern(eigenerSnap, true, true), false);
check('eigene gespeicherte Nachricht im Kontextmenue: direkt loeschen', SCDC.deleter.mussErstEntspeichern(kontextEigen, true, true), false);
check('fremde gespeicherte Nachricht: entspeichern', SCDC.deleter.mussErstEntspeichern(fremderText, false, true), true);
check('kein Loeschen angeboten: erst entspeichern', SCDC.deleter.mussErstEntspeichern(kontextFremd, true, true), true);
check('nicht gespeichert: nichts zu entspeichern', SCDC.deleter.mussErstEntspeichern(kontextFremd, false, false), false);

print('--- Scrollposition halten (Snapchat springt nach dem Loeschen ans Ende) ---');
function scrollerAttrappe(top) {
  var sc = { scrollTop: top, scrollHeight: 7000, clientHeight: 500, handler: null };
  sc.addEventListener = function (t, fn) { if (t === 'scroll') sc.handler = fn; };
  sc.removeEventListener = function () { sc.handler = null; };
  sc.springe = function (y) { sc.scrollTop = y; if (sc.handler) sc.handler(); };
  return sc;
}
var sc1 = scrollerAttrappe(3000);
var waechter = SCDC.dom.scrollWaechter(sc1);
sc1.springe(6500);
check('Sprung ans Chatende wird zurueckgenommen', sc1.scrollTop, 3000);
check('Korrektur wird gezaehlt', waechter.korrekturen, 1);
sc1.springe(2950);
check('kleine Bewegung nach oben bleibt (Inhalt wurde kuerzer)', sc1.scrollTop, 2950);
// scroll-Event noch WAEHREND des eigenen Scrollens ...
waechter.eigen(function () { sc1.springe(4000); });
check('eigenes Scrollen wird nicht zurueckgenommen', sc1.scrollTop, 4000);
// ... und erst einen Frame DANACH (der Normalfall bei "instant").
waechter.eigen(function () { sc1.scrollTop = 5000; });
sc1.springe(5000);
check('eigenes Scrollen, Event kommt spaeter: bleibt stehen', sc1.scrollTop, 5000);
sc1.springe(6500);
check('danach gilt die neue Position als Soll', sc1.scrollTop, 5000);
waechter.stop();
sc1.springe(6500);
check('nach dem Lauf wird nichts mehr festgehalten', sc1.scrollTop, 6500);
check('ohne Scroller: eigen() fuehrt trotzdem aus', SCDC.dom.scrollWaechter(null).eigen(function () { return 7; }), 7);

print('--- ETA ---');
check('Tempo: Mittel der letzten Nachrichten', SCDC.deleter.sekundenProNachricht([1000, 2000, 3000]), 2);
check('Tempo: nur die letzten 12 zaehlen', SCDC.deleter.sekundenProNachricht([60000].concat([1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000])), 1);
check('Tempo: ohne Messung keine Angabe', SCDC.deleter.sekundenProNachricht([]), 0);
check('Dauer unter einer Minute', SCDC.deleter.formatDauer(45), '45 s');
check('Dauer in Minuten', SCDC.deleter.formatDauer(200), '3 min 20 s');
check('volle Minuten ohne "0 s"', SCDC.deleter.formatDauer(120), '2 min');
check('Dauer in Stunden', SCDC.deleter.formatDauer(4000), '1 h 7 min');

print('--- Absender merken (ein Hover je Seite genuegt) ---');

function nachricht(name, opts) {
  var o = Object.assign({ children: [new El(name + ' 12:33', { tag: 'header' })] }, opts || {});
  return new El('Snap ⋅ Gespeichert', o);
}

SCDC.scanner.resetSenders();
var vonMir = nachricht('miro');
var vonHannah = nachricht('hannah thomassen');
check('Absender kommt aus der Kopfzeile, ohne Zeitstempel', SCDC.scanner.senderKey(vonMir), 'miro');
check('unbekannter Absender liefert null', SCDC.scanner.knownOwn(vonMir), null);

SCDC.scanner.rememberSender(vonMir, true);
SCDC.scanner.rememberSender(vonHannah, false);
check('gelernte eigene Seite', SCDC.scanner.knownOwn(nachricht('miro')), true);
check('gelernte fremde Seite', SCDC.scanner.knownOwn(nachricht('hannah thomassen')), false);
check('Gelerntes schlaegt die Ausrichtung', SCDC.scanner.isOwnMessage(nachricht('miro'), new El('', { w: 400 })), true);

print('--- Eigene vs. fremde Nachrichten (collectTargets) ---');

var containerBreit = new El('', { w: 400 });
var eigeneNachricht = nachricht('miro', { left: 250, w: 100 });
var fremdeNachricht = nachricht('hannah thomassen', { left: 0, w: 100 });
containerBreit.children = [eigeneNachricht, fremdeNachricht];
var originalFindMessages = SCDC.scanner.findMessages;
SCDC.scanner.findMessages = function () { return containerBreit.children; }; // Selektor-Suche umgehen

SCDC.scanner.resetSenders();
var targets = SCDC.scanner.collectTargets(containerBreit, ['saved'], false, new Set());
check('collectTargets liefert beide Nachrichten (onlyOwn=false)', targets.length, 2);

// Ohne Wissen darf onlyOwn NICHTS aussortieren: sonst faellt genau der Fall
// durch, um den es geht - eigene Nachrichten, die nicht rechts stehen.
var unbekannt = SCDC.scanner.collectTargets(containerBreit, ['saved'], true, new Set());
check('onlyOwn wirft ohne Wissen nichts weg', unbekannt.length, 2);

// Sobald die Aktionsleiste die Seite verraten hat, wird gefiltert - und der
// Rest laeuft ohne weiteren Hover durch.
SCDC.scanner.rememberSender(fremdeNachricht, false);
var gefiltert = SCDC.scanner.collectTargets(containerBreit, ['saved'], true, new Set());
check('onlyOwn filtert erkannt fremde Nachricht raus', gefiltert.length, 1);
check('uebrig bleibt die eigene', gefiltert[0].el, eigeneNachricht);

SCDC.scanner.resetSenders();
SCDC.scanner.findMessages = originalFindMessages;

print('--- Bestaetigungsdialog: nicht endlos ins Leere warten ---');

// Der groesste Zeitfresser des Laufs: kommt kein Dialog, verfiel bei JEDER
// Nachricht der volle Timeout. Nach ein paar dialoglosen Durchlaeufen wird nur
// noch kurz nachgesehen - taucht doch einer auf, gilt sofort wieder voll.
SCDC.applySettings({});
SCDC.deleter.resetDialogProbes();
var voll = SCDC.timing.dialogTimeout;
var kurz = Math.min(900, voll);
check('erster Durchlauf wartet voll ab', SCDC.deleter.dialogTimeoutFor('delete'), voll);

SCDC.deleter.noteDialogResult('delete', false);
check('eine Beobachtung genuegt noch nicht', SCDC.deleter.dialogTimeoutFor('delete'), voll);
SCDC.deleter.noteDialogResult('delete', false);
check('nach zwei dialoglosen Loeschungen nur noch kurz nachsehen', SCDC.deleter.dialogTimeoutFor('delete'), kurz);

// Getrennte Zaehler je Aktionsart: fragt Snapchat beim Loeschen nach, beim
// Entspeichern aber nicht, darf die eine Beobachtung die andere nicht bremsen.
check('Entspeichern hat einen eigenen Zaehler', SCDC.deleter.dialogTimeoutFor('unsave'), voll);

// Taucht doch ein Dialog auf, gilt sofort wieder die volle Obergrenze -
// sonst wuerde eine echte Rueckfrage verpasst und das Menue bliebe offen.
SCDC.deleter.noteDialogResult('delete', true);
check('ein echter Dialog stellt die volle Wartezeit wieder her', SCDC.deleter.dialogTimeoutFor('delete'), voll);
SCDC.deleter.noteDialogResult('delete', false);
SCDC.deleter.noteDialogResult('delete', false);
check('einmal gesehen bleibt gesehen', SCDC.deleter.dialogTimeoutFor('delete'), voll);

SCDC.deleter.resetDialogProbes();
check('Zuruecksetzen stellt den Ausgangszustand her', SCDC.deleter.dialogTimeoutFor('delete'), voll);

print('--- Einstellungen ---');
SCDC.applySettings({ speed: 'careful', customLabels: { delete: 'verwijderen, elimina' } });
check('eigene Labels vorne', SCDC.activeLabels.delete[0], 'verwijderen');
check('eingebaute Labels bleiben', SCDC.activeLabels.delete.indexOf('löschen') > -1, true);
check('Tempo "careful" verlangsamt', SCDC.timing.betweenDeletes > SCDC.TIMING.betweenDeletes, true);
SCDC.applySettings({ speed: 'fast' });
check('Tempo "fast" beschleunigt', SCDC.timing.betweenDeletes < SCDC.TIMING.betweenDeletes, true);
SCDC.applySettings({ speed: 'turbo' });
check('Tempo "turbo" ist das schnellste', SCDC.timing.betweenDeletes < Math.round(SCDC.TIMING.betweenDeletes * 0.55), true);

// Regression: frueher skalierte das Tempo ALLE Werte, auch die Obergrenzen.
// Das machte den Lauf nicht schneller (eine Obergrenze verfaellt nur, wenn
// etwas ausbleibt), sondern nur fehleranfaelliger - bei "Schnell" blieb knapp
// eine Sekunde fuer die Aktionsleiste, und ein zaeher Moment endete als
// "kein Menü".
check('Obergrenze fuer die Aktionsleiste bleibt bei "turbo" voll', SCDC.timing.hoverTimeout, SCDC.TIMING.hoverTimeout);

// Allgemein statt stichprobenartig: was nicht auf der Pausenliste steht, darf
// das Tempo ueberhaupt nicht anfassen - auch kuenftige Werte nicht.
function nurPausenSkaliert() {
  for (var k in SCDC.TIMING) {
    if (SCDC.PAUSES.indexOf(k) !== -1) continue;
    if (SCDC.timing[k] !== SCDC.TIMING[k]) return k; // Name des Ausreissers
  }
  return 'keiner';
}
check('bei "turbo" skaliert nichts ausserhalb der Pausenliste', nurPausenSkaliert(), 'keiner');
SCDC.applySettings({ speed: 'careful' });
check('bei "careful" ebenso wenig', nurPausenSkaliert(), 'keiner');
check('Pausen skalieren weiterhin', SCDC.timing.afterScroll > SCDC.TIMING.afterScroll, true);
SCDC.applySettings({ customSelectors: { message: '.meins' } });
check('eigener Selektor zuerst', SCDC.activeSelectors.message[0], '.meins');

print('');
print(failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' TEST(S) FEHLGESCHLAGEN');
