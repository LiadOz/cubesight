import { createFilledSelect, createToggle } from '../ui/shared/index.js';

/** Keep the trainers' existing change handlers while using approved controls. */
export function mountTrainerSettings(root) {
  const controls = [];
  for (const native of root.querySelectorAll('select')) {
    const host = document.createElement('span');
    host.className = 'trainer-settings-control';
    native.after(host);
    native.hidden = true;
    const caption = native.labels?.[0]?.cloneNode(true);
    caption?.querySelectorAll('select, input').forEach(node => node.remove());
    const label = native.getAttribute('aria-label') || caption?.textContent.trim() || 'Choose an option';
    const options = () => [...native.options].map(option => ({ value: option.value, label: option.textContent, disabled: option.disabled }));
    const select = createFilledSelect(host, { label, value: native.value, options: options(), onChange(value) {
      native.value = value;
      native.dispatchEvent(new Event('change', { bubbles: true }));
    } });
    let signature = JSON.stringify(options());
    const sync = () => {
      const next = options(), nextSignature = JSON.stringify(next);
      if (nextSignature !== signature) { select.setOptions(next, native.value); signature = nextSignature; }
      select.setValue(native.value);
      select.select.disabled = native.disabled || !next.some(option => !option.disabled);
    };
    native.addEventListener('change', sync);
    controls.push({ sync, destroy() { native.removeEventListener('change', sync); select.destroy(); host.remove(); native.hidden = false; } });
  }
  for (const native of root.querySelectorAll('input[type="checkbox"]')) {
    const label = native.closest('label');
    if (!label) continue;
    const nodes = [...label.childNodes];
    const text = label.textContent.trim();
    const host = document.createElement('span'); host.className = 'trainer-settings-control';
    label.replaceChildren(native, host); native.hidden = true;
    const toggle = createToggle(host, { label: text, checked: native.checked, onChange() {
      native.checked = !native.checked;
      native.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
    } });
    const sync = () => { toggle.disabled = native.disabled; toggle.setAttribute('aria-checked', String(native.checked)); };
    native.addEventListener('change', sync);
    controls.push({ sync, destroy() { native.removeEventListener('change', sync); label.replaceChildren(...nodes); native.hidden = false; } });
  }
  const sync = () => {
    controls.forEach(control => control.sync());
    root.querySelectorAll('.segment, [data-pll-mode]').forEach(button => {
      button.classList.add('chip');
      button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    });
  };
  sync();
  return { sync, destroy() { controls.forEach(control => control.destroy()); } };
}
