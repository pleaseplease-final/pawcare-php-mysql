import { useEffect, useMemo, useRef, useState } from 'react';
import { clinicRequest } from '../clinicApi.js';
import ClinicDialog from '../components/ClinicDialog.jsx';
import { PaginatedTable } from '../components/Pagination.jsx';
import { catalogErrors, PRODUCT_CATEGORIES, SERVICE_CATEGORIES } from '../catalogRules.js';
import { csvCell } from '../salesCsv.js';

const peso = n => `₱${Number(n).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const EMPTY = {name: '', category: '', price: '', unit: 'item / package', description: ''};

function ItemForm({items, editing, onClose, onSaved}) {
  const [form, setForm] = useState(editing ? {name: editing.name, category: editing.category, price: String(editing.price), unit: editing.unit, description: editing.description} : EMPTY);
  const [touched, setTouched] = useState({}), [server, setServer] = useState({}), [top, setTop] = useState(''), [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const errors = catalogErrors(form, items, editing);
  const show = key => (touched[key] || server[key]) ? (errors[key] || server[key] || '') : '';
  const set = (key, value) => { setForm(previous => ({...previous, [key]: value})); setServer(previous => ({...previous, [key]: ''})); setTouched(previous => ({...previous, [key]: true})); };
  const attrs = key => ({name: key, 'aria-invalid': !!show(key), 'aria-describedby': `catalog-${key}-error`, onBlur: () => setTouched(previous => ({...previous, [key]: true}))});
  const error = key => <span id={`catalog-${key}-error`} className="err" aria-live="polite">{show(key)}</span>;
  const isRx = ['Pet medicine', 'Prescription diet'].includes(form.category);
  const submit = async event => {
    event.preventDefault();
    if (inFlight.current) return;
    setTouched({name: true, category: true, price: true, unit: true, description: true});
    if (Object.keys(errors).length) { requestAnimationFrame(() => event.currentTarget.querySelector('[aria-invalid="true"]')?.focus()); return; }
    inFlight.current = true; setSaving(true); setTop('');
    try {
      const body = {...form, price: form.price.trim(), name: form.name.trim(), ...(editing ? {revision: editing.revision, active: editing.active} : {})};
      const result = await clinicRequest(editing ? 'PUT' : 'POST', editing ? `/api/admin/catalog/${editing.id}` : '/api/admin/catalog', body);
      onSaved(result.item, editing ? 'saved' : 'added');
    } catch (e) {
      setTop(e.message); setServer(e.fields || {}); inFlight.current = false; setSaving(false);
    }
  };
  return <ClinicDialog label={editing ? `Edit ${editing.name}` : 'Add a service or product'} onClose={() => !saving && onClose()}>
    <form className="modal" style={{width: 'min(560px, 100%)'}} onSubmit={submit} noValidate>
      <h3>{editing ? 'Edit price list item' : 'Add a service or product'}</h3>
      <p className="sf-sub">{editing ? 'The name and category are fixed so saved invoices keep matching. Price changes apply to new bills; visits already recorded keep the price they were recorded at.' : 'The item appears for reception and veterinarians as soon as it is saved. The name cannot be changed later.'}</p>
      <fieldset disabled={saving} style={{border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 12}}>
        <div className="fld"><label htmlFor="catalog-name">Name <i>*</i></label>
          <input id="catalog-name" value={form.name} readOnly={!!editing} maxLength={80} onChange={e => set('name', e.target.value)} {...attrs('name')} />{error('name')}</div>
        <div className="fld"><label htmlFor="catalog-category">Category <i>*</i></label>
          {editing ? <input id="catalog-category" value={form.category} readOnly /> : <select id="catalog-category" value={form.category} onChange={e => set('category', e.target.value)} {...attrs('category')}>
            <option value="">Choose a category</option>
            <optgroup label="Services">{SERVICE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</optgroup>
            <optgroup label="Products">{PRODUCT_CATEGORIES.map(c => <option key={c}>{c}</option>)}</optgroup>
          </select>}{error('category')}
          {isRx && <small>This category needs a veterinarian’s prescription before it can be sold.</small>}</div>
        <div className="fld"><label htmlFor="catalog-price">Price (₱) <i>*</i></label>
          <input id="catalog-price" inputMode="decimal" value={form.price} onChange={e => set('price', e.target.value)} {...attrs('price')} />{error('price')}</div>
        <div className="fld"><label htmlFor="catalog-unit">Unit <i>*</i></label>
          <input id="catalog-unit" value={form.unit} maxLength={40} onChange={e => set('unit', e.target.value)} {...attrs('unit')} />{error('unit')}</div>
        <div className="fld"><label htmlFor="catalog-description">Description (optional)</label>
          <textarea id="catalog-description" rows={2} maxLength={200} value={form.description} onChange={e => set('description', e.target.value)} {...attrs('description')} />{error('description')}
          <small>{200 - form.description.length} characters left</small></div>
      </fieldset>
      {top && <p className="err" role="alert">{top}</p>}
      <div className="row end" style={{gap: 10, marginTop: 14}}>
        <button type="button" className="btn ghost" disabled={saving} onClick={onClose}>Cancel</button>
        <button className="btn gold" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add to price list'}</button>
      </div>
    </form>
  </ClinicDialog>;
}

export default function CatalogPage() {
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [q, setQ] = useState(''), [category, setCategory] = useState(''), [status, setStatus] = useState('active'), [kind, setKind] = useState('');
  const [form, setForm] = useState(null), [confirm, setConfirm] = useState(null), [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true); setError('');
    try { setItems((await clinicRequest('GET', '/api/admin/catalog')).items); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const replace = item => setItems(previous => previous.some(i => i.id === item.id) ? previous.map(i => i.id === item.id ? item : i) : [...previous, item]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter(i => (!category || i.category === category) && (!kind || i.kind === kind)
      && (status === 'all' || (status === 'active') === i.active) && (!term || `${i.name} ${i.category} ${i.description} ${i.id}`.toLowerCase().includes(term)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [items, q, category, kind, status]);
  const categories = [...new Set(items.map(i => i.category))].sort();
  const active = items.filter(i => i.active);
  const toggle = async item => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await clinicRequest('PUT', `/api/admin/catalog/${item.id}`, {price: String(item.price), unit: item.unit, description: item.description, revision: item.revision, active: !item.active});
      replace(result.item); setMessage(`${item.name} ${item.active ? 'retired. It can no longer be sold or prescribed.' : 'restored.'}`); setConfirm(null);
    } catch (e) { setError(e.message); setConfirm(null); }
    finally { setBusy(false); }
  };
  const exportCsv = () => {
    const rows = [['Item ID', 'Name', 'Category', 'Type', 'Unit', 'Price (PHP)', 'Status', 'Source', 'Prescription required', 'Last changed by'],
      ...shown.map(i => [i.id, i.name, i.category, i.kind, i.unit, i.price.toFixed(2), i.active ? 'Active' : 'Retired', i.builtIn ? 'Built-in' : 'Added by admin', i.requiresPrescription ? 'Yes' : 'No', i.updatedBy]),
      [], ['Summary', 'Value'], ['Items listed', String(shown.length)], ['Average price (PHP)', shown.length ? (shown.reduce((s, i) => s + Math.round(i.price * 100), 0) / shown.length / 100).toFixed(2) : '0.00']];
    const url = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8;'}));
    const link = document.createElement('a'); link.href = url; link.download = 'pawcare-price-list.csv'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };
  return <div className="staff-catalog">
    <section className="card" style={{marginBottom: 16}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14}}><div style={{flex: '1 1 360px', minWidth: 0}}><h3 style={{margin: 0}}>Services &amp; products price list</h3>
        <p className="sf-sub">Reception, veterinarians and owners all see these prices. Retired items stay on visits already recorded but cannot be sold or prescribed again.</p></div>
        <div className="row" style={{gap: 8, flexWrap: 'nowrap', flex: 'none'}}>
          <button className="btn ghost sm" disabled={!shown.length} onClick={exportCsv}>Export CSV</button>
          <button className="btn gold" onClick={() => { setMessage(''); setForm({}); }}>Add item</button></div></div>
      <dl className="rep-summary" aria-label="Price list summary" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, margin: 0}}>
        {[['Active items', active.length], ['Retired', items.length - active.length], ['Services', active.filter(i => i.kind === 'service').length], ['Products', active.filter(i => i.kind === 'product').length],
          ['Added by admin', items.filter(i => !i.builtIn).length], ['Average price', active.length ? peso(active.reduce((s, i) => s + i.price, 0) / active.length) : '—']].map(([label, value]) =>
          <div key={label} style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', background: '#f8fafc'}}><dt style={{fontSize: "calc(11.5px * var(--fs, 1))", color: '#64748b', fontWeight: 700}}>{label}</dt><dd style={{margin: '2px 0 0', fontSize: "calc(16px * var(--fs, 1))", fontWeight: 800}}>{value}</dd></div>)}
      </dl>
    </section>
    <section className="card">
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14}}>
        <input type="search" aria-label="Search the price list" placeholder="Search name or category" value={q} onChange={e => setQ(e.target.value)} style={{gridColumn: 'span 2', minWidth: 0}} />
        <select aria-label="Filter by category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
        <select aria-label="Filter by type" value={kind} onChange={e => setKind(e.target.value)}><option value="">Services and products</option><option value="service">Services</option><option value="product">Products</option></select>
        <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}><option value="active">Active</option><option value="retired">Retired</option><option value="all">All</option></select>
      </div>
      {message && <p role="status" className="ow-note info">{message}</p>}
      {error && <p role="alert" className="err">{error} <button className="btn sm ghost" onClick={load}>Reload price list</button></p>}
      {loading ? <p role="status">Loading price list…</p> : shown.length ? <div className="tw"><PaginatedTable label="Price list" resetKey={[q, category, kind, status]} className="tbl"><thead><tr><th>Item</th><th>Category</th><th>Unit</th><th style={{textAlign: 'right'}}>Price</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {shown.map(i => <tr key={i.id}>
          <td data-label="Item"><b>{i.name}</b>{i.description && <small style={{display: 'block', color: '#64748b'}}>{i.description}</small>}{i.requiresPrescription && <small style={{display: 'block', color: '#92400e'}}>Prescription required</small>}</td>
          <td data-label="Category">{i.category}</td><td data-label="Unit">{i.unit}</td>
          <td data-label="Price" style={{textAlign: 'right', fontWeight: 700}}>{peso(i.price)}</td>
          <td data-label="Status"><span className={`sf-pill ${i.active ? 'ok' : 'wa'}`}>{i.active ? 'Active' : 'Retired'}</span><small style={{display: 'block', color: '#64748b'}}>{i.builtIn ? 'Built-in' : 'Added by admin'}</small></td>
          <td data-label="Actions"><div className="row" style={{gap: 6}}>
            <button className="btn sm ghost" onClick={() => { setMessage(''); setForm(i); }} aria-label={`Edit ${i.name}`}>Edit</button>
            {i.active && i.kind === 'service' ? <button className="btn sm ghost" disabled title="Clinical services cannot be retired. Change the price instead." aria-label={`${i.name} cannot be retired`}>Retire</button>
              : <button className={`btn sm ${i.active ? 'danger' : 'gold'}`} disabled={busy} onClick={() => setConfirm(i)} aria-label={`${i.active ? 'Retire' : 'Restore'} ${i.name}`}>{i.active ? 'Retire' : 'Restore'}</button>}
          </div></td></tr>)}
      </tbody></PaginatedTable></div> : <div className="empty sm">{items.length ? 'No items match these filters.' : 'The price list is empty.'}</div>}
    </section>
    {form && <ItemForm items={items} editing={form.id ? form : null} onClose={() => setForm(null)} onSaved={(item, how) => { replace(item); setForm(null); setMessage(`${item.name} ${how}.`); }} />}
    {confirm && <ClinicDialog label={`${confirm.active ? 'Retire' : 'Restore'} ${confirm.name}`} onClose={() => !busy && setConfirm(null)}>
      <div className="modal" style={{width: 'min(480px, 100%)'}}><h3>{confirm.active ? 'Retire' : 'Restore'} {confirm.name}?</h3>
        <p>{confirm.active ? 'It will no longer appear for sale or prescribing. Visits that already include it keep it, and you can restore it any time.' : 'It will be available for sale and prescribing again at ' + peso(confirm.price) + '.'}</p>
        <div className="row end" style={{gap: 10}}><button className="btn ghost" data-dialog-autofocus disabled={busy} onClick={() => setConfirm(null)}>Keep as is</button>
          <button className={`btn ${confirm.active ? 'danger' : 'gold'}`} disabled={busy} onClick={() => toggle(confirm)}>{busy ? 'Saving…' : confirm.active ? 'Retire item' : 'Restore item'}</button></div></div>
    </ClinicDialog>}
  </div>;
}
