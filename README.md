# Snapchat Daten-Bereiniger

Eine Browser-Erweiterung für **Snapchat Web** (snapchat.com/web), die deine Chats
automatisch aufräumt: Sie klickt für dich durch den Chat und

- **löscht deine eigenen Nachrichten** (Snaps und Texte), auch beim Gegenüber, und
- **entspeichert Nachrichten deines Gegenübers**, denn fremde Nachrichten kann
  Snapchat nicht löschen, nur aus dem Speicher nehmen.

Ohne die Erweiterung müsstest du jede Nachricht einzeln anfahren, das Menü öffnen,
entspeichern und löschen. Bei hunderten Nachrichten sind das Stunden.

> **Wichtig vorab:** Das Löschen ist **endgültig**. Es gibt kein Papierkorb und kein
> Rückgängig. Mach beim ersten Mal unbedingt einen **Testlauf** (siehe unten).
> Dies ist ein inoffizielles Hobbyprojekt und steht in keiner Verbindung zu Snap Inc.

*English summary: browser extension (Chrome/Brave/Edge, Manifest V3) that bulk-deletes
your own messages and unsaves other people's messages on Snapchat Web by automating the
clicks. Everything runs locally in your browser, there is no server and no network
request to Snapchat's API. UI and docs are in German. Install it via "Load unpacked"
(see below). Use at your own risk; automation may violate Snapchat's terms of service.*

---

## Inhalt

