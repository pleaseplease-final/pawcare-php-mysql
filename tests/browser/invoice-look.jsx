// Renders the paid checkout dialog with sample data. Checks that it reads as an official receipt and shows its parts.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import '../../src/styles.css';
import '../../src/fonts.css';
import '../../src/print-documents.css';
import '../../src/polish-v2.css';
import BillingModal from '../../src/roles/BillingModal.jsx';

window.fetch = async () => new Response(JSON.stringify({catalog: []}), {status: 200, headers: {'Content-Type': 'application/json'}});
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const appt = {id: 'a_8f31c2d94b', petId: 'p1', vetId: 'v1', date: '2026-10-26', time: '10:30', status: 'Completed', reason: 'Check-up: Skin irritation', billingStatus: 'Paid', amount: 1350, paidAt: '2026-10-26T04:12:00Z',
  paymentMethod: 'Cash', paymentReference: 'CASH-441220', cashTendered: 1500, changeAmount: 150,
  invoiceItems: [{name: 'Check-up and consultation', category: 'Consultation', price: 500, qty: 1, source: 'performed'}, {name: 'Anti-Rabies Vaccine (Annual Booster)', category: 'Vaccination', price: 350, qty: 1, source: 'performed'}, {name: 'Oatmeal shampoo 250 mL', category: 'Product', price: 250, qty: 2}]};
const db = {pets: [{id: 'p1', name: 'Zia', species: 'Dog', breed: 'Pomeranian', ownerId: 'o1'}], owners: [{id: 'o1', name: 'Czarina J. Ybanez', phone: '+639198933509', email: 'czarina@example.com'}], appts: [appt], records: [], log: []};
const me = {id: 'u_asst', role: 'assistant', name: 'Cza Ybanez'};
const root = createRoot(document.getElementById('fixture'));
flushSync(() => root.render(<BillingModal appt={appt} db={db} setDb={() => {}} me={me} onClose={() => {}} />));
await new Promise(r => setTimeout(r, 400));
const text = document.body.textContent;
try {
  assert(/Official Receipt/.test(text) && /OR-8F31C2D94B|OR-[A-Z0-9]+/.test(text), 'Shows an official receipt with an O.R. number');
  assert(text.includes('One Thousand Three Hundred Fifty Pesos and 00/100'), 'Amount is written in words');
  ['PAID', 'Received from', 'Patient', 'Unit price', 'Total amount paid', 'Cash tendered', 'Change', 'Form of payment', 'Cashier / Authorized representative'].forEach(word => assert(text.includes(word), `Receipt shows ${word}`));
  assert(text.includes('₱1,350.00'), 'Total is shown in pesos');
  assert(document.querySelectorAll('.inv-items tbody tr').length === 3, 'Three receipt lines');
  assert(document.querySelector('dialog[open]'), 'Opens as a dialog');
  document.body.dataset.ready = '1';
  document.getElementById('results').textContent = 'PASS invoice-look';
} catch (e) { document.getElementById('results').textContent = 'FAIL ' + e.message; }
