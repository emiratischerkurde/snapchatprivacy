/**
 * Optionsseite: Erkennungs- und Ablaufeinstellungen sowie manuelle Selektoren.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SELECTOR_KEYS = ['conversation', 'message', 'menu', 'dialog'];
  const LABEL_KEYS = ['delete', 'unsave', 'confirmDelete'];

  const DEFAULTS = {
    ownUsername: '',
    onlyOwnMessages: true,
    scope: 'current',
    maxDeletions: 0,
    speed: 'normal',
    customSelectors: { conversation: '', message: '', menu: '', dialog: '' },
    customLabels: { delete: '', unsave: '', confirmDelete: '' }
  };

  function setStatus(text, isError) {
    const el = $('status');
    el.textContent = text;
    el.style.color = isError ? '#ff5a50' : 'var(--accent)';
    if (text) setTimeout(() => (el.textContent = ''), 3200);
  }

  function fill(settings) {
    $('ownUsername').value = settings.ownUsername || '';
    $('speed').value = settings.speed || 'normal';
    $('maxDeletions').value = settings.maxDeletions || 0;
    for (const key of SELECTOR_KEYS) $(`sel_${key}`).value = (settings.customSelectors || {})[key] || '';
    for (const key of LABEL_KEYS) $(`lbl_${key}`).value = (settings.customLabels || {})[key] || '';
  }

  function collect() {
    const customSelectors = {};
    for (const key of SELECTOR_KEYS) customSelectors[key] = $(`sel_${key}`).value.trim();
    const customLabels = {};
    for (const key of LABEL_KEYS) customLabels[key] = $(`lbl_${key}`).value.trim();
    return {
      ownUsername: $('ownUsername').value.trim(),
      speed: $('speed').value,
      maxDeletions: Number($('maxDeletions').value || 0),
      customSelectors,
      customLabels
    };
  }

  async function save() {
    const stored = await chrome.storage.local.get('scdcSettings');
    const merged = Object.assign({}, DEFAULTS, stored.scdcSettings || {}, collect());
    await chrome.storage.local.set({ scdcSettings: merged });
    setStatus('Gespeichert.');
  }

  /** Startet den Picker im offenen Snapchat-Tab. */
  async function pick(kind) {
    const tabs = await chrome.tabs.query({ url: ['https://snapchat.com/web/*', 'https://www.snapchat.com/web/*'] });
    if (!tabs.length) {
      setStatus('Kein Snapchat-Tab offen.', true);
      return;
    }
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });

    chrome.tabs.sendMessage(tab.id, { cmd: 'pick', kind }, (res) => {
      if (chrome.runtime.lastError) {
        setStatus('Snapchat-Tab bitte neu laden (F5).', true);
        return;
      }
      if (res && res.selector) {
        $(`sel_${kind}`).value = res.selector;
        save();
      } else {
        setStatus('Auswahl abgebrochen.', true);
      }
    });
  }

  $('save').addEventListener('click', save);

  $('reset').addEventListener('click', async () => {
    await chrome.storage.local.set({ scdcSettings: Object.assign({}, DEFAULTS) });
    fill(DEFAULTS);
    setStatus('Zurückgesetzt.');
  });

  for (const btn of document.querySelectorAll('[data-pick]')) {
    btn.addEventListener('click', () => pick(btn.dataset.pick));
  }

  $('diagnose').addEventListener('click', async () => {
    const out = $('diagnoseOut');
    out.classList.remove('hidden');
    out.textContent = 'Läuft …';

    const tabs = await chrome.tabs.query({ url: ['https://snapchat.com/web/*', 'https://www.snapchat.com/web/*'] });
    if (!tabs.length) {
      out.textContent = 'Kein Snapchat-Tab offen. Bitte snapchat.com/web/ mit geöffnetem Chat in einem Tab haben.';
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { cmd: 'diagnose' }, (res) => {
      if (chrome.runtime.lastError) {
        out.textContent = 'Snapchat-Tab bitte neu laden (F5) und erneut versuchen.\n' + chrome.runtime.lastError.message;
        return;
      }
      if (!res || !res.ok) {
        out.textContent = 'Diagnose fehlgeschlagen.';
        return;
      }
      const r = res.result;
      const lines = [
        `Chat-Bereich gefunden: ${r.containerFound ? 'ja' : 'NEIN'}`,
        `Nachrichten im DOM: ${r.messageCount}` +
          (typeof r.mitEigenerKopfzeile === 'number'
            ? ` (davon ${r.mitEigenerKopfzeile} mit eigener Kopfzeile, ` +
              `${r.messageCount - r.mitEigenerKopfzeile} gruppierte Folgenachrichten)`
            : ''),
        `Aktionsleiste ließ sich öffnen: ${r.menuOpened ? 'ja' : 'NEIN'}`,
        r.menuItems && r.menuItems.length ? `Menüpunkte: ${r.menuItems.join(' | ')}` : null,
        `Hintergrund des Chatbereichs: ${r.backdrop || '(keiner)'}`,
        '',
        'Nachrichten (von unten nach oben):'
      ];
      for (const s of r.samples.slice().reverse()) {
        lines.push('');
        // Herkunft zweimal: geschaetzt (Ausrichtung, unzuverlaessig) und
        // abgelesen (Aktionsleiste, verbindlich). Weichen beide voneinander ab,
        // ist genau das der Grund, warum eigene Nachrichten uebersprungen wurden.
        const eigen = s.eigenLautLeiste === undefined || s.eigenLautLeiste === null
          ? 'unbekannt'
          : s.eigenLautLeiste;
        lines.push(
          `  Typ=${s.type}  eigene(Leiste)=${eigen}  eigene(geschätzt)=${s.ownGeschaetzt}  ` +
            `gespeichert(erkannt)=${s.saved}  Symbole=${s.symbole}`
        );
        lines.push(`    Absender laut Kopfzeile: ${s.absender || '(keine)'}`);
        if (s.hoverZiel) lines.push(`    Zeiger zielt auf: ${s.hoverZiel}`);
        if (s.weg !== undefined) lines.push(`    Menü geöffnet per: ${s.weg || '(nichts ging auf)'}`);
        if (s.menuePunkte && s.menuePunkte.length) lines.push(`    Menüpunkte: ${s.menuePunkte.join(' | ')}`);
        lines.push(`    Textquellen: ${JSON.stringify(s.candidates)}`);
        lines.push(`    Hintergrund erkannt als: ${s.hintergrundErkannt || '(keiner)'}`);
        for (const f of s.farben || []) lines.push(`      ${f}`);
        for (const i of s.icons || []) lines.push(`    ${i}`);
        if (s.versteckteIcons) lines.push(`    ausgeblendete Symbole: ${s.versteckteIcons}`);
      }
      lines.push('', 'Volle Details stehen auch in der Konsole des Snapchat-Tabs (F12).');
      out.textContent = lines.filter((l) => l !== null).join('\n');
    });
  });

  chrome.storage.local.get('scdcSettings').then((stored) => {
    fill(Object.assign({}, DEFAULTS, stored.scdcSettings || {}));
  });
})();
