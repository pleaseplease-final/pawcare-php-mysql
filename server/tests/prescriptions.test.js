import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceCatalog, canonicalInvoice } from '../priceCatalog.js';
import { GUIDE_PRODUCTS } from '../productGuide.js';
import { calculateSupply } from '../../src/prescription.js';
import { normalizePrescription, prescriptionInvoice, validatePrescriptionSale } from '../prescriptions.js';

test('all 31 guide products retain the PDF prices and unique catalog IDs', () => {
  assert.equal(GUIDE_PRODUCTS.length,31);
  assert.deepEqual(GUIDE_PRODUCTS.map(p => p.price),[350,650,120,450,280,300,380,250,180,450,600,850,320,750,950,250,650,150,450,200,550,50,350,1200,1450,1550,1350,280,450,550,380]);
  assert.equal(new Set(priceCatalog().map(p => p.id)).size,priceCatalog().length);
  assert.ok(GUIDE_PRODUCTS.filter(p=>p.category==='Prescription diet').every(p=>p.requiresPrescription));
});
test('supply calculation uses entered units and rounds packages up without a weight or dose default', () => {
  const dose={amount:0.5,unit:'tablet',route:'by mouth',timesPerDay:2,days:7,unitsPerItem:5};
  assert.deepEqual(calculateSupply(dose),{quantity:2,totalUnits:7,directions:'0.5 tablet by mouth, 2 time(s) per day for 7 day(s).'});
  assert.equal(calculateSupply({...dose,amount:0.1,timesPerDay:3,days:10,unitsPerItem:3}).quantity,1);
  assert.equal(calculateSupply({...dose,amount:0.0001,timesPerDay:1,days:1,unitsPerItem:0.0001}).quantity,1);
  for(const patch of [{amount:0.00001},{unitsPerItem:0.00001},{amount:''},{amount:0},{timesPerDay:0.5},{timesPerDay:25},{days:0},{unitsPerItem:0},{unit:'mg'},{route:'unknown'},{amount:Infinity}]) assert.throws(()=>calculateSupply({...dose,...patch}));
});
test('prescription uses server catalog values and rejects unknown, duplicate or incomplete orders', () => {
  const row={catalogId:'product_multivitamin',quantity:2,instructions:'Veterinarian-entered directions',price:1,name:'Tampered'};
  const rx=normalizePrescription([row],'Additional advice');
  assert.equal(rx.items[0].price,250);assert.equal(rx.items[0].name,'Complete Multivitamin Syrup (w/ Taurine for Cats)');
  assert.match(rx.text,/Additional advice/);
  assert.deepEqual(canonicalInvoice(prescriptionInvoice(rx.items)),prescriptionInvoice(rx.items));
  for(const input of [[{...row,catalogId:'fake'}],[row,row],[{...row,quantity:1.5}],[{...row,instructions:''}],[null]]) assert.throws(()=>normalizePrescription(input,''),{status:400});
  const dose={amount:1,unit:'mL',route:'by mouth',timesPerDay:2,days:7,unitsPerItem:10};
  assert.throws(()=>normalizePrescription([{...row,dose,quantity:1}],''),/does not match/);
  assert.equal(normalizePrescription([{...row,dose,quantity:2}], '').items[0].instructions,'1 mL by mouth, 2 time(s) per day for 7 day(s).');
});
test('medicines/diets need this visit’s product order; split lines cannot exceed prescribed supply', () => {
  const med=priceCatalog().find(p=>p.id==='srv_nexgard');
  const line={catalogId:med.id,name:med.name,price:med.price,qty:1};
  assert.ok(validatePrescriptionSale([line],[]));
  assert.equal(validatePrescriptionSale([line],[{catalogId:med.id,quantity:1}]),null);
  assert.ok(validatePrescriptionSale([line,line],[{catalogId:med.id,quantity:1}]));
  assert.ok(validatePrescriptionSale([{catalogId:'product_renal_diet',qty:1}],[]));
  assert.equal(validatePrescriptionSale([{catalogId:'product_hard_collar',qty:1}],[]),null);
});

test('configured products cannot replace fixed guide entries', () => {
  const old=process.env.CLINIC_PRODUCTS_JSON;
  try { process.env.CLINIC_PRODUCTS_JSON=JSON.stringify([{id:'product_oatmeal_shampoo',name:'Replacement',category:'Pet shampoo',price:1}]); assert.throws(()=>priceCatalog(),/Duplicate/); }
  finally { if(old===undefined) delete process.env.CLINIC_PRODUCTS_JSON; else process.env.CLINIC_PRODUCTS_JSON=old; }
});