1. [Was kann die Erweiterung (und was nicht)?](#was-kann-die-erweiterung-und-was-nicht)
2. [Installation](#installation)
3. [Benutzung in 3 Schritten](#benutzung-in-3-schritten)
4. [Einstellungen](#einstellungen)
5. [Häufige Fragen und Probleme](#häufige-fragen-und-probleme)
6. [Datenschutz und Sicherheit](#datenschutz-und-sicherheit)
7. [Für Entwickler](#für-entwickler)
8. [Haftung und Lizenz](#haftung-und-lizenz)

---

## Was kann die Erweiterung (und was nicht)?

| Nachricht | Was passiert |
| --- | --- |
| **Deine eigene** Nachricht (Snap oder Text) | wird **gelöscht**, auf beiden Seiten. Ist sie gespeichert, ist das egal. |
| Nachricht **deines Gegenübers**, gespeichert | wird **entspeichert**. Gelöscht wird sie nicht, denn das erlaubt Snapchat nicht. |
| Nachricht deines Gegenübers, nicht gespeichert | wird nicht angefasst. |

Was sie **nicht** kann:

- Fremde Nachrichten beim Gegenüber löschen. Das geht bei Snapchat grundsätzlich nicht.
- Dir eine echte Datenlöschung nach DSGVO ersetzen. Snapchat kann Daten in Backups
  und Logs länger vorhalten. Dafür gibt es bei Snapchat ein eigenes Antragsformular.
- Etwas wiederherstellen. Gelöscht ist gelöscht.

Unterstützte Typen: Textnachrichten, Foto-Snaps, Video-Snaps, Videonachrichten,
Sprachnachrichten, gespeicherte Nachrichten, Anhänge und Links.

---

## Installation

Die Erweiterung ist nicht im Chrome Web Store. Du lädst sie einmal von Hand. Das
funktioniert in **Chrome, Brave und Edge** (Firefox wird von Snapchat Web selbst
nicht unterstützt).

1. **Herunterladen:** Auf dieser GitHub-Seite oben auf den grünen Knopf **Code →
   Download ZIP** klicken und die ZIP-Datei **entpacken**. Den entpackten Ordner danach
   nicht mehr verschieben oder löschen, sonst verschwindet die Erweiterung wieder.
2. **Erweiterungsseite öffnen:**
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
3. Oben rechts den **Entwicklermodus** einschalten.
4. **„Entpackte Erweiterung laden“** klicken und den entpackten Ordner auswählen
   (der, in dem direkt die Datei `manifest.json` liegt).
5. **Snapchat Web** öffnen (https://www.snapchat.com/web/), anmelden, einmal mit
   **F5** neu laden und einen Chat öffnen.
6. Auf das Erweiterungs-Symbol klicken (bei Bedarf über das Puzzle-Symbol anheften).

Beim ersten Start öffnen sich die Einstellungen. Du musst dort nichts ausfüllen.

---

## Benutzung in 3 Schritten

Öffne in Snapchat Web den Chat, den du aufräumen willst, und klicke auf das
Erweiterungs-Symbol.

**Schritt 1: Auswahl.** Setze Häkchen bei den Nachrichtentypen, die du bereinigen
willst, und wähle:

- **Umfang:** nur der geöffnete Chat, oder alle Chats der Liste.
- **Tempo:** wie schnell geklickt wird (siehe [Einstellungen](#einstellungen)).
- **Nur meine Nachrichten:** wenn aktiv, werden nur eigene Nachrichten gelöscht und
  fremde in Ruhe gelassen. Ohne dieses Häkchen werden fremde gespeicherte Nachrichten
  zusätzlich entspeichert.

**Schritt 2: Analyse.** Die Erweiterung scrollt den Chat komplett nach oben, damit
alles geladen ist, und zeigt dir eine Tabelle, wie viele Nachrichten es gibt. Prüfe,
ob die Zahlen zu dem passen, was du im Chat siehst.

**Schritt 3: Löschen.** Zum Scharfschalten musst du `LÖSCHEN` eintippen. Davor:

- **Testlauf:** markiert alle Treffer gelb auf der Seite, löscht aber nichts.
  **Mach das beim ersten Mal.**
- **Sicherheitslimit:** z. B. `3`, dann stoppt der Lauf nach drei Nachrichten. Gut,
  um erst einmal zu sehen, ob alles richtig läuft.

Während des Laufs erscheint unten rechts ein Fenster mit Fortschritt, Geschwindigkeit
und **geschätzter Restzeit**. Mit **Esc** oder dem Stopp-Knopf brichst du sofort ab.

### Wichtige Regeln während eines Laufs

- **Den Snapchat-Tab im Vordergrund lassen.** Snapchat Web blendet den Chat aus,
  sobald der Tab den Fokus verliert.
- **Die Maus nicht über den Chat bewegen.** Die Erweiterung simuliert den Mauszeiger
  selbst. Ein echter Zeiger stört dabei.
- **Nicht selbst im Chat scrollen.** Die Erweiterung hält die Ansicht an der Stelle,
  an der sie gerade arbeitet.

---

## Einstellungen

Die Einstellungen erreichst du über das Zahnrad im Popup.

**Tempo** (je schneller, desto eher fällt es Snapchat als Automatik auf):

| Stufe | Wann sinnvoll |
| --- | --- |
| Vorsichtig | die ersten Läufe, kleine Chats |
| Normal | Standard |
| Schnell | große Chats |
| Turbo | sehr große Chats, kaum Pausen |
| Blitz | praktisch ohne Pausen. Reagiert Snapchat zu langsam, wird die Nachricht übersprungen statt falsch geklickt. Dann einfach nochmal laufen lassen. |

Während des Laufs siehst du die **gemessene** Zeit pro Nachricht, daran kannst du
die Einstellung beurteilen.

Weitere Einstellungen: Snapchat-Anzeigename (optional), Sicherheitslimit,
eigene Selektoren und Menü-Beschriftungen für andere Sprachen (siehe unten), und
eine **Diagnose**.

---

## Häufige Fragen und Probleme

**Nach dem Installieren passiert nichts.**
Snapchat-Seite einmal mit **F5** neu laden. Die Erweiterung wird erst beim Laden der
Seite aktiv. Auch nach einem Update der Erweiterung die Seite neu laden.

**„Keine Aktionsleiste“ oder „Kontextmenü ließ sich nicht öffnen“.**
Meistens war der Snapchat-Tab nicht im Vordergrund (oder das Popup hat ihm den Fokus
genommen). Tab im Vordergrund lassen und erneut starten. Hilft das nicht: den
Chat öffnen, in den Einstellungen **Diagnose starten** klicken und **sofort zurück
in den Snapchat-Tab** klicken. Das Ergebnis steht dann auf der Einstellungsseite.

**Es wird übersprungen, was ich eigentlich löschen will.**
Unter dem Lauf steht der häufigste Grund im Klartext. Typisch: „fremde Nachricht
übersprungen“ heißt, dass die Nachricht von deinem Gegenüber ist und „Nur meine
Nachrichten“ aktiv war. Das ist so gewollt.

**Ein Teil der Nachrichten bleibt übrig.**
Snapchat lädt lange Chats stückweise nach. Einfach einen weiteren Lauf starten.

**Das Tempo ist mir zu langsam.**
Eine höhere Tempo-Stufe wählen. Die größte Zeitersparnis ist bereits eingebaut
(eigene Nachrichten werden direkt gelöscht, die Ansicht bleibt stehen).

**Snapchat hat sein Aussehen geändert, und nichts funktioniert mehr.**
Das passiert gelegentlich, weil die Erweiterung auf Snapchats Seitenaufbau angewiesen
ist. Öffne in dem Fall ein **Issue** hier auf GitHub und hänge die Ergebnisse der
Diagnose an (vorher kurz überfliegen, Namen können darin stehen). Für Fortgeschrittene:
In den Einstellungen kannst du mit **„Auswählen“** das richtige Element auf der
Snapchat-Seite selbst anklicken.

---

## Datenschutz und Sicherheit

- **Alles läuft lokal in deinem Browser.** Es gibt keinen Server, keine Analyse, kein
  Tracking und **keine Anfragen an Snapchats API**. Die Erweiterung klickt nur auf der
  Seite, die du selbst geöffnet hast.
- **Kein Passwort, kein Login.** Du meldest dich selbst bei Snapchat an. Die
  Erweiterung sieht und speichert keine Zugangsdaten.
- Gespeichert werden nur deine Einstellungen und der Laufstatus
  (`chrome.storage.local`).
- Berechtigungen laut `manifest.json`: nur `storage` und der Zugriff auf
  `snapchat.com/web/`. Mehr nicht. Du kannst den Quellcode selbst prüfen.
- Nach jedem Durchlauf zählt die Erweiterung getrennt „gelöscht“ und „nur
  entspeichert“, damit du siehst, was wirklich passiert ist.
- Bestimmte Menüpunkte werden **nie** geklickt (u. a. „Chat löschen“, „Blockieren“,
  „Melden“, „Freund entfernen“, „Konto löschen“). Im Zweifel bricht ein Lauf ab,
  statt zu raten.

**Zur Nutzungsbedingung:** Automatisiertes Klicken kann gegen Snapchats
Nutzungsbedingungen verstoßen. Ein sehr schneller Massenlauf kann auffallen. Nutze die
vorsichtigen Tempo-Stufen und das Sicherheitslimit, besonders am Anfang.

---

## Für Entwickler

Die technischen Hintergründe stehen in [docs/TECHNIK.md](docs/TECHNIK.md): wie
Nachrichten und Absender erkannt werden, wie der Speicherstatus aus dem Symbol der
Aktionsleiste gelesen wird, warum das Tempo nur die Pausen verkürzt, und wie du mit
dem mitgelieferten Werkzeug Snapchats echtes DOM untersuchst.

```
manifest.json    Manifest V3
background.js    Service Worker
popup/           Menü: Auswahl, Analyse, Löschbestätigung
options/         Einstellungen, Diagnose, Selektor-Picker
content/         die eigentliche Arbeit (Scanner, Deleter, Overlay)
tests/           Tests für Menü-Auswahl und Klassifizierung
tools/           Test-Runner und DOM-Inspektion
docs/            technische Dokumentation
```

Tests ausführen (ohne Node.js, nutzt `jsc` oder Chrome headless):

```bash
./tools/run-tests.sh
```

Beiträge sind willkommen: Issues mit Diagnose-Ausgabe und Pull Requests helfen am
meisten, denn Snapchat ändert sein Markup ohne Vorwarnung.

---

## Haftung und Lizenz

Die Nutzung erfolgt **auf eigene Gefahr**. Die Erweiterung löscht Inhalte
unwiderruflich. Der Autor übernimmt keine Haftung für gelöschte Daten,
Einschränkungen oder Sperrungen deines Kontos. Das Projekt ist nicht mit Snap Inc.
verbunden oder von dieser unterstützt; „Snapchat“ ist eine Marke von Snap Inc.

Eine Lizenzdatei ist noch nicht hinterlegt. Solange keine Lizenz im Repository
liegt, dürfen andere den Code laut Gesetz nur ansehen, nicht weiterverwenden oder
verändern.
