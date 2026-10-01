// The shared pages sit beside the content rooted in .brain, so copy the active
// semantic token values to the document shell after mounting a page. This keeps
// the site header and page canvas on the exact same Orbit / Mono palette.
let listening = false;

export function syncPageTokens(page) {
  const styles = getComputedStyle(page);
  const root = document.documentElement;
  root.style.setProperty('--cs-page', styles.getPropertyValue('--b-bg').trim());
  root.style.setProperty('--cs-page-line', styles.getPropertyValue('--b-hairline').trim());
  if (!listening) {
    listening = true;
    document.addEventListener('cubesight-theme', () => {
      const currentPage = document.querySelector('.cs-host:not([hidden]) .brain, .cs-host:not([hidden]).brain');
      if (currentPage) syncPageTokens(currentPage);
    });
  }
}
