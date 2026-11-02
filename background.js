/**
 * Service Worker.
 *
 * Haelt bewusst wenig Logik: der Ablauf lebt im Content-Script, damit ein Lauf
 * nicht abbricht, wenn der Worker eingeschlafen wird. Hier stehen nur
 * Erstinstallation und das Aufraeumen alter Laufzustaende.
 */

chrome.runtime.onInstalled.addListener(async (details) => {
  const stored = await chrome.storage.local.get('scdcSettings');
  if (!stored.scdcSettings) {
    await chrome.storage.local.set({
      scdcSettings: {
        ownUsername: '',
        onlyOwnMessages: true,
        scope: 'current',
        maxDeletions: 0,
        speed: 'normal',
        customSelectors: { conversation: '', message: '', menu: '', dialog: '' },
        customLabels: { delete: '', unsave: '', confirmDelete: '' }
      }
    });
  }
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// Beim Browserstart keinen halbfertigen Lauf wiederherstellen.
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove('scdcState');
});
