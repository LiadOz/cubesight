import { CASE_COLORS, CASE_COLOR_CHANGE_EVENT, readCaseColorSetting, writeCaseColorSetting } from '../ui/cube/case-color.js';
import { createFilledSelect } from '../ui/shared/index.js';

/** Mount the shared, persistent case-color control in a trainer's settings area. */
export function mountCaseColorControl(host, storage = globalThis.localStorage) {
  if (!host) return () => {};
  const label = document.createElement('div');
  label.className = 'trainer-case-color-control';
  const select = createFilledSelect(label, {
    label: 'case colors', value: readCaseColorSetting(storage),
    options: CASE_COLORS.map(setting => ({ value: setting, label: setting })),
    onChange: value => writeCaseColorSetting(value, storage),
  });
  const onSetting = event => { select.setValue(event.detail?.setting || readCaseColorSetting(storage)); };
  window.addEventListener(CASE_COLOR_CHANGE_EVENT, onSetting);
  host.append(label);
  return () => {
    select.destroy();
    window.removeEventListener(CASE_COLOR_CHANGE_EVENT, onSetting);
    label.remove();
  };
}
