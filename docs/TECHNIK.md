# Technische Details

Dieses Dokument ist für alle, die verstehen oder weiterentwickeln wollen, **wie** die
Extension arbeitet. Für die Bedienung reicht die [README](../README.md).

## Tempo und Wartezeiten

Fünf Stufen — *Vorsichtig*, *Normal*, *Schnell*, *Turbo* und *Blitz* (praktisch keine Pausen mehr; was Snapchat zu
langsam beantwortet, wird übersprungen statt falsch geklickt, dann hilft ein zweiter
Lauf). Während des Laufs zeigen Overlay und Popup den **gemessenen** Wert
(`s/Nachricht`, Mittel der letzten 12 Nachrichten) und daraus eine **Restzeit**
(„noch ca. 3 min 20 s“). Die Restzeit bezieht sich auf die Nachrichten, die gerade
geladen sind — lädt Snapchat beim Hochscrollen ältere nach, wächst sie mit.

Das Tempo kürzt ausschließlich die **Pausen** zwischen den Klicks. Die Wartezeiten
*auf* Snapchat — Aktionsleiste, Menü, Bestätigungsdialog — bleiben davon unberührt.
Das ist Absicht: eine Obergrenze verfällt nur, wenn das Erwartete ausbleibt. Sie zu
kürzen macht keinen einzigen Durchlauf schneller, sondern lässt bloß zähe Momente als
„kein Menü“ scheitern. Eine frühere Fassung hat alles gemeinsam skaliert, weshalb
„Schnell“ spürbar unzuverlässiger war.

Snapchat springt nach jedem Löschen ans **Ende des Chats**. Die nächste Nachricht liegt
aber direkt über der eben gelöschten — früher wurde deshalb jedes Mal zurückgescrollt
und gewartet. Während eines Laufs nimmt die Extension jeden Sprung nach unten, den sie
nicht selbst ausgelöst hat, sofort zurück (`dom.scrollWaechter`). Nebenwirkung: wer
während des Laufs selbst nach unten scrollt, wird ebenfalls zurückgeholt.

Eigene Nachrichten werden **direkt gelöscht**, sobald Snapchat „Löschen“ anbietet —
auch wenn sie gespeichert sind. Früher wurde erst entspeichert, das Menü neu geöffnet
und dann gelöscht; das Ergebnis ist dasselbe, kostete aber pro Nachricht ein
Mehrfaches. Entspeichert wird nur noch, wo es nötig ist: bei fremden Nachrichten (dort
gibt es kein Löschen) oder falls „Löschen“ im Menü fehlt.

Den größten Zeitgewinn bringt aber nicht die Einstellung, sondern eine Messung: nach
jedem Klick wurde auf einen Bestätigungsdialog gewartet — zeigt Snapchat keinen,
verfiel dabei bei **jeder** Nachricht die volle Obergrenze von 2,6 s, mehr als der
gesamte Rest zusammen. Jetzt wird die ersten beiden Male voll abgewartet, und wenn
dabei nie ein Dialog kam, danach nur noch kurz nachgesehen. Taucht doch einer auf,
gilt sofort wieder die volle Wartezeit; Löschen und Entspeichern werden getrennt
gezählt, weil Snapchat durchaus nur bei einem von beiden nachfragen könnte.

## Was die Extension technisch macht

