import {DEFAULT_DEWORMING_PRODUCTS} from '../src/dewormingProducts.js';
// Actual stock details are deployment-owned, never generated from a patient or date.
export function dewormingProducts(){
 const products=JSON.parse(process.env.CLINIC_DEWORMING_PRODUCTS_JSON || JSON.stringify(DEFAULT_DEWORMING_PRODUCTS));
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 if(!Array.isArray(products)||products.some(p=>!p||typeof p.id!=='string'||p.id==='other'||!/^[a-z0-9_-]{1,60}$/.test(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>60||!Array.isArray(p.lots)||p.lots.some(l=>!l||typeof l.batch!=='string'||!l.batch.trim()||l.batch.length>60||!date(l.expiresOn))||new Set(p.lots.map(l=>l.batch)).size!==p.lots.length)||new Set(products.map(p=>p.id)).size!==products.length)throw new Error('Invalid deworming product configuration');
 return products.map(({id,name,lots})=>({id,name,lots:lots.map(({batch,expiresOn})=>({batch,expiresOn}))}));
}
