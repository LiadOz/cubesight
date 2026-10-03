import './help.css';
import { buildHelpViewModel } from './view-model.js';
import { createBackup, restoreBackup } from './data.js';
import { createButton, createFilledSelect, createKeyBar, createNavigationRail, createRightDrawer, createSection } from '../ui/shared/index.js';

const el = (tag, text = '', className = '') => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const download = (text, name) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = el('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const PAGES = [
  { id: 'overview', label: 'overview' }, { id: 'shortcuts', label: 'shortcuts' },
  { id: 'connect', label: 'connect a cube' }, { id: 'privacy', label: 'offline and data' },
  { id: 'credits', label: 'build and credits' },
];

export function createHelpPage(host, { build = 'development', development = build === 'development', onCheckUpdate = () => {} } = {}) {
  let updateStatus = '';
  let backupStatus = '';
  let returnHref = '#/solve';
  let returnLabel = 'return to solve';
  let activePage = 'overview';
  let shortcutContext = 'every page';
  let shortcutSelect = null;
  const root = el('section', '', 'help-page');
  root.setAttribute('aria-label', 'CubeSight help');
  const drawer = createRightDrawer(document.body, { title: 'help', subtitle: 'CubeSight · help', onClose: () => {
    if (location.hash === '#/help') location.hash = returnHref;
  } });
  const closeForNavigation = () => { if (location.hash !== '#/help' && drawer.element.open) drawer.close(); };
  window.addEventListener('hashchange', closeForNavigation);
  const layout = el('div', '', 'help-layout');
  const navHost = el('div', '', 'help-nav-host');
  const content = el('div', '', 'help-content');
  layout.append(navHost, content);
  const returnAction = el('div', '', 'help-return');
  const close = createButton(returnAction, { label: returnLabel, variant: 'text', onClick: () => drawer.close() });
  root.append(layout, returnAction);
  drawer.body.append(root);
  host.replaceChildren();

  const model = () => buildHelpViewModel({ build, development, updateStatus, backupStatus, returnHref, returnLabel, browserBluetooth: Boolean(navigator.bluetooth?.requestDevice), secureContext: Boolean(globalThis.isSecureContext) });
  const renderNav = () => {
    navHost.replaceChildren();
    const nav = createNavigationRail(navHost, { active: activePage, items: PAGES.map(({ id, label }) => ({ id, label, href: `#${id}` })) });
    nav.addEventListener('click', event => {
      const link = event.target.closest('a'); if (!link) return;
      event.preventDefault(); activePage = link.hash.slice(1); renderPage(); renderNav();
    });
  };
  const renderPage = () => {
    const vm = model();
    shortcutSelect?.destroy(); shortcutSelect = null;
    content.replaceChildren();
    const section = createSection(content, { eyebrow: 'help', title: activePage === 'overview' ? vm.title : PAGES.find(page => page.id === activePage)?.label, label: 'Help section' });
    if (activePage === 'overview') {
      section.append(el('p', vm.content.overview, 'help-copy help-overview'));
      const links = el('div', '', 'help-arrow-links');
      for (const page of PAGES.slice(1)) {
        const row = el('button', '', 'help-arrow-link'); row.type = 'button'; row.append(el('span', page.label), el('span', '→', 'help-arrow'));
        row.addEventListener('click', () => { activePage = page.id; renderPage(); renderNav(); }); links.append(row);
      }
      section.append(links);
      if (vm.devGalleryLinks.length) {
        const dev = el('div', '', 'help-dev-links'); vm.devGalleryLinks.forEach(item => { const link = el('a', item.label); link.href = item.href; dev.append(link); }); section.append(dev);
      }
    } else if (activePage === 'shortcuts') {
      section.append(el('p', 'Choose a page to see the keys available there.', 'help-copy'));
      const contexts = [...new Set(vm.shortcuts.map(item => item.context))];
      if (!contexts.includes(shortcutContext)) shortcutContext = contexts[0] || '';
      shortcutSelect = createFilledSelect(section, { label: 'page', value: shortcutContext, options: contexts.map(context => ({ value: context, label: context })), onChange: value => { shortcutContext = value; renderPage(); } });
      const rows = vm.shortcuts.filter(item => item.context === shortcutContext);
      const list = el('div', '', 'help-key-list');
      rows.forEach(({ key, action }) => { const row = el('div', '', 'help-key-row'); createKeyBar(row, [{ key, label: action }]); list.append(row); });
      section.append(list);
    } else if (activePage === 'connect') {
      section.append(el('p', vm.content.connect, 'help-copy'));
      section.append(el('p', !vm.secureContext ? 'Bluetooth needs a secure page. Use CubeSight on localhost or HTTPS; drills and the manual timer work without a cube.' : vm.browserBluetooth ? 'This browser can request a Bluetooth device.' : 'Bluetooth is unavailable in this browser; drills and the manual timer work without a cube.', 'help-note'));
      section.append(el('h3', 'Bluetooth address on Android, Windows or Linux'));
      section.append(el('p', vm.content.mac, 'help-copy'));
      section.append(el('p', vm.content.ios, 'help-copy'));
    } else if (activePage === 'privacy') {
      section.append(el('p', vm.content.privacy, 'help-copy'));
      section.append(el('p', vm.content.backup, 'help-copy'));
      const actions = el('div', '', 'help-data-port');
      const exportButton = createButton(actions, { label: 'export backup', variant: 'secondary', onClick: exportBackup }); exportButton.dataset.helpExport = '';
      const importButton = createButton(actions, { label: 'import backup', variant: 'secondary', onClick: () => file.click() }); importButton.dataset.helpImportButton = '';
      const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
      file.addEventListener('change', importBackup); actions.append(file);
      const status = el('p', vm.backupStatus, 'help-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); actions.append(status); section.append(actions);
    } else if (activePage === 'credits') {
      const buildInfo = el('div', '', 'help-build'); buildInfo.append(el('span', 'installed build'));
      const buildLabel = el('code', vm.build); buildLabel.dataset.helpBuild = ''; buildInfo.append(buildLabel);
      const updateButton = createButton(buildInfo, { label: 'check for updates', variant: 'text', onClick: checkUpdate }); updateButton.dataset.helpUpdate = '';
      const updateLabel = el('small', vm.updateStatus || 'The build number identifies this CubeSight release.'); updateLabel.dataset.helpUpdateStatus = ''; buildInfo.append(updateLabel); section.append(buildInfo);
      const algorithms = el('p', vm.content.algorithms, 'help-copy');
      algorithms.append(document.createTextNode(' '), externalLink('SpeedSolving wiki', 'https://www.speedsolving.com/wiki/index.php/OLL'), document.createTextNode(' · '), externalLink('SpeedCubeDB', 'https://speedcubedb.com/'), document.createTextNode('.')); section.append(algorithms);
      const engine = el('p', vm.content.engine, 'help-copy'); engine.append(document.createTextNode(' '), externalLink('source and licence', 'https://github.com/vangie/cube-xcross')); section.append(engine);
      const demo = el('p', 'Share a setup and alg as a playable lesson.', 'help-copy');
      const formatLink = el('a', 'demo link format'); formatLink.href = '#/demo/format'; demo.append(document.createTextNode(' '), formatLink); section.append(demo);
    }
    close.textContent = vm.returnLabel;
  };
  const externalLink = (label, href) => { const link = el('a', label); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link; };
  async function exportBackup() {
    backupStatus = 'Preparing backup…'; renderPage();
    try { download(await createBackup(), 'cubesight-backup.json'); backupStatus = 'Backup downloaded.'; }
    catch (error) { backupStatus = error?.message || 'Could not export data.'; }
    renderPage();
  }
  async function importBackup(event) {
    const file = event.target.files?.[0]; if (!file) return;
    backupStatus = 'Importing backup…'; renderPage();
    try { const { count } = await restoreBackup(await file.text()); backupStatus = `Imported ${count} solves and merged the other saved data.`; }
    catch (error) { backupStatus = error?.message || 'Could not import this backup.'; }
    event.target.value = ''; renderPage();
  }
  async function checkUpdate() {
    updateStatus = 'Checking for updates…'; renderPage();
    try { updateStatus = await onCheckUpdate() || 'Update check complete.'; }
    catch (error) { updateStatus = error?.message || 'Could not check for updates.'; }
    renderPage();
  }
  renderNav(); renderPage();
  return {
    element: root,
    getViewModel: model,
    open() { drawer.open(); },
    setReturn(href, label) { returnHref = href; returnLabel = label; close.textContent = label; },
    destroy() { window.removeEventListener('hashchange', closeForNavigation); shortcutSelect?.destroy(); drawer.destroy(); root.remove(); },
  };
}
