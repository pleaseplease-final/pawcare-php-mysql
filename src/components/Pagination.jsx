import { Children, cloneElement, isValidElement, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import './pagination.css';

export const PAGE_SIZE = 10;
export function pageBounds(total, requested = 1) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.trunc(Number(requested)) || 1));
  const start = (page - 1) * PAGE_SIZE;
  return { page, pages, start, end: Math.min(start + PAGE_SIZE, total), total };
}

function usePage(total, resetKey) {
  const key = JSON.stringify(resetKey ?? null);
  const [state, setState] = useState({ key, page: 1 });
  // Reset synchronously so a changed filter never shows an unrelated later page.
  if (state.key !== key) setState({ key, page: 1 });
  const bounds = pageBounds(total, state.key === key ? state.page : 1);
  if (state.key === key && state.page !== bounds.page) setState({ key, page: bounds.page });
  return { ...bounds, go: page => setState({ key, page: pageBounds(total, page).page }) };
}

export function Pagination({ page, pages, start, end, total, go, label = 'Records' }) {
  const numbers = [...new Set([1, page - 1, page, page + 1, pages])].filter(n => n >= 1 && n <= pages).sort((a,b) => a-b);
  return <nav className="pagination" aria-label={`${label} pagination`}>
    <p className="pagination-range" role="status" aria-live="polite"><b>{total ? start + 1 : 0}–{end}</b> of <b>{total}</b><span> · 10 per page</span></p>
    <div className="pagination-controls">
      <button type="button" aria-label="First page" disabled={page === 1} onClick={() => go(1)}><ChevronsLeft size={16} /></button>
      <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => go(page - 1)}><ChevronLeft size={16} /></button>
      {numbers.map((n,i) => <span className="pagination-number" key={n}>{i > 0 && n > numbers[i-1] + 1 && <span className="pagination-gap" aria-hidden="true">…</span>}<button type="button" aria-label={`Go to page ${n}`} aria-current={page === n ? 'page' : undefined} onClick={() => go(n)}>{n}</button></span>)}
      <span className="pagination-mobile-page">{page} / {pages}</span>
      <button type="button" aria-label="Next page" disabled={page === pages} onClick={() => go(page + 1)}><ChevronRight size={16} /></button>
      <button type="button" aria-label="Last page" disabled={page === pages} onClick={() => go(pages)}><ChevronsRight size={16} /></button>
    </div>
  </nav>;
}

const pageChildren = (children, page, hiddenClass) => Children.toArray(children).map((row, index) => {
  if (!isValidElement(row)) return row;
  const hidden = index < page.start || index >= page.end;
  return cloneElement(row, { className: [row.props.className, hidden ? hiddenClass : ''].filter(Boolean).join(' ') });
});

// Retain the complete filtered dataset in the DOM for print. Screen-hidden rows
// are excluded from layout and the accessibility tree, then restored in print CSS.
export function PaginatedTable({ children, label = 'Records', resetKey, ...props }) {
  const sections = Children.toArray(children);
  const total = sections.filter(s => isValidElement(s) && s.type === 'tbody').reduce((n,s) => n + Children.count(Children.toArray(s.props.children)), 0);
  const page = usePage(total, resetKey);
  let offset = 0;
  const body = sections.map(section => {
    if (!isValidElement(section) || section.type !== 'tbody') return section;
    const rows = Children.toArray(section.props.children);
    const local = { start: page.start - offset, end: page.end - offset };
    offset += rows.length;
    return cloneElement(section, {}, pageChildren(rows, local, 'pagination-hidden-row'));
  });
  return <><table {...props}>{body}</table><Pagination {...page} label={label} /></>;
}

export function PaginatedList({ children, as: Tag = 'div', label = 'Records', resetKey, ...props }) {
  const rows = Children.toArray(children);
  const page = usePage(rows.length, resetKey);
  return <><Tag {...props}>{pageChildren(rows, page, 'pagination-hidden-item')}</Tag>{rows.length > PAGE_SIZE && <Pagination {...page} label={label} />}</>;
}
