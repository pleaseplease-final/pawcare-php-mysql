// Text size is a per-device choice. Everything scales from one CSS variable (--fs, see polish-v2.css).
export const TEXT_SIZES = [['normal', 'Normal', 'A'], ['large', 'Large', 'A'], ['xlarge', 'Extra large', 'A']];
const KEY = 'pawcare_text_size';
export function getTextSize() {
  try { const v = localStorage.getItem(KEY); if (TEXT_SIZES.some(([k]) => k === v)) return v; } catch { /* storage may be blocked */ }
  return 'large';
}
export function setTextSize(size) {
  document.documentElement.dataset.textSize = size;
  try { localStorage.setItem(KEY, size); } catch { /* the choice just will not be remembered */ }
}
export const applyTextSize = () => { document.documentElement.dataset.textSize = getTextSize(); };
