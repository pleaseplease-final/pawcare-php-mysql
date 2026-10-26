import {test} from 'node:test';
import assert from 'node:assert/strict';
import {categoryOf, summarize, CATEGORY_LABEL} from '../src/reportSummary.js';

const paid = (id, amount, paymentMethod, items = [{name: 'Check-up', qty: 1}]) => ({id, billingStatus: 'Paid', amount, paymentMethod, invoiceItems: items});
const db = {vacc: [], vets: [], pets: [], owners: []};

test('the sales report adds up the saved payments, by method', () => {
  const list = [paid('a', 500, 'Cash'), paid('b', 350.5, 'GCash', [{name: 'Vaccine', qty: 1}, {name: 'Shampoo', qty: 2}]), paid('c', 149.5, 'Cash')];
  const rows = Object.fromEntries(summarize('sales', list, db));
  assert.equal(rows['Matching records'], '3');
  assert.equal(rows['Total collected'], '₱1,000.00');
  assert.equal(rows['Average per paid visit'], '₱333.33');
  assert.equal(rows['Cash payments'], '2 · ₱649.50');
  assert.equal(rows['GCash payments'], '1 · ₱350.50');
  assert.equal(rows['Items sold'], '5');
});
test('the payment method is the filter for sales', () => {
  assert.equal(CATEGORY_LABEL.sales, 'Payment method');
  assert.equal(categoryOf('sales', paid('a', 1, 'Maya'), db), 'Maya');
  assert.equal(categoryOf('sales', paid('a', 1, ''), db), 'Not recorded');
});
