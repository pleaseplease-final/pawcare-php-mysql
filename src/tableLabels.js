// Gives every wide data table a label on each cell, so on a phone a row can stack as a readable card
// instead of being squeezed or cut off. Tables that already label their cells keep their own layout.
const SKIP = '.cc-timeline,.inv-items,.rep-table,.vc-tbl,[data-no-cards]';
const heading = th => (th.textContent || '').replace(/\s+/g, ' ').trim();

function prepare(table) {
  if (table.dataset.rtChecked) return table.classList.contains('rt-auto');
  const heads = [...table.querySelectorAll('thead tr:last-child th')];
  const eligible = heads.length >= 4 && !table.matches(SKIP) && !table.closest(SKIP) && !heads.some(th => th.colSpan > 1 || th.rowSpan > 1) && !table.querySelector('td[data-label]');
  table.dataset.rtChecked = '1';
  if (eligible) { table.classList.add('rt-auto'); table._heads = heads.map(heading); }
  return eligible;
}

function label(root) {
  root.querySelectorAll('table').forEach(table => {
    if (!prepare(table)) return;
    table.querySelectorAll('tbody tr').forEach(row => {
      if (row.dataset.rtDone === String(row.children.length)) return;
      [...row.children].forEach((cell, i) => { if (cell.tagName === 'TD' && cell.colSpan === 1 && !cell.hasAttribute('data-label')) cell.setAttribute('data-label', table._heads[i] || ''); });
      row.dataset.rtDone = String(row.children.length);
    });
  });
}

export function watchTables() {
  if (typeof document === 'undefined' || !window.MutationObserver) return;
  let queued = false;
  const run = () => { queued = false; try { label(document); } catch { /* labels are only a convenience */ } };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } }).observe(document.body, {childList: true, subtree: true});
  run();
}
