import { CASE_COLORS, CASE_COLOR_CHANGE_EVENT, readCaseColorSetting, writeCaseColorSetting } from '../ui/cube/case-color.js';

/** Mount the shared, persistent case-color control in a trainer's settings area. */
export function mountCaseColorControl(host, storage = globalThis.localStorage) {
  if (!host) return () => {};
  const label = document.createElement('label');
  label.className = 'trainer-case-color-control';
  const caption = document.createElement('span');
  caption.textContent = 'case colors';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Case colors');
  for (const setting of CASE_COLORS) {
    const option = document.createElement('option');
    option.value = setting;
    option.textContent = setting;
    select.append(option);
  }
  select.value = readCaseColorSetting(storage);
  const onChange = () => writeCaseColorSetting(select.value, storage);
  const onSetting = event => { select.value = event.detail?.setting || readCaseColorSetting(storage); };
  select.addEventListener('change', onChange);
  window.addEventListener(CASE_COLOR_CHANGE_EVENT, onSetting);
  label.append(caption, select);
  host.append(label);
  return () => {
    select.removeEventListener('change', onChange);
    window.removeEventListener(CASE_COLOR_CHANGE_EVENT, onSetting);
    label.remove();
  };
}
