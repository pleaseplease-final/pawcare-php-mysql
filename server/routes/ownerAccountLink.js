import express from 'express';
import {withTransaction} from '../db.js';
import {ensurePetRegistrationSchema} from '../petRegistration.js';
import {reviewOwnerAccountLink,linkOwnerAccount} from '../ownerAccountLink.js';
export const ownerAccountLinkRouter=express.Router();
ownerAccountLinkRouter.post('/owners/:id/account-link/:action',async(req,res)=>{
  if(req.user.role!=='assistant')return res.status(403).json({error:'Only reception can link owner records.'});
  if(!['review','confirm'].includes(req.params.action))return res.status(404).json({error:'Action not found.'});
  try {
    await ensurePetRegistrationSchema();
    const result=await withTransaction(async client=>req.params.action==='review'
      ? (await reviewOwnerAccountLink(client,req.params.id,req.body.email)).review
      : await linkOwnerAccount(client,req.params.id,req.body,req.user));
    res.json({success:true,...result});
  } catch(error) {res.status(error.status || 500).json({error:error.status ? error.message : 'The owner account could not be linked. Refresh and review the records before retrying.'});}
});
