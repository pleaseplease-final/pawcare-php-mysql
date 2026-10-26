import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalInvoice, priceCatalog } from '../priceCatalog.js';
import { validateCarePlan } from '../careWorkflow.js';
test('catalog rejects price tampering, unknown items, renamed products and fractional quantities', () => {
 const item = priceCatalog()[0]; const line = {catalogId:item.id, name:item.name, price:item.price,qty:2};
 assert.equal(canonicalInvoice([line])[0].price,500);
 for(const patch of [{price:1},{catalogId:'fake'},{name:'Fake'},{qty:0.5},{qty:0}]) assert.equal(canonicalInvoice([{...line,...patch}]),null);
 assert.equal(canonicalInvoice([]),null);
});
test('configured products use fixed prices; invalid deployment configuration fails closed', () => {
 const old=process.env.CLINIC_PRODUCTS_JSON;
 try {
  process.env.CLINIC_PRODUCTS_JSON=JSON.stringify([{id:'product_shampoo',name:'Synthetic shampoo',category:'Pet shampoo',price:125}]);
  const product=priceCatalog().find(p=>p.id==='product_shampoo');
  assert.equal(canonicalInvoice([{...product,catalogId:product.id,qty:3}])[0].price,125);
  process.env.CLINIC_PRODUCTS_JSON=JSON.stringify([{...product,price:-1}]);assert.throws(()=>priceCatalog());
 } finally { if(old===undefined) delete process.env.CLINIC_PRODUCTS_JSON; else process.env.CLINIC_PRODUCTS_JSON=old; }
});
test('follow-up requires real dates, a supported status and clinical instructions', () => {
 assert.equal(validateCarePlan({},'2026-10-24'),null);
 const plan={careStatus:'Recheck required',followUpDate:'2026-10-27',followUpReason:'Assess healing'};
 assert.equal(validateCarePlan(plan,'2026-10-24'),null);
 for(const patch of [{careStatus:'Unknown'},{followUpDate:'2026-02-30'},{followUpDate:'2026-10-23'},{followUpReason:''}]) assert.ok(validateCarePlan({...plan,...patch},'2026-10-24'));
});
test('historical consultation cannot create an already overdue follow-up',()=>{
 const plan={careStatus:'Recheck required',followUpDate:'2026-10-23',followUpReason:'Review'};
 assert.ok(validateCarePlan(plan,'2026-10-20','2026-10-24'));
 assert.equal(validateCarePlan({...plan,followUpDate:'2026-10-24'},'2026-10-20','2026-10-24'),null);
});

test('checkout additions allow shampoo/accessories and reject unrecorded clinical items', async()=>{
 const {validateCheckoutAddons}=await import('../priceCatalog.js');
 const catalog=priceCatalog(),line=id=>{const p=catalog.find(p=>p.id===id);return{catalogId:p.id,name:p.name,price:p.price,qty:1};};
 for(const p of catalog){
  const allowed=['Pet shampoo','Pet accessories'].includes(p.category) && !p.requiresPrescription;
  assert.equal(validateCheckoutAddons([line(p.id)],{})===null,allowed,p.id);
 }
 const service=line('srv_consult'),vitamin=line('product_multivitamin'),medicine=line('srv_nexgard');
 assert.equal(validateCheckoutAddons([service],{performed_services:[service]}),null);
 assert.equal(validateCheckoutAddons([service],{},[service]),null,'Retain legacy saved charges');
 assert.ok(validateCheckoutAddons([{...service,qty:2}],{},[service]));
 assert.equal(validateCheckoutAddons([vitamin,medicine],{prescription_items:[{catalogId:vitamin.catalogId,quantity:1},{catalogId:medicine.catalogId,quantity:1}]}),null);
 assert.ok(validateCheckoutAddons([{...medicine,qty:2}],{prescription_items:[{catalogId:medicine.catalogId,quantity:1}]}));
 const shampoo=line('product_oatmeal_shampoo');assert.ok(validateCheckoutAddons([shampoo,shampoo],{}));
 assert.ok(validateCheckoutAddons([{...service,category:'Pet shampoo',source:'performed'}],{}),'Forged source/category cannot authorize a service');
});
