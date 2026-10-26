import express from 'express';
import {query,withTransaction} from '../db.js';
import {ensureDigitalVetCardSchema,cardPatient,cardHistory,refreshDigitalVetCard,cardError} from '../digitalVetCard.js';
import {clinicDocumentErrors,clinicDocumentFields} from '../../src/clinicDocumentValidation.js';
import {vetCardPdf} from '../vetCardPdf.js';
export const digitalVetCardRouter=express.Router();
digitalVetCardRouter.use(async(req,res,next)=>{
 if(req.path!=='/clinic-document-profile' && !/^\/pets\/[^/]+\/vet-card(?:\/pdf)?$/.test(req.path))return next();
 res.set('Cache-Control','private, no-store');
 try{await ensureDigitalVetCardSchema();next();}catch{res.status(500).json({error:'Unable to prepare Digital Vet Cards. Please retry.'});}
});
async function consistentCardRead(work){
 for(let attempt=0;;attempt++){try{return await withTransaction(work);}catch(error){if(error.code!=='40001'||attempt>=2)throw error;}}
}
const failure=(res,e)=>res.status(e.status || 500).json({error:e.status?e.message:'Unable to load or publish the Digital Vet Card. Please retry.'});
digitalVetCardRouter.get('/clinic-document-profile',async(req,res)=>{
 try{const row=(await query('SELECT * FROM clinic_document_profile WHERE id=true')).rows[0];res.json({success:true,profile:row});}catch(e){failure(res,e);}
});
digitalVetCardRouter.put('/clinic-document-profile',async(req,res)=>{
 try{
  const errors=clinicDocumentErrors(req.body);if(Object.keys(errors).length)return res.status(400).json({error:'Check the clinic details.',errors});
  if(!Number.isInteger(req.body.revision)||req.body.revision<0)throw cardError('Reload the saved clinic details before editing.',409);
  const profile=await withTransaction(async client=>{
   const previous=(await client.query('SELECT * FROM clinic_document_profile WHERE id=true FOR UPDATE')).rows[0];
   if(previous.revision!==req.body.revision)throw cardError('Clinic details changed. Reload before saving your edits.',409);
   const details=Object.fromEntries(clinicDocumentFields.filter(([key])=>key!=='verificationSource').map(([key])=>[key,req.body[key].trim()]));
   const row=(await client.query('UPDATE clinic_document_profile SET details=$1,revision=revision+1,verified_at=clock_timestamp(),verified_by=$2,verified_by_name=$3,verification_source=$4 WHERE id=true RETURNING *',[JSON.stringify(details),req.user.id,req.user.name,req.body.verificationSource.trim()])).rows[0];
   await client.query('INSERT INTO audit_logs(user_name,user_role,action) VALUES($1,$2,$3)',[req.user.name,req.user.role,`Verified clinic document details revision ${row.revision}; source: ${row.verification_source}`]);
   // Existing eligible cards refresh on their next read/export. Clinic metadata
   // never changes medical records or admission release status.
   return row;
  });
  res.json({success:true,profile});
 }catch(e){failure(res,e);}
});
digitalVetCardRouter.get('/pets/:petId/vet-card{/:format}',async(req,res)=>{
 try{
  if(req.params.format && req.params.format!=='pdf')throw cardError('Document format not found.',404);
  const data=await consistentCardRead(async client=>{
   await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
   const pet=await cardPatient(client,req.params.petId,req.user);
   const shared=await cardHistory(client,pet);
   const document=await refreshDigitalVetCard(client,pet.id,{pet,history:shared});
   return {success:true,history:shared,document};
  });
  if(req.params.format==='pdf'){
   if(!data.document)throw cardError(data.publicationStatus,409);
   // Access was already checked above. Verified clinic details and the pet photo only dress the printed card.
   const profile=(await query('SELECT details,verified_at FROM clinic_document_profile WHERE id=true')).rows[0];
   const photo=(await query('SELECT photo FROM pets WHERE id=$1',[req.params.petId])).rows[0]?.photo || '';
   const bytes=await vetCardPdf(data.document,{clinic:profile?.verified_at ? profile.details : null,photo});
   res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${data.document.reference}-r${data.document.revision}.pdf"`,'X-Content-Type-Options':'nosniff'}).send(bytes);
  }else res.json(data);
 }catch(e){failure(res,e);}
});
