/**
 * Konfiguration: Labels, Selektoren und Timings.
 *
 * Snapchat Web verwendet gehashte CSS-Klassen, die sich bei jedem Deploy aendern
 * koennen. Deshalb ist hier NICHTS hart verdrahtet: jede Strategie ist eine Liste
 * von Kandidaten, und der Nutzer kann ueber die Optionsseite eigene Selektoren
 * und Menue-Labels nachtragen (bzw. per Picker anklicken).
 */
(function () {
  'use strict';

  const SCDC = (window.SCDC = window.SCDC || {});

  /** Datentypen, die im Menue auswaehlbar sind. */
  const TYPES = {
    text: {
      id: 'text',
      label: 'Textnachrichten',
      hint: 'Normale Chat-Nachrichten',
      // Wird nicht ueber Keywords erkannt, sondern als Fallback: alles, was
      // sichtbaren Text traegt und keinem Medientyp zugeordnet wurde.
      keywords: { de: [], en: [] },
      isFallback: true
    },
    snap_photo: {
      id: 'snap_photo',
      label: 'Foto-Snaps',
      hint: 'Gesendete/empfangene Bild-Snaps',
      keywords: {
        de: ['foto-snap', 'foto snap', 'bild-snap', 'snap', 'geoeffnet', 'geöffnet', 'angesehen'],
        en: ['photo snap', 'snap', 'opened', 'viewed', 'received snap']
      }
    },
    snap_video: {
      id: 'snap_video',
      label: 'Video-Snaps',
      hint: 'Snaps mit Video',
      keywords: {
        de: ['video-snap', 'video snap'],
        en: ['video snap']
      }
    },
    video_note: {
      id: 'video_note',
      label: 'Videonachrichten',
      hint: 'Video-Notizen im Chat',
      keywords: {
        de: ['video-notiz', 'video notiz', 'videonachricht', 'video-nachricht'],
        en: ['video note', 'video message']
      }
    },
    audio_note: {
      id: 'audio_note',
      label: 'Sprachnachrichten',
      hint: 'Audio-Notizen / Voice Notes',
      keywords: {
        de: ['audio-notiz', 'audio notiz', 'sprachnachricht', 'sprach-nachricht', 'sprachnotiz'],
        en: ['audio note', 'voice note', 'voice message']
      }
    },
    saved: {
      id: 'saved',
      label: 'Gespeicherte Snaps/Chats',
      hint: 'Wird zuerst entspeichert, dann geloescht',
      keywords: {
        de: ['gespeichert', 'im chat gespeichert', 'gespeicherter snap'],
        en: ['saved', 'saved in chat', 'saved snap']
      },
      needsUnsave: true
    },
    attachment: {
      id: 'attachment',
      label: 'Anhaenge & Links',
      hint: 'Sticker, geteilte Links, Cameos',
      keywords: {
        de: ['anhang', 'link', 'sticker', 'cameo', 'geteilt', 'standort'],
        en: ['attachment', 'link', 'sticker', 'cameo', 'shared', 'location']
      }
    }
  };

  /** Reihenfolge fuer die Anzeige im Popup. */
  const TYPE_ORDER = [
    'text',
    'snap_photo',
    'snap_video',
    'video_note',
    'audio_note',
    'saved',
    'attachment'
  ];

  /**
   * Textbausteine der Snapchat-Oberflaeche. Mehrsprachig, weil die Web-App der
   * Browsersprache folgt. Alles wird case-insensitiv als Teilstring geprueft.
   */
  const LABELS = {
    // Bewusst OHNE "Chat löschen"/"Delete chat": das loescht die ganze
    // Unterhaltung statt einer Nachricht. Steht deshalb unten auf `forbidden`.
    delete: ['löschen', 'loeschen', 'nachricht löschen', 'delete', 'delete message', 'remove', 'supprimer', 'eliminar'],
    // "Nicht mehr im Chat speichern" ist der real beobachtete Wortlaut - die
    // kuerzere Variante "nicht mehr speichern" passt darauf NICHT als
    // Teilstring, weil "im Chat" dazwischensteht. Beide muessen drinstehen.
    unsave: [
      'nicht mehr im chat speichern',
      'nicht mehr speichern',
      'speicherung aufheben',
      'entspeichern',
      'aus chat entfernen',
      'unsave',
      'unsave in chat',
      'unsave from chat',
      'remove from saved'
    ],
    confirmDelete: [
      'löschen',
      'loeschen',
      'delete',
      'ja',
      'yes',
      'bestätigen',
      'bestaetigen',
      'confirm',
      'ok',
      'entfernen',
      'erase'
    ],
    cancel: ['abbrechen', 'cancel', 'zurück', 'zurueck', 'nein', 'no'],
    // Menuepunkte, die NIE geklickt werden duerfen (Schutz vor Fehlklicks).
    // Enthaelt insbesondere alle Aktionen, die eine ganze Unterhaltung treffen -
    // "Chat löschen" wuerde sonst ueber den Teilstring "löschen" mitmatchen.
    forbidden: [
      'chat löschen',
      'chat loeschen',
      'chat leeren',
      'unterhaltung löschen',
      'gespräch löschen',
      'delete chat',
      'delete conversation',
      'clear chat',
      'clear conversation',
      'melden',
      'report',
      'blockieren',
      'block',
      'freund entfernen',
      'remove friend',
      'kontakt',
      'weiterleiten',
      'forward',
      'speichern',
      'save in chat',
      'antworten',
      'reply',
      'konto löschen',
      'delete account',
      'chat verlassen',
      'leave',
      'gruppe verlassen'
    ]
  };

  /**
   * Pfadanfaenge der beiden Zustaende des Speichern-Umschalters.
   *
   * Der Umschalter ist das zweite Symbol der Aktionsleiste. Welches der beiden
   * Icons dort steht, ist die EINZIGE verlaessliche Auskunft darueber, ob eine
   * Nachricht im Chat gespeichert ist: Snapchat vermerkt das weder im Text noch
   * in aria-label/title, noch in einer Klasse - und auch nicht per
   * Hintergrundfarbe (per Diagnose an echten Nachrichten geprueft: gespeicherte
   * und nicht gespeicherte Nachrichten haben identisch rgb(51, 50, 50)).
   *
   * Beide Icons zeigen denselben Lesezeichen-Umriss; das Entspeichern-Icon hat
   * zusaetzlich einen Schraegstrich und beginnt deshalb an anderer Stelle.
   * Passt keiner der Anfaenge, wird NICHT geklickt, sondern gemeldet - ein
   * Fehlklick wuerde sonst eine ungespeicherte Nachricht speichern (und das
   * Gegenueber benachrichtigen).
   */
  const ICON_PATHS = {
    // Klick bewirkt "entspeichern" -> Nachricht IST aktuell gespeichert.
    saved: ['M18.742 4.576'],
    // Klick bewirkt "speichern" -> Nachricht ist aktuell NICHT gespeichert.
    unsaved: ['M5.47 7.627'],
    // "Kopieren" - nur bei Textnachrichten, vor dem Papierkorb (per Diagnose
    // belegt). Unterscheidet die fremde Textnachricht [Reagieren, Speichern,
    // Antworten, Kopieren] vom eigenen Snap [Reagieren, Speichern, Antworten,
    // Papierkorb] - beide haben 4 Symbole.
    copy: ['M4.638 6.167']
  };

  /**
   * Selektor-Kandidaten, in Reihenfolge der Praeferenz.
   *
   * Snapchat baut die Klassennamen als CSS-Module nach dem Muster
   * `sprechenderName hash` (beobachtet z. B. `class="banner_ad v8yGV"`) - es gibt
   * also neben dem Hash echte, lesbare Klassen. Teilstring-Selektoren auf
   * `class` sind deshalb sinnvolle Kandidaten und stehen hier hinter den
   * praeziseren data-testid/ARIA-Varianten.
   */
  const SELECTORS = {
    // Container, in dem die Nachrichten der geoeffneten Konversation liegen.
    //
    // '[id^="cv-"]' ist per echtem DOM-Dump bestaetigt: Snapchat vergibt der
    // Nachrichtenliste die id "cv-<konversations-uuid>" - stabiler als jede
    // gehashte Klasse, weil sie an die Konversations-ID gebunden ist statt an
    // einen Build-Hash.
    conversation: [
      '[id^="cv-"]',
      '[data-testid="conversation"]',
      '[data-testid="chat-conversation"]',
      '[aria-label*="Konversation" i]',
      '[aria-label*="conversation" i]',
      'main [role="log"]',
      'main [role="list"]',
      '[class*="conversation" i]',
      '[class*="messageList" i]',
      '[class*="chatBody" i]'
    ],
    // Einzelne Nachrichtenzeile innerhalb des Containers.
    //
    // Diese Liste ist nur noch RUECKFALL: primaer sucht der Scanner
    // strukturell (scanner.messageRows) nach Blatt-<li>s.
    //
    // Grund: 'li:has(> header)' - eine Nachricht als <li> mit <header> als
    // direktem Kind - stimmt zwar (per echtem DOM-Dump bestaetigt, und es
    // trennt sauber von Gruppen-<li>s und Datums-Trennern), ist aber zu eng.
    // Snapchat fasst aufeinanderfolgende Nachrichten desselben Absenders zu
    // einer Gruppe zusammen und gibt nur der ERSTEN eine Kopfzeile. Alle
    // weiteren Zeilen der Gruppe fielen damit durchs Raster und tauchten erst
    // im naechsten Durchlauf auf - deshalb waren mehrere Laeufe noetig.
    message: [
      'li:has(> header)',
      '[data-testid*="message" i]',
      '[data-testid*="chat-item" i]',
      '[role="listitem"]',
      'li',
      '[class*="messageRow" i]',
      '[class*="chatMessage" i]',
      '[class*="message" i]'
    ],
    // Popup-/Kontextmenue, das nach Rechtsklick/Longpress erscheint.
    menu: [
      '[role="menu"]',
      '[data-testid*="context" i]',
      '[data-testid*="menu" i]',
      '[class*="ContextMenu" i]',
      '[class*="contextmenu" i]'
    ],
    menuItem: ['[role="menuitem"]', 'li', 'button', '[tabindex]'],
    // Bestaetigungsdialog.
    dialog: ['[role="alertdialog"]', '[role="dialog"]', '[data-testid*="modal" i]'],
    dialogButton: ['button', '[role="button"]', '[tabindex="0"]'],
    // Liste der Chats in der linken Spalte (fuer "alle Chats").
    chatList: [
      '[data-testid="chat-list"]',
      '[aria-label*="Chats" i]',
      'nav [role="list"]',
      '[role="navigation"] [role="list"]'
    ],
    chatListItem: ['[data-testid*="chat" i][role="listitem"]', '[role="listitem"]', 'li']
  };

  /**
   * Timings in ms. Bewusst grosszuegig: die Web-App ist animiert und ein zu
   * schneller Ablauf sieht serverseitig nach Bot aus.
   *
   * Zwei Sorten, die das Tempo VERSCHIEDEN behandelt (siehe PAUSES unten):
   *  - Pausen fallen bei jeder Nachricht voll an. Nur sie bestimmen, wie lange
   *    ein Lauf dauert - hier wirkt das Tempo.
   *  - Obergrenzen (alles auf *Timeout) kosten nichts, solange das Erwartete
   *    rechtzeitig auftaucht. Sie mitzuskalieren macht den Lauf nicht schneller,
   *    sondern nur fehleranfaelliger: bei "Schnell" blieb so knapp eine Sekunde
   *    fuer die Aktionsleiste, und ein zaeher Moment endete als "kein Menü".
   */
  const TIMING = {
    afterScroll: 260,
    hoverSettle: 420, // Zeit, die die Hover-Aktionen zum Einblenden brauchen
    hoverTimeout: 1500,
    longPress: 620,
    menuTimeout: 2600,
    dialogTimeout: 2600,
    afterMenuClick: 420,
    betweenDeletes: 600,
    jitter: 350, // zufaellig 0..jitter zusaetzlich
    historyStep: 850, // Wartezeit pro Scroll-Schritt beim Nachladen
    historyMaxSteps: 400,
    historyIdleRounds: 3 // so viele Runden ohne neue Nachrichten = fertig
  };

  const DEFAULT_SETTINGS = {
    ownUsername: '', // Anzeigename/Username des Nutzers, verbessert die Erkennung
    onlyOwnMessages: true, // nur eigene Nachrichten anfassen (beidseitige Loeschung)
    scope: 'current', // 'current' | 'all'
    maxDeletions: 0, // 0 = unbegrenzt
    speed: 'normal', // 'careful' | 'normal' | 'fast' | 'turbo'
    customSelectors: { conversation: '', message: '', menu: '', dialog: '' },
    customLabels: { delete: '', unsave: '', confirmDelete: '' }
  };

  /**
   * Nur diese Werte skaliert das Tempo - es sind die Wartezeiten, die bei jeder
   * Nachricht wirklich anfallen. Alles andere sind Obergrenzen (siehe TIMING).
   */
  const PAUSES = [
    'afterScroll',
    'hoverSettle',
    'longPress',
    'afterMenuClick',
    'betweenDeletes',
    'jitter',
    'historyStep'
  ];

  const SPEED_FACTORS = { careful: 1.9, normal: 1.0, fast: 0.55, turbo: 0.3, blitz: 0.12 };

  SCDC.TYPES = TYPES;
  SCDC.TYPE_ORDER = TYPE_ORDER;
  SCDC.LABELS = LABELS;
  SCDC.ICON_PATHS = ICON_PATHS;
  SCDC.SELECTORS = SELECTORS;
  SCDC.TIMING = TIMING;
  SCDC.PAUSES = PAUSES;
  SCDC.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  SCDC.SPEED_FACTORS = SPEED_FACTORS;

  /** Nutzer-Overrides mit den Defaults verschmelzen. */
  SCDC.applySettings = function (settings) {
    SCDC.settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const cs = SCDC.settings.customSelectors || {};
    SCDC.activeSelectors = {};
    for (const key of Object.keys(SELECTORS)) {
      const custom = (cs[key] || '').trim();
      SCDC.activeSelectors[key] = custom ? [custom].concat(SELECTORS[key]) : SELECTORS[key];
    }
    const cl = SCDC.settings.customLabels || {};
    SCDC.activeLabels = {};
    for (const key of Object.keys(LABELS)) {
      const extra = (cl[key] || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      SCDC.activeLabels[key] = extra.concat(LABELS[key]);
    }
    const f = SPEED_FACTORS[SCDC.settings.speed] || 1;
    SCDC.timing = {};
    for (const [k, v] of Object.entries(TIMING)) {
      SCDC.timing[k] = PAUSES.includes(k) ? Math.round(v * f) : v;
    }
    return SCDC.settings;
  };

  SCDC.applySettings({});
})();
