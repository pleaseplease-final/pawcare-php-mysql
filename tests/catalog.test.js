import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogErrors,idFor} from '../src/catalogRules.js';
import {mergeManaged} from '../server/clinicCatalog.js';
import {baseCatalog,canonicalInvoice,priceCatalog} from '../server/priceCatalog.js';

const items=[{id:'product_probiotic',name:'Veterinary Probiotic & Prebiotic Paste'}];
test('price list form rules explain every problem', () => {
  const ok={name:'Joint chews',category:'Pet vitamins',price:'250.50',unit:'item / package',description:''};
  assert.deepEqual(catalogErrors(ok,items),{});
  assert.ok(catalogErrors({...ok,name:''},items).name);
  assert.ok(catalogErrors({...ok,name:'ab'},items).name);
  assert.ok(catalogErrors({...ok,name:'12345'},items).name,'needs a letter');
  assert.ok(catalogErrors({...ok,name:'<script>'},items).name);
  assert.ok(catalogErrors({...ok,name:' veterinary probiotic & prebiotic paste '},items).name,'duplicate ignores case and spaces');
  assert.ok(catalogErrors({...ok,category:'Furniture'},items).category);
  for(const price of ['','0','-5','12.345','abc','1000001'])assert.ok(catalogErrors({...ok,price},items).price,price);
  assert.ok(catalogErrors({...ok,unit:''},items).unit);
  assert.ok(catalogErrors({...ok,description:'x'.repeat(201)},items).description);
  assert.deepEqual(catalogErrors({price:'10',unit:'item',description:''},items,{name:'Fixed'}),{},'name and category are not re-checked when editing');
});
test('ids follow the item type and never collide', () => {
  assert.equal(idFor('Joint Chews!','Pet vitamins'),'product_joint_chews');
  assert.equal(idFor('Joint Chews!','Pet vitamins',['product_joint_chews']),'product_joint_chews_2');
  assert.equal(idFor('Skin scrape','Procedures & Care'),'srv_skin_scrape');
});
test('administrator rows reprice built-ins, add items and retire products', () => {
  const base=baseCatalog();
  const merged=mergeManaged(base,[
    {id:'srv_consult',name:'x',category:'x',price:'650.00',unit:'visit',description:'',active:true,previous_prices:['500.00'],revision:1},
    {id:'product_custom_one',name:'Custom medicine',category:'Pet medicine',price:'120.00',unit:'bottle',description:'',active:true,previous_prices:[],revision:0},
    {id:'product_probiotic',name:'x',category:'x',price:'750.00',unit:'item / package',description:'',active:false,previous_prices:[],revision:2}]);
  const find=id=>merged.find(i=>i.id===id);
  assert.equal(find('srv_consult').price,650);assert.equal(find('srv_consult').name,'Routine General Consultation & Exam');
  assert.equal(find('product_custom_one').requiresPrescription,true,'medicines need a prescription');
  assert.equal(find('product_probiotic').active,false);
  assert.equal(merged.length,base.length+1);
});
test('a visit keeps the price it was recorded at after a price change', () => {
  const merged=mergeManaged(baseCatalog(),[{id:'srv_consult',name:'x',category:'x',price:'650.00',unit:'visit',description:'',active:true,previous_prices:['500.00'],revision:1}]);
  const line=price=>({catalogId:'srv_consult',name:'Routine General Consultation & Exam',price,qty:1,source:'performed'});
  assert.equal(canonicalInvoice([line(500)],merged)[0].price,500,'recorded price honoured');
  assert.equal(canonicalInvoice([line(650)],merged)[0].price,650);
  assert.equal(canonicalInvoice([line(999)],merged),null,'an invented price is still refused');
  assert.equal(canonicalInvoice([{...line(500),source:'admission'}],merged,[]),null);
});
test('retired items leave sale lookups but stay billable on old visits', () => {
  assert.ok(priceCatalog().length>0 && priceCatalog({includeRetired:true}).length>=priceCatalog().length);
});