Sie klickt für dich — nichts anderes. Pro Nachricht: Maus über die Nachricht fahren
(Snapchat blendet die Aktionen beim Hover ein; bei **Textnachrichten** erscheint diese
Leiste auf einen simulierten Zeiger nicht — dort wird Snapchats Kontextmenü per
Rechtsklick auf den Text geöffnet, und wenn sich das im Lauf bewährt hat, für alle
weiteren Texte direkt) → ggf. „Nicht mehr im Chat speichern“ → „Löschen“ → Bestätigungsdialog.
Zwischen den Schritten liegen bewusst zufällige Pausen (~1 s bei „Normal"), damit der
Ablauf nicht wie ein Bot im Sekundentakt aussieht.

Es gibt **keine** Netzwerkaufrufe an Snapchats API, keine Tokens, keine Server. Alle
Daten bleiben lokal in `chrome.storage.local` (nur Einstellungen und der Laufstatus).

### Sicherungen gegen Fehlklicks

- Menüpunkte auf einer **Verbotsliste** werden nie geklickt: „Chat löschen“,
  „Chat leeren“, „Blockieren“, „Melden“, „Freund entfernen“, „Konto löschen“ u. a.
  Das ist wichtig, weil „Chat löschen“ den Teilstring „löschen“ enthält und sonst
  die ganze Unterhaltung träfe.
- Bei unklarem Dialog wird abgebrochen statt geraten.
- Vier Symbole sind doppeldeutig: eigener Snap [Reagieren, Speichern, Antworten,
  **Papierkorb**] oder fremde Textnachricht [Reagieren, Speichern, Antworten,
  **Kopieren**]. Das letzte Symbol wird am SVG-Pfad erkannt — „Kopieren“ zählt nie
  als Papierkorb.
- Bei Antworten wird nie auf das Zitat gezielt: dessen Aktionen gehören zur
  zitierten Nachricht.
- Fehlgeschlagene Einträge werden übersprungen und protokolliert, nicht wiederholt.

---

## Erkennung und Grenzen im Detail


**1. „Beidseitig“ funktioniert nur für deine eigenen Nachrichten.**
Snapchat erlaubt serverseitiges Löschen ausschließlich für Inhalte, die *du* gesendet
hast. Beim Empfänger bleibt in der Regel ein Hinweis stehen, dass eine Nachricht
gelöscht wurde. Nachrichten, die *andere* dir geschickt haben, kannst du nicht bei
denen löschen — nur aus deiner Ansicht entfernen. Deshalb ist „Nur meine Nachrichten“
standardmäßig aktiv.

Konkret (per Screenshot geprüft): Snapchat zeigt beim Überfahren einer Nachricht eine
Icon-Leiste ohne Text. Bei fremden Nachrichten hat sie nur 3 Icons — Reagieren,
Speichern/Entspeichern, Antworten — **ohne Papierkorb**. Nur bei eigenen Nachrichten
kommt ein 4. Icon (Papierkorb/Löschen) dazu. Die Extension entspeichert fremde,
gespeicherte Nachrichten deshalb (das ist die einzig mögliche Aktion) und wertet das
bereits als vollständig erledigt — sie sucht danach nicht mehr nach einem
Löschen-Eintrag, der ohnehin nicht existiert.

In der Abschlussmeldung werden solche Fälle als **„entspeichert“** ausgewiesen, nicht
als „gelöscht“ — sonst hielte man Inhalte für weg, die noch da sind. Außerdem wird
jedes Entspeichern verifiziert: die Leiste wird danach erneut geöffnet und das
Umschalt-Icon muss auf „speichern“ gewechselt haben. Tut es das nicht, zählt die
Nachricht als übersprungen statt als erledigt.

Genau diese Leiste sagt auch, **von wem** eine Nachricht stammt — vier Symbole heißt
eigene Nachricht, drei heißt fremde. Am übrigen Markup ist das nicht ablesbar: bei
Snapchat Web stehen beide Seiten linksbündig, unterschieden nur durch die Farbe des
Namens. Eine frühere Fassung hat die Herkunft an der Ausrichtung geraten („eigene
stehen rechts“) und deshalb *alle* eigenen Nachrichten als fremd übersprungen. Weil
die Leiste erst beim Überfahren erscheint, merkt sich die Extension das Ergebnis pro
Absender (Name aus der Kopfzeile): ein Hover je Chatseite genügt, danach läuft der
Rest ohne Leerlauf durch. „Nur meine Nachrichten“ sortiert entsprechend erst aus, was
die Leiste tatsächlich als fremd ausgewiesen hat — nie auf Verdacht.

**2. Das ersetzt keinen DSGVO-Antrag.**
Gelöschte Chats verschwinden aus der App, aber Snapchat kann Daten in Backups und
Logs weiter vorhalten. Für eine echte Löschung nach Art. 17 DSGVO stelle zusätzlich
einen Antrag über Snapchats Datenschutz-/Supportformular. Über
`accounts.snapchat.com` kannst du außerdem deine gespeicherten Daten exportieren, um
zu sehen, was überhaupt vorliegt.

**3. Automatisiertes Klicken kann gegen Snapchats Nutzungsbedingungen verstoßen.**
Ein sehr schneller Massenlauf kann auffallen. Nutze „Vorsichtig“ und das
Sicherheitslimit, besonders am Anfang.

**Bewege während des Laufs die Maus nicht über den Chat.** Die Aktionsleiste erscheint
erst beim Überfahren einer Nachricht; die Extension simuliert das. Ein echter
Mauszeiger im Chatbereich erzeugt zusätzliche Hover-Zustände, die dieselbe Nachricht
anders aussehen lassen — das kann die „gespeichert“-Erkennung verfälschen.

**4. Gruppierte Nachrichten.**
Snapchat fasst aufeinanderfolgende Nachrichten desselben Absenders zu einer Gruppe
zusammen und gibt nur der **ersten** eine Kopfzeile mit Namen. Eine frühere Fassung
suchte genau danach (`li:has(> header)`) und übersah deshalb jede Folgenachricht —
pro Durchlauf verschwand nur die oberste einer Gruppe, die nächste erbte dann die
Kopfzeile und tauchte erst im nächsten Lauf auf. Daher waren mehrere Durchläufe
nötig.

Jetzt wird nach dem per DOM-Dump bestätigten Aufbau gesucht (`scanner.messageRows`):

```
ul#cv-…              Chatbereich
  li                 Gruppen-Hülle oder Datums-Trenner
    div > ul
      li             Nachricht (die erste mit <header>, die übrigen ohne)
```

Jede Nachricht sitzt **genau eine `<li>`-Ebene** unter einer Hülle, auch einzelne,
ungruppierte. Alles Tiefere, etwa die zitierte Vorschau in einer Antwort, ist keine
eigene Nachricht und wird nicht angefasst.

Zwei Zwischenstände sind daran gescheitert: „jedes `<li>` ohne verschachteltes `<li>`“
griff bei Antworten das Zitat statt der Antwort ab. Eine Flächenregel für Hüllen hätte
jede Gruppe verfehlt, weil die Hülle 491 px breit ist, die Nachrichten darin aber nur
300 px. Weil ein Zitat keine Aktionsleiste hat, schlug außerdem der Rechtsklick-Notnagel
zu und öffnete Snapchats großes Kontextmenü. Der greift deshalb nur noch, solange der
Hover in diesem Lauf **noch nichts** geöffnet hat. Danach heißt „keine Leiste“ nicht mehr
„falsche Technik“, sondern „keine Nachricht“, und solche Zeilen zählen nicht gegen die
Abbruchgrenze.

Den Absendernamen erben
Folgezeilen von der Zeile darüber — die Suche bleibt dabei innerhalb derselben Liste,
weil ein falscher Absender unter „Nur meine Nachrichten“ zum stillen Überspringen
führen würde.

**5. Die Erkennung ist heuristisch.**
Snapchat liefert gehashte CSS-Klassen aus und ändert das Markup ohne Vorwarnung.
Die Zuordnung „welche Nachricht ist welcher Typ“ beruht auf Statuslabels und
Medienelementen — sie ist gut, aber nicht perfekt. **Prüfe die Zahlen in Schritt 2
und mach einen Testlauf**, bevor du löschst.

Der „gespeichert“-Status ist ein Sonderfall: Snapchat vermerkt ihn **nirgends** — nicht
im Text, nicht in `aria-label`/`title`, nicht in einer erkennbaren Klasse und auch
nicht über die Hintergrundfarbe (per Diagnose an echten Nachrichten gemessen:
gespeicherte und nicht gespeicherte Nachrichten haben identisch `rgb(51, 50, 50)`).

Die einzige verlässliche Quelle ist das **zweite Symbol der Aktionsleiste**, die beim
Überfahren erscheint: Lesezeichen *mit* Schrägstrich = gespeichert (Klick entspeichert),
*ohne* = nicht gespeichert (Klick würde speichern). Die Pfadanfänge beider Varianten
stehen in `SCDC.ICON_PATHS` ([content/config.js](../content/config.js)). Passt keiner,
wird **nicht** geklickt, sondern gemeldet — ein Fehlgriff würde eine ungespeicherte
Nachricht speichern und das Gegenüber benachrichtigen.

Folge davon: Vor dem Überfahren lässt sich der Status nicht zählen. Die Zeile
„Gespeicherte Snaps/Chats“ zeigt deshalb keine Zahl, sondern „wird beim Löschen
geprüft“ — nicht gespeicherte Nachrichten werden dann ohne Klick übersprungen.

**6. Snaps, die schon geöffnet und nicht gespeichert wurden**, sind ohnehin
automatisch gelöscht — die tauchen im Chat gar nicht mehr als Inhalt auf.

Daraus folgt: **Entspeichern ist endgültig.** Sobald der Speicher-Status weg ist,
greift Snapchats normale Löschautomatik, und der Inhalt verschwindet nach kurzer Zeit
von selbst — auch beim Gegenüber. Für den Zweck dieser Extension ist genau das
erwünscht, aber es lässt sich nicht rückgängig machen. Was du behalten willst, vorher
sichern.

---

## Das echte DOM inspizieren (`tools/inspect-snapchat-loader.js`)

Die Selektoren dieser Extension sind Vermutungen über Snapchats Markup. Wenn die
Analyse falsche Zahlen liefert oder nichts gelöscht wird, ist der schnellste Weg,
sich das tatsächliche DOM anzusehen — statt weiter zu raten:

1. `snapchat.com/web/` öffnen, anmelden, betroffenen Chat öffnen
2. **F12 → Console**. Falls Chrome das Einfügen blockiert, erst `allow pasting` tippen
3. Inhalt von [tools/inspect-snapchat-loader.js](../tools/inspect-snapchat-loader.js)
   komplett einfügen, Enter → lädt `snapchat-dom-dump.txt` herunter
4. Für das Hover-Menü: `scdcCapture()` eingeben, Enter — und **danach sofort mit
   der Maus über eine Nachricht fahren und dort liegen bleiben**. Nach 12 Sekunden
   wird `snapchat-menu-dump.txt` heruntergeladen.

   Die Aufnahme läuft bewusst über ein Zeitfenster: Snapchats Menü erscheint beim
   Überfahren und wird wieder ausgehängt, sobald die Maus weggeht. Ein
   nachträgliches Einsammeln fände nichts mehr — deshalb wird während des
   Schwebens festgehalten.

**Warum `-loader.js` und nicht die lesbare `tools/inspect-snapchat.js`:** Text mit
Umlauten/Sonderzeichen wird beim Kopieren über manche Zwischenablagen/Chat-Clients
nachweislich beschädigt und zerschießt dann echten Code (Symptom: `X is not defined`
nach dem Einfügen, obwohl die Quelle fehlerfrei ist). Der Loader trägt das komplette
Skript Base64-kodiert in einer Konstante — Base64 besteht nur aus `A-Z a-z 0-9 + / =`,
an diesem Alphabet greift keine Autokorrektur/Formatierung an, und die Dekodierung
verwirft zusätzlich jedes Zeichen, das nicht zu diesem Alphabet gehört. Falls du die
lesbare Fassung zum Nachvollziehen willst: das ist [tools/inspect-snapchat.js](../tools/inspect-snapchat.js) —
zum Einfügen in die Konsole aber bitte den Loader verwenden.

Der Dump ersetzt Nachrichtentexte durch `[N Zeichen Text]`, Chat-Inhalte landen also
nicht darin. Kurze Beschriftungen bleiben lesbar, weil genau die gebraucht werden
(`Snap`, `Gespeichert`, `Video-Notiz`). **Aber:** in `aria-label`/`title` können
Kontaktnamen stehen — die Datei einmal überfliegen, bevor du sie weitergibst.

## Wenn Erkennung oder Löschen nicht funktionieren

**Fenster im Vordergrund lassen.** Sobald der Snapchat-Tab den Fokus verliert (z. B.
weil das Popup geöffnet wird), markieren viele Web-Apps — mobile-first wie Snapchat
besonders — den Nutzer als „abwesend“ und sperren die Ansicht. Dann liefert die
Analyse falsche Zahlen und das Löschen findet kein Kontextmenü mehr. Ab Version mit
`content/keepalive.js` unterdrückt die Extension dieses Fokus-Signal automatisch;
lass den Tab trotzdem möglichst im Vordergrund, wenn ein Lauf läuft.

**Diagnose statt Rätselraten.** In den Einstellungen (Zahnrad im Popup) gibt es unter
„Diagnose“ einen Knopf, der — ohne etwas zu löschen — prüft:

- ob der Chat-Bereich gefunden wird,
- wie die letzten Nachrichten eingestuft werden (inkl. der rohen Text-/Label-Quellen),
- ob sich testweise ein Kontextmenü öffnen lässt und welche Einträge es zeigt.

Öffne dafür zuerst den betroffenen Chat auf `snapchat.com/web/`, dann in den
Einstellungen auf **Diagnose starten** klicken. Das Ergebnis erscheint dort und
ausführlicher in der Konsole des Snapchat-Tabs (**F12 → Console**).

**Wenn die Analyse falsche Typen zeigt oder das Menü nicht öffnet**, hat sich
vermutlich Snapchats Layout geändert:

1. Bei **Selektoren** auf „Auswählen“ klicken
2. Auf der Snapchat-Seite das passende Element anklicken (blaue Umrandung folgt der Maus)
3. Der Selektor wird gespeichert und ab sofort bevorzugt genutzt

Nützliche Reihenfolge: erst **Chat-Bereich**, dann **Einzelne Nachricht**.
Ist die App auf einer anderen Sprache als Deutsch/Englisch, trage die
**Menü-Beschriftungen** ein (kommagetrennt).

Ein Löschlauf bricht jetzt außerdem automatisch mit einer klaren Fehlermeldung ab,
wenn das Kontextmenü viermal hintereinander nicht aufgeht — statt sich stumm durch
alle Nachrichten zu scheitern.

---

## Dateien

```
manifest.json          Manifest V3, Berechtigungen: storage + snapchat.com/web/
background.js          Service Worker (nur Erstinstallation/Aufräumen)
popup/                 Menü: Auswahl, Analyseergebnis, Löschbestätigung
options/               Einstellungen, Selektor-Picker
content/
  config.js            Datentypen, Menü-Labels, Selektorkandidaten, Timings
  dom.js               Event-Simulation, Warten, Container-Erkennung
  scanner.js           Verlauf nachladen, klassifizieren, zählen
  deleter.js           Kontextmenü öffnen, entspeichern, löschen, bestätigen
  hud.js               Overlay mit Fortschritt und Not-Aus
  picker.js            Klick-Picker für Selektoren
  main.js              Zustand + Befehlsverarbeitung
tests/logic.test.js    Tests für Menü-Auswahl und Klassifizierung
tools/inspect-snapchat.js         Konsolen-Snippet zum Auslesen des echten DOM (lesbar, zum Nachvollziehen)
tools/inspect-snapchat-loader.js  Dasselbe Base64-verpackt - zum tatsaechlichen Einfuegen in die Konsole
tools/run-tests.sh                Testlauf via jsc oder Chrome headless (ohne Node.js)
```

### Tests laufen lassen

Prüft ohne Browser, ob die Menü-Erkennung korrekt greift (u. a. dass „Chat löschen“
niemals geklickt wird) und ob die Typ-Klassifizierung stimmt. Nützlich, nachdem du
eigene Labels oder Selektoren eingetragen hast:

```bash
./tools/run-tests.sh
```

Das Skript nutzt `jsc`, falls vorhanden, und sonst Chrome im Headless-Modus — Node.js
wird nicht gebraucht. Exitcode 0 heißt „alle Tests bestanden“.

Der Laufzustand liegt bewusst im Content-Script, nicht im Popup oder Service Worker —
beide werden von Chrome jederzeit beendet, ein laufender Löschvorgang würde sonst
mittendrin abbrechen.

## Hinweis zur Erkennung von Textnachrichten

Textnachrichten haben eine Leiste mit **fünf** Symbolen (Reagieren, Speichern,
Antworten, Kopieren, Papierkorb) — eigene Texte also 5, fremde Texte 4 (ohne
Papierkorb), eigene Snaps 4, fremde Snaps 3. Weil 4 doppeldeutig ist (eigener Snap
oder fremder Text), entscheidet das letzte Symbol: das „Kopieren“-Symbol steht in
`SCDC.ICON_PATHS.copy`. Bei Textnachrichten erscheint die Leiste auf einen
simulierten Zeiger oft nicht; dann öffnet die Extension Snapchats Kontextmenü per
Rechtsklick auf den Text.
