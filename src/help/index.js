import './help.css';
import { buildHelpViewModel } from './view-model.js';
import { createBackup, restoreBackup } from './data.js';

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

export function createHelpPage(host, { build = 'development', onCheckUpdate = () => {} } = {}) {
  let updateStatus = '';
  let backupStatus = '';
  let returnHref = '#/solve';
  let returnLabel = 'return to solve';
  const viewInput = () => ({ build, updateStatus, backupStatus, returnHref, returnLabel, browserBluetooth: Boolean(navigator.bluetooth?.requestDevice), expandedSections: [...root.querySelectorAll('details[open]')].map(details => details.dataset.section) });
  const root = el('section', '', 'brain cs-page help-page');
  root.dataset.brainStyle = 'orbit';
  root.setAttribute('aria-labelledby', 'help-heading');
  root.innerHTML = `
    <header class="cs-head"><p class="help-kicker">CubeSight · help</p><h1 id="help-heading" data-help-title></h1><p class="cs-sub" data-help-intro></p><a data-help-return href="#/solve"></a></header>
    <details data-section="shortcuts" open><summary>keyboard shortcuts</summary><div class="help-section" data-help-shortcuts></div></details>
    <details data-section="connect"><summary>connect a smart cube</summary><div class="help-section"><p data-help-browser-bluetooth></p><p data-help-connect></p><p data-help-mac></p><p data-help-ios></p></div></details>
    <details data-section="privacy"><summary>your data stays here</summary><div class="help-section"><p data-help-privacy></p><p data-help-backup></p><div class="help-data-port"><button class="text-button" type="button" data-help-export>export data</button><button class="text-button" type="button" data-help-import-button>import data</button><input type="file" data-help-import accept=".json,application/json" hidden><span data-help-status role="status" aria-live="polite"></span></div></div></details>
    <details data-section="credits"><summary>build and credits</summary><div class="help-section"><div class="build-info"><span>installed build</span><code data-help-build></code><button class="text-button" type="button" data-help-update>check for updates</button><small data-help-update-status>The build number identifies this CubeSight release.</small></div><p><span data-help-algorithms></span> <a href="https://www.speedsolving.com/wiki/index.php/OLL" target="_blank" rel="noopener noreferrer">SpeedSolving wiki</a> · <a href="https://speedcubedb.com/" target="_blank" rel="noopener noreferrer">SpeedCubeDB</a>.</p><p><span data-help-engine></span> (<a href="https://github.com/vangie/cube-xcross" target="_blank" rel="noopener noreferrer">source and licence</a>).</p></div></details>
  `;
  host.replaceChildren(root);
  const shortcutHost = root.querySelector('[data-help-shortcuts]');
  const status = root.querySelector('[data-help-status]');
  const update = root.querySelector('[data-help-update-status]');
  const render = () => {
    const model = buildHelpViewModel(viewInput());
    root.querySelector('[data-help-title]').textContent = model.title;
    root.querySelector('[data-help-intro]').textContent = model.intro;
    for (const [name, copy] of Object.entries(model.content)) {
      const target = root.querySelector(`[data-help-${name}]`); if (target) target.textContent = copy;
    }
    root.querySelector('[data-help-build]').textContent = model.build;
    const returnLink = root.querySelector('[data-help-return]');
    returnLink.href = model.returnHref; returnLink.textContent = model.returnLabel;
    root.querySelector('[data-help-browser-bluetooth]').textContent = model.browserBluetooth ? 'This browser can request a Bluetooth device.' : 'Bluetooth is unavailable in this browser; drills and the manual timer still work.';
    update.textContent = model.updateStatus || 'The build number identifies this CubeSight release.';
    status.textContent = model.backupStatus;
    for (const section of model.sections) {
      const details = root.querySelector(`[data-section="${section.id}"]`);
      if (details) details.querySelector('summary').textContent = section.title;
    }
    const expandedShortcutGroups = new Set([...shortcutHost.querySelectorAll('details[open]')].map(details => details.dataset.section));
    const groups = new Map();
    for (const item of model.shortcuts) {
      const rows = groups.get(item.context) ?? [];
      rows.push(item); groups.set(item.context, rows);
    }
    shortcutHost.replaceChildren(...[...groups].map(([context, rows]) => {
      const section = el('details'); section.dataset.section = `shortcuts-${context.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const heading = el('summary', context); const list = el('ul');
      section.open = expandedShortcutGroups.has(section.dataset.section);
      list.append(...rows.map(row => { const item = el('li'); const key = el('kbd', row.key); item.append(key, document.createTextNode(` ${row.action}`)); return item; }));
      section.append(heading, list); return section;
    }));
  };
  render();
  root.querySelector('[data-help-import-button]').addEventListener('click', () => root.querySelector('[data-help-import]').click());
  root.querySelector('[data-help-export]').addEventListener('click', async () => {
    backupStatus = 'Preparing backup…'; render();
    try { download(await createBackup(), 'cubesight-backup.json'); backupStatus = 'Backup downloaded.'; }
    catch (error) { backupStatus = error?.message || 'Could not export data.'; }
    render();
  });
  root.querySelector('[data-help-import]').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    backupStatus = 'Importing backup…'; render();
    try {
      const { count } = await restoreBackup(await file.text());
      backupStatus = `Imported ${count} solves and merged the other saved data.`;
    } catch (error) { backupStatus = error?.message || 'Could not import this backup.'; }
    event.target.value = ''; render();
  });
  root.querySelector('[data-help-update]').addEventListener('click', async () => {
    updateStatus = 'Checking for updates…'; render();
    try { updateStatus = await onCheckUpdate() || 'Update check complete.'; }
    catch (error) { updateStatus = error?.message || 'Could not check for updates.'; }
    render();
  });
  return { element: root, getViewModel: () => buildHelpViewModel(viewInput()), setReturn(href, label) { returnHref = href; returnLabel = label; render(); }, destroy() { root.remove(); } };
}
