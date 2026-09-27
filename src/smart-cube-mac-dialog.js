// Self-contained one-time MAC entry used by the smart-cube connection when BLE
// advertising did not expose the cube's address.
//
// Web Bluetooth deliberately hides a device's Bluetooth address (it gives the
// page an opaque per-site id instead). The address is normally recoverable from
// the cube's BLE manufacturer advertising data, which is why no entry is
// needed in the common case. A few Chrome/OS/cube combinations do not expose
// that advertising payload, and because the GAN protocol uses the address as
// the AES salt BEFORE any packet can be decrypted, there is no GATT
// characteristic that exposes it either. This dialog is the rare fallback:
// find the address once in chrome://bluetooth-internals, paste it here, and
// the browser remembers it. It is intentionally self-contained so no trainer
// view has to send the user to another view.

const VALID_MAC = /^(?:[\da-f]{2}[:-]?){5}[\da-f]{2}$/i;

let dialogPromise = null;
let dialogEl = null;

function ensureDialog() {
  if (dialogEl) return dialogEl;
  dialogEl = document.createElement('dialog');
  dialogEl.className = 'smart-mac-dialog';
  dialogEl.innerHTML = `
    <form method="dialog">
      <p class="eyebrow">One-time setup</p>
      <h2>Enter the cube’s Bluetooth address</h2>
      <p class="smart-mac-why">Web Bluetooth hides the cube’s address for privacy, so it’s normally read automatically from the cube’s BLE advertising. Your browser or cube didn’t expose it this time, so enter the address once — CubeSight will remember it in this browser and you won’t be asked again.</p>
      <ol class="smart-mac-steps">
        <li>Open regular Chrome (not the installed app) and paste <code>chrome://bluetooth-internals/#devices</code> into the address bar. <button type="button" class="smart-mac-copy">Copy address</button><span class="smart-mac-copy-status" role="status"></span></li>
        <li>Turn the cube on, tap <strong>Start Scan</strong>, and find your cube in the device list.</li>
        <li>Copy the <strong>Address</strong> value (six pairs of hex digits, e.g. <code>AA:BB:CC:DD:EE:FF</code>) and paste it below.</li>
      </ol>
      <label class="smart-mac-field">
        <span>Bluetooth address</span>
        <input type="text" class="smart-mac-input" spellcheck="false" autocomplete="off" inputmode="text" placeholder="AA:BB:CC:DD:EE:FF">
      </label>
      <p class="smart-mac-error" role="alert" hidden></p>
      <div class="smart-mac-actions">
        <button type="button" class="smart-mac-cancel">Cancel</button>
        <button type="submit" class="primary-button smart-mac-submit">Connect</button>
      </div>
    </form>`;
  document.body.append(dialogEl);
  const $ = sel => dialogEl.querySelector(sel);
  $('.smart-mac-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('chrome://bluetooth-internals/#devices'); $('.smart-mac-copy-status').textContent = 'Copied — paste into Chrome’s address bar.'; }
    catch { $('.smart-mac-copy-status').textContent = 'Copy this: chrome://bluetooth-internals/#devices'; }
  });
  return dialogEl;
}

/**
 * Show the one-time MAC dialog and resolve with a cleaned-up address, or null if
 * the user cancels. Safe to call even with no user gesture (it is triggered
 * from the connect flow which already has one).
 */
export function promptMacAddress(device) {
  if (dialogPromise) return dialogPromise;
  const dialog = ensureDialog();
  const $ = sel => dialog.querySelector(sel);
  const input = $('.smart-mac-input');
  const error = $('.smart-mac-error');
  input.value = '';
  error.hidden = true;
  $('.smart-mac-copy-status').textContent = '';
  if (device?.name) dialog.querySelector('h2').textContent = `Enter the address for ${device.name}`;

  dialogPromise = new Promise(resolve => {
    const cleanup = () => { dialog.removeEventListener('close', onClose); dialog.removeEventListener('click', onBackdrop); };
    const onClose = () => { cleanup(); dialogPromise = null; resolve(input.value.trim() && VALID_MAC.test(input.value.trim()) ? normalise(input.value.trim()) : null); };
    const onBackdrop = event => { if (event.target === dialog) { dialog.close(); } };
    $('.smart-mac-cancel').addEventListener('click', () => dialog.close(), { once: true });
    dialog.addEventListener('close', onClose);
    dialog.addEventListener('click', onBackdrop);
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const value = input.value.trim();
      if (!VALID_MAC.test(value)) { error.textContent = 'That doesn’t look like a Bluetooth address. Use six pairs of hex digits, e.g. AA:BB:CC:DD:EE:FF.'; error.hidden = false; input.focus(); return; }
      cleanup(); dialog.close(); dialogPromise = null; resolve(normalise(value));
    }, { once: true });
    dialog.showModal();
    input.focus();
  });
  return dialogPromise;
}

function normalise(mac) {
  // Keep the colon-separated upper-case form the library expects.
  return mac.replace(/[-\s]/g, ':').replace(/(..)(?!$)/g, '$1:').toUpperCase();
}
