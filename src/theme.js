/** Follow the device until the user explicitly chooses a theme. */
export function setupTheme() {
  const system = matchMedia('(prefers-color-scheme: dark)');
  const button = document.querySelector('#theme-toggle');
  let preference;
  try { preference = localStorage.getItem('cubesight-theme'); } catch { /* Session-only theme. */ }
  if (!['light', 'dark'].includes(preference)) preference = null;

  function apply() {
    const theme = preference || (system.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#101820' : '#f5f7fa';
    const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  button.addEventListener('click', () => {
    preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('cubesight-theme', preference); } catch { /* Keep choice in memory. */ }
    apply();
  });
  system.addEventListener('change', apply);
  apply();
}
