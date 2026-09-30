/**
 * Site theme: follow the device until the user explicitly chooses one.
 *
 * The preference is 'light', 'dark' or 'system' (stored as localStorage
 * 'cubesight-theme' = 'light'|'dark'; the key is removed for system). The
 * resolved theme lands on document.documentElement.dataset.theme. Anything
 * that changes the theme (the header button, the Brain's mode setting) goes
 * through setThemePreference(), and listeners hear it as a 'cubesight-theme'
 * event on document (detail: { theme, preference }).
 */
const KEY = 'cubesight-theme';
export const THEME_EVENT = 'cubesight-theme';

let preference = 'system';   // the in-memory copy, for when storage is unavailable
let system = null;
let button = null;

// The stored choice is the truth (another tab or a test may have changed it).
function readStored() {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch { return preference; /* Session-only theme. */ }
}

function systemQuery() {
  if (!system) {
    system = matchMedia('(prefers-color-scheme: dark)');
    system.addEventListener('change', apply);
  }
  return system;
}

function apply() {
  preference = readStored();
  const theme = preference === 'system' ? (systemQuery().matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#101820' : '#f5f7fa';
  if (button) {
    // The label says what a click does; the icon shows the mode you are in.
    const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
    button.setAttribute('aria-label', label);
    button.title = label;
    // The visible word is the mode you are in (the icon agrees), not the action.
    button.dataset.mode = theme;
    const word = button.querySelector('.theme-label');
    if (word) word.textContent = theme;
  }
  document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme, preference } }));
}

/** 'light' | 'dark' | 'system' */
export function getThemePreference() { return readStored(); }

/** Choose the theme: 'light', 'dark', or 'system' (follow the device). */
export function setThemePreference(value) {
  preference = value === 'light' || value === 'dark' ? value : 'system';
  try {
    if (preference === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch { /* Keep the choice in memory. */ }
  apply();
}

export function setupTheme() {
  button = document.querySelector('#theme-toggle');
  button?.addEventListener('click', () => setThemePreference(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  apply();
}
