/**
 * Popup: Menue zur Auswahl der Datentypen, Anzeige der Analyse und finale
 * Loeschbestaetigung.
 *
 * Der Zustand liegt im Content-Script, nicht hier - das Popup wird beim
 * Wegklicken zerstoert. Beim Oeffnen wird der Zustand nachgeladen.
 */
(function () {
  'use strict';

  const SCDC = window.SCDC;
  const $ = (id) => document.getElementById(id);

  const els = {
    context: $('context'),
    warning: $('warning'),
    error: $('error'),
    typeList: $('typeList'),
    scope: $('scope'),
    speed: $('speed'),
    speedHint: $('speedHint'),
    onlyOwn: $('onlyOwn'),
    btnScan: $('btnScan'),
    summary: $('summary'),
    countsBody: $('countsBody'),
    selectionSummary: $('selectionSummary'),
    dryRun: $('dryRun'),
    maxDeletions: $('maxDeletions'),
    confirmBox: $('confirmBox'),
    confirmInput: $('confirmInput'),
    btnBack: $('btnBack'),
    btnDelete: $('btnDelete'),
    progressBar: $('progressBar'),
    runStatus: $('runStatus'),
    btnAbort: $('btnAbort'),
    doneSummary: $('doneSummary'),
    btnRestart: $('btnRestart'),
    openOptions: $('openOptions'),
    steps: {
      select: $('step-select'),
      result: $('step-result'),
      run: $('step-run'),
      done: $('step-done')
    }
  };

  const CONFIRM_WORD = 'LÖSCHEN';
  let tabId = null;
  let lastScan = null;
  let pollTimer = null;

  /* ---------- Hilfen ---------- */

  function showStep(name) {
    for (const [key, el] of Object.entries(els.steps)) el.classList.toggle('hidden', key !== name);
  }

  function showError(msg) {
    els.error.textContent = msg;
    els.error.classList.toggle('hidden', !msg);
  }

  function selectedTypes() {
    return Array.from(els.typeList.querySelectorAll('input:checked')).map((i) => i.value);
  }

  async function send(msg) {
    if (tabId == null) throw new Error('Kein Snapchat-Tab aktiv.');
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, msg, (res) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(res);
      });
    });
  }

  async function saveUi() {
    await chrome.storage.local.set({
      scdcUi: {
        types: selectedTypes(),
        scope: els.scope.value,
        speed: els.speed.value,
        onlyOwn: els.onlyOwn.checked,
        maxDeletions: Number(els.maxDeletions.value || 0)
      }
    });
    // Tempo wirkt im Content-Script ueber die Settings.
    const stored = await chrome.storage.local.get('scdcSettings');
    const settings = Object.assign({}, stored.scdcSettings || {}, {
      speed: els.speed.value,
      scope: els.scope.value,
      onlyOwnMessages: els.onlyOwn.checked
    });
    await chrome.storage.local.set({ scdcSettings: settings });
  }

  /* ---------- Aufbau ---------- */

  function renderTypes(preselected) {
    els.typeList.innerHTML = '';
    for (const id of SCDC.TYPE_ORDER) {
      const t = SCDC.TYPES[id];
      const li = document.createElement('li');
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = id;
      input.checked = preselected ? preselected.includes(id) : false;
      input.addEventListener('change', () => {
        saveUi();
        if (lastScan) renderCounts(lastScan);
        updateDeleteButton();
      });
      const span = document.createElement('span');
      span.innerHTML = `${t.label}<em>${t.hint}</em>`;
      label.append(input, span);
      li.append(label);
      els.typeList.append(li);
    }
  }

  function renderCounts(scan) {
    const chosen = new Set(selectedTypes());
    els.countsBody.innerHTML = '';
    const targetTotal = expectedTotal();

    for (const id of SCDC.TYPE_ORDER) {
      const tr = document.createElement('tr');
      if (chosen.has(id)) tr.classList.add('is-selected');
      // Der Speicherstatus steht erst beim Ueberfahren fest (Umschalt-Icon der
      // Aktionsleiste) - eine Zahl waere hier frei erfunden.
      if (id === 'saved') {
        tr.innerHTML = `<td>${SCDC.TYPES[id].label}</td><td colspan="2">wird beim Löschen geprüft</td>`;
        els.countsBody.append(tr);
        continue;
      }
      const total = scan.counts[id] || 0;
      const own = scan.own[id] || 0;
      if (!total) tr.classList.add('is-zero');
      tr.innerHTML = `<td>${SCDC.TYPES[id].label}</td><td>${total}</td><td>${own}</td>`;
      els.countsBody.append(tr);
    }

    const chatInfo = scan.chats > 1 ? ` in ${scan.chats} Chats` : '';
    els.summary.textContent = `${scan.total} Nachrichten analysiert${chatInfo}.`;
    // Obergrenze, keine Zusage: Speicherstatus und Herkunft stehen erst beim
    // Überfahren fest, vorher kommt jede Nachricht des Typs in Frage.
    els.selectionSummary.textContent = `Zum Löschen vorgemerkt: höchstens ${targetTotal} Einträge${
      els.onlyOwn.checked ? ' – davon werden nur deine eigenen angefasst' : ''
    }.`;
    return targetTotal;
  }

  /**
   * Was das gewaehlte Tempo konkret bedeutet.
   *
   * Ohne diese Angabe ist die Auswahl ein Blindflug: die Zahlen sind
   * Richtwerte fuer eine eigene, nicht gespeicherte Nachricht - gespeicherte
   * brauchen laenger, weil sie zusaetzlich entspeichert und geprueft werden.
   */
  const SPEED_HINTS = {
    careful: 'Vorsichtig: längste Pausen, am unauffälligsten. Für die ersten Läufe.',
    normal: 'Normal: kurze, zufällige Pausen zwischen den Nachrichten.',
    fast: 'Schnell: Pausen etwa halbiert.',
    turbo:
      'Turbo: fast ohne Pausen zwischen den Klicks. ' +
      'Das sieht serverseitig deutlich nach Automatik aus; für große Chats gedacht, nicht als Dauereinstellung.',
    blitz:
      'Blitz: so schnell, wie Snapchat mitkommt — praktisch keine Pausen. Reagiert Snapchat einmal zu langsam, ' +
      'wird die Nachricht übersprungen statt falsch geklickt; dann einfach einen zweiten Lauf starten. ' +
      'Am stärksten nach Automatik aussehend — nur für große Chats.'
  };

  function renderSpeedHint() {
    const basis = SPEED_HINTS[els.speed.value] || '';
    // Nur Richtwerte - der tatsaechliche Wert steht waehrend des Laufs im
    // Overlay unten rechts, gemessen statt geschaetzt.
    els.speedHint.textContent = basis + ' Der gemessene Wert läuft während des Laufs im Overlay mit.';
    els.speedHint.classList.toggle('hint--warn', els.speed.value === 'turbo' || els.speed.value === 'blitz');
  }

  function updateDeleteButton() {
    const ok =
      selectedTypes().length > 0 &&
      (els.dryRun.checked || els.confirmInput.value.trim().toUpperCase() === CONFIRM_WORD);
    els.btnDelete.disabled = !ok;
    els.btnDelete.textContent = els.dryRun.checked ? 'Testlauf starten' : 'Endgültig löschen';
    els.confirmBox.classList.toggle('hidden', els.dryRun.checked);
  }

  /* ---------- Zustands-Polling ---------- */

  /**
   * Zaehlt die tatsaechlich betroffenen Nachrichten. Nutzt die Einzeldatensaetze
   * aus dem Scan, weil eine Nachricht auf mehrere gewaehlte Typen passen kann
   * (gespeicherter Snap = "Foto-Snaps" UND "Gespeichert") - summierte Spalten
   * wuerden sie doppelt zaehlen.
   */
  function expectedTotal() {
    if (!lastScan) return 0;
    const chosen = new Set(selectedTypes());

    if (Array.isArray(lastScan.records)) {
      // Bewusst eine OBERGRENZE, keine exakte Zahl: weder der Speicherstatus
      // noch die Herkunft stehen vor dem Ueberfahren fest (beides steht nur in
      // der Aktionsleiste). Nicht Passendes wird dann ohne Klick uebersprungen.
      // Deshalb wird `onlyOwn` hier NICHT gegengerechnet - die frueher dafuer
      // benutzte Ausrichtung hat eigene Nachrichten als fremd gezaehlt.
      return lastScan.records.filter((r) => chosen.has(r.t) || chosen.has('saved')).length;
    }
    // Fallback fuer Scans ohne Einzeldaten.
    return Array.from(chosen).reduce((sum, id) => sum + (lastScan.counts[id] || 0), 0);
  }

  /**
   * Abschlussmeldung eines Laufs.
   *
   * "gelöscht" darf hier nicht pauschal stehen: Snapchat erlaubt bei fremden
   * Nachrichten ausschliesslich das Entspeichern. Wird das als "gelöscht"
   * gemeldet, glaubt man, Inhalte seien weg, die tatsaechlich noch da sind.
   */
  /** Häufigster Überspringen-Grund, als lesbarer Satz. */
  function reasonHint(reasons) {
    const entries = Object.entries(reasons || {});
    if (!entries.length) return '';
    const [grund, anzahl] = entries.sort((a, b) => b[1] - a[1])[0];
    const texte = {
      'kein-menue':
        'Die Aktionsleiste erschien beim Überfahren nicht. Lass den Tab im Vordergrund und bewege die Maus währenddessen nicht über den Chat.',
      'entspeichern-ohne-wirkung': 'Das Entspeichern wurde geklickt, das Symbol zeigt aber weiterhin „gespeichert“.',
      'kein-loeschen-eintrag': 'Kein Löschen-Symbol vorhanden — bei fremden Nachrichten bietet Snapchat keins an.',
      'fremde-nachricht-nicht-gespeichert':
        'Nicht gespeicherte Nachricht von deinem Gegenüber — dafür gibt es bei Snapchat keine Aktion.',
      'fremde-nachricht-uebersprungen':
        'Nachricht von deinem Gegenüber, und „Nur meine Nachrichten“ ist aktiv. Ohne diese Option würde sie wenigstens entspeichert.',
      'keine-nachricht':
        'Bei dieser Nachricht erschien keine Aktionsleiste, obwohl es bei anderen klappte — es wurde nichts angefasst. Bitte in den Einstellungen die Diagnose starten und die Zeile „Zeiger zielt auf“ weitergeben.',
      weg: 'Die Nachricht verschwand während der Bearbeitung aus der Ansicht.'
    };
    let text = texte[grund];
    if (!text && grund.startsWith('speicher-status-unbekannt(4 Symbole')) {
      text =
        'Vermutlich eine Textnachricht deines Gegenübers: deren Speichern-Symbol (Sprechblase) kennt die Extension noch nicht. ' +
        'Sicherheitshalber wurde nichts geklickt. Eigene Textnachrichten sind davon nicht betroffen. ' +
        `Bitte diese Angabe weitergeben: ${grund}`;
    }
    if (!text && grund.startsWith('speicher-status-unbekannt')) {
      text =
        'Das Symbol zum Speichern/Entspeichern war keins der bekannten — vermutlich hat Snapchat die Symbole geändert. ' +
        'Sicherheitshalber wurde nichts geklickt, weil ein Fehlgriff die Nachricht speichern statt entspeichern würde. ' +
        `Bitte diese Angabe weitergeben: ${grund}`;
    }
    if (!text && grund.startsWith('kein-entspeichern-icon')) {
      const n = (grund.match(/\((\d+)/) || [])[1];
      text =
        `Die Aktionsleiste zeigte ${n} Symbole; erwartet werden 3 (fremde Nachricht) oder 4 (eigene). ` +
        'Sicherheitshalber wurde nichts geklickt — bei falscher Position würde eine Reaktion gesendet. ' +
        'Bitte in den Einstellungen die Diagnose starten und die Ausgabe weitergeben.';
    }
    if (!text && grund.startsWith('toolbar-da-aber-unsichtbar')) {
      text =
        'Die Aktionsleiste ist im Seitenquelltext vorhanden, aber ausgeblendet. Snapchat blendet sie per CSS erst bei echter Mausbewegung ein — das lässt sich per Skript nicht auslösen.';
    }
    return ` Häufigster Grund (${anzahl}×): ${text || grund}`;
  }

  function summarize(r) {
    if (r.dryRun) return `${r.deleted} markiert (Testlauf), ${r.failed} übersprungen.`;
    const unsaved = r.unsaved || 0;
    const hint = r.failed ? reasonHint(r.reasons) : '';
    if (unsaved && unsaved === r.deleted) {
      return `${unsaved} entspeichert (bei fremden Nachrichten lässt Snapchat nichts anderes zu), ${r.failed} übersprungen.${hint}`;
    }
    const detail = unsaved ? ` (davon ${unsaved} nur entspeichert, nicht gelöscht)` : '';
    return `${r.deleted} erledigt${detail}, ${r.failed} übersprungen.${hint}`;
  }

  function applyState(state) {
    if (!state) return;
    if (state.phase === 'scanning') {
      showStep('run');
      els.btnAbort.textContent = 'Analyse stoppen';
      els.runStatus.textContent = state.status || 'Analyse läuft …';
      els.progressBar.style.width = '35%';
    } else if (state.phase === 'deleting') {
      showStep('run');
      els.btnAbort.textContent = 'Stoppen';
      const done = state.progress.deleted + state.progress.failed;
      const total = expectedTotal();
      els.progressBar.style.width = total ? `${Math.min(100, (done / total) * 100)}%` : '50%';
      els.runStatus.textContent = state.status || `${state.progress.deleted} erledigt …`;
    } else if (state.phase === 'done' && state.lastRun) {
      showStep('done');
      const r = state.lastRun;
      els.doneSummary.textContent = summarize(r) + (r.aborted ? ' Lauf wurde gestoppt.' : '');
    } else if (state.phase === 'scanned' && state.scan) {
      lastScan = state.scan;
      renderCounts(state.scan);
      updateDeleteButton();
      showStep('result');
    } else if (state.phase === 'error') {
      showError(state.error || 'Unbekannter Fehler');
      showStep('select');
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      try {
        const res = await send({ cmd: 'getState' });
        if (res && res.state) {
          applyState(res.state);
          if (res.state.phase !== 'scanning' && res.state.phase !== 'deleting') stopPolling();
        }
      } catch (_) {
        stopPolling();
      }
    }, 600);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  /* ---------- Aktionen ---------- */

  els.btnScan.addEventListener('click', async () => {
    showError('');
    if (!selectedTypes().length) {
      showError('Bitte mindestens einen Datentyp auswählen.');
      return;
    }
    await saveUi();
    showStep('run');
    els.runStatus.textContent = 'Analyse startet …';
    els.progressBar.style.width = '10%';
    startPolling();
    try {
      const res = await send({ cmd: 'scan', scope: els.scope.value });
      stopPolling();
      if (!res || !res.ok) {
        showError(res?.error || 'Analyse fehlgeschlagen.');
        showStep('select');
        return;
      }
      lastScan = res.scan;
      renderCounts(res.scan);
      updateDeleteButton();
      showStep('result');
    } catch (err) {
      stopPolling();
      showError(err.message);
      showStep('select');
    }
  });

  els.btnDelete.addEventListener('click', async () => {
    showError('');
    await saveUi();
    showStep('run');
    els.progressBar.style.width = '0%';
    els.runStatus.textContent = 'Wird gestartet …';
    startPolling();
    try {
      const res = await send({
        cmd: 'delete',
        types: selectedTypes(),
        scope: els.scope.value,
        onlyOwn: els.onlyOwn.checked,
        dryRun: els.dryRun.checked,
        maxDeletions: Number(els.maxDeletions.value || 0)
      });
      stopPolling();
      if (!res || !res.ok) {
        const progress = res && typeof res.deleted === 'number' ? ` (bisher ${res.deleted} erledigt, ${res.failed} übersprungen)` : '';
        showError((res?.error || 'Löschen fehlgeschlagen.') + progress);
        showStep('result');
        return;
      }
      els.doneSummary.textContent =
        summarize(Object.assign({ dryRun: els.dryRun.checked }, res)) +
        (res.aborted ? ' Lauf wurde gestoppt.' : '');
      showStep('done');
    } catch (err) {
      stopPolling();
      showError(err.message);
      showStep('result');
    }
  });

  els.btnAbort.addEventListener('click', async () => {
    try {
      await send({ cmd: 'abort' });
    } catch (_) {
      /* Tab evtl. weg */
    }
  });

  els.btnBack.addEventListener('click', () => {
    showError('');
    showStep('select');
  });

  els.btnRestart.addEventListener('click', async () => {
    showError('');
    els.confirmInput.value = '';
    lastScan = null;
    try {
      await send({ cmd: 'reset' });
    } catch (_) {
      /* ignorieren */
    }
    showStep('select');
  });

  els.confirmInput.addEventListener('input', updateDeleteButton);
  els.dryRun.addEventListener('change', updateDeleteButton);
  els.onlyOwn.addEventListener('change', () => {
    saveUi();
    if (lastScan) renderCounts(lastScan);
  });
  els.scope.addEventListener('change', saveUi);
  els.speed.addEventListener('change', () => {
    saveUi();
    renderSpeedHint();
  });
  els.maxDeletions.addEventListener('change', saveUi);
  els.openOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());

  /* ---------- Start ---------- */

  (async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const onSnapchat = tab && /^https:\/\/(www\.)?snapchat\.com\/web\//.test(tab.url || '');
    tabId = tab ? tab.id : null;

    const stored = await chrome.storage.local.get(['scdcUi', 'scdcSettings']);
    const ui = stored.scdcUi || {};
    renderTypes(ui.types || ['snap_photo', 'snap_video', 'video_note', 'audio_note', 'saved']);
    els.scope.value = ui.scope || 'current';
    els.speed.value = ui.speed || 'normal';
    renderSpeedHint();
    els.onlyOwn.checked = ui.onlyOwn !== false;
    els.maxDeletions.value = ui.maxDeletions || 0;
    updateDeleteButton();

    if (!onSnapchat) {
      els.warning.classList.remove('hidden');
      els.context.textContent = 'Nicht auf snapchat.com/web/';
      els.btnScan.disabled = true;
      return;
    }

    try {
      const res = await send({ cmd: 'ping' });
      els.context.textContent = 'Verbunden mit Snapchat Web';
      applyState(res.state);
      if (res.state.phase === 'scanning' || res.state.phase === 'deleting') startPolling();
    } catch (_) {
      els.warning.classList.remove('hidden');
      els.warning.innerHTML = 'Seite bitte einmal neu laden (<b>F5</b>), damit die Extension aktiv wird.';
      els.context.textContent = 'Nicht verbunden';
      els.btnScan.disabled = true;
    }
  })();
})();
