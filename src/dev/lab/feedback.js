const STORAGE_KEY = 'cubesight-design-lab-feedback-v1';

export function readFeedback(storage = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveFeedback(entry, storage = localStorage) {
  const all = readFeedback(storage);
  all.push({ ...entry, at: new Date().toISOString() });
  storage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all;
}

export function downloadFeedback(entries = readFeedback()) {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href, download: 'cubesight-lab-feedback.json' });
  link.click();
  URL.revokeObjectURL(href);
}
