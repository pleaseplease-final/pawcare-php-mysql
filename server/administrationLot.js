import {dewormingProducts} from './dewormingProducts.js';
// An administration ID is a record reference, never a manufacturer lot.
export function resolveAdministrationLot(vaccination,date,products){
 if(!vaccination || vaccination.vaccine!=='Deworming')return vaccination;
 products ??= dewormingProducts();
 vaccination={...vaccination,batch:vaccination.batch ?? ''};
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 const selected=products.find(p=>p.id===vaccination.dewormingProductId);
 if(vaccination.dewormingProductId && !selected)fail('The selected deworming product is no longer available. Refresh the catalog.');
 if(typeof vaccination.batch!=='string' || vaccination.batch.length>60)fail('Enter a batch / lot of no more than 60 characters.');
 const lots=(selected?.lots || []).filter(l=>l.expiresOn>=date).sort((a,b)=>a.expiresOn.localeCompare(b.expiresOn)||a.batch.localeCompare(b.batch));
 const batch=vaccination.batch.trim();
 if(selected?.lots.some(l=>l.batch===batch && l.expiresOn<date))fail('The selected lot expired before the care date. Select a current lot.');
 if(lots.length && batch && !lots.some(l=>l.batch===batch))fail('Select an available lot for this product.');
 return {...vaccination,brand:selected?.name || vaccination.brand,batch:batch || lots[0]?.batch || ''};
}
