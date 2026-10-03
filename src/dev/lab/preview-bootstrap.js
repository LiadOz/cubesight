const values = new Map();
const memoryStorage = {
  get length() { return values.size; },
  key(index) { return [...values.keys()][index] ?? null; },
  getItem(key) { return values.get(String(key)) ?? null; },
  setItem(key, value) { values.set(String(key), String(value)); },
  removeItem(key) { values.delete(String(key)); },
  clear() { values.clear(); },
};
Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage });
Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
try { Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined }); } catch { /* browser may expose a non-configurable storage facade */ }
const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
memoryStorage.setItem('cubesight-theme', theme);
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;
document.body.innerHTML = '<div id="app"></div>';

if (params.get('fixture') === 'history') {
  const now = Date.now();
  const records = Array.from({ length: 12 }, (_, index) => ({
    at: now - index * 86_400_000,
    scramble: ["R U R' U'", "F R U R' U' F'", "U R U' L' U R' U' L"][index % 3],
    solveMs: 14_500 + index * 385,
    moveCount: 24 + (index % 7),
    solveMoves: ["R", "U", "R'", "U'"],
    source: 'cube',
    solved: true,
    focus: 'speed',
    tps: 2.1,
  }));
  memoryStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records }));
}

await import('/src/main.js');
if (params.get('fixture') === 'history' && params.get('state') === 'filtered') {
  let attempts = 0;
  const timer = setInterval(() => {
    const input = document.querySelector('.history-filters input[name="query"]');
    if (input) {
      clearInterval(timer);
      input.value = 'R U';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (++attempts > 100) clearInterval(timer);
  }, 50);
}
