import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

export function useCheckoutClaim(appointmentId, paid, enabled = true) {
  const token = useRef(null), paidRef = useRef(paid), retryRef = useRef(() => {});
  const [state,setState] = useState({ ready:false, error:'' });
  paidRef.current = paid;
  useEffect(() => {
    if (paid || !enabled) return;
    let active = true;
    token.current = null;
    const path = `/api/checkout-inbox/${encodeURIComponent(appointmentId)}`;
    const update = value => { if (active) setState(previous => ({...previous,...value})); };
    const acquire = async () => {
      update({ ready:false,error:'' });
      try {
        const result = await api.post(`${path}/claim`, {});
        if (!active) { api.post(`${path}/release`, { claimToken:result.claimToken }).catch(() => {}); return; }
        token.current = result.claimToken;
        update({ready:true,error:'',invoiceItems:result.invoiceItems,prescriptionItems:result.prescriptionItems,prescription:result.prescription});
      } catch(error) { update({ready:false,error:error.message}); }
    };
    const renew = async () => {
      if (!token.current || paidRef.current) return;
      try {
        await api.post(`${path}/renew`, { claimToken:token.current });
        update({ready:true,error:''});
      } catch(error) { update({ready:false,error:error.message}); }
    };
    retryRef.current = async () => {
      if (!token.current) return acquire();
      update({ready:false,error:''});
      try {
        await api.post(`${path}/renew`,{claimToken:token.current});
        update({ready:true,error:''});
      } catch(error) {
        if (error.status===409) { token.current=null; return acquire(); }
        update({ready:false,error:error.message});
      }
    };
    acquire();
    const timer = setInterval(renew,60000);
    const onFocus = () => renew();
    window.addEventListener('focus',onFocus);
    return () => {
      active=false; clearInterval(timer); window.removeEventListener('focus',onFocus);
      const claimToken=token.current;
      token.current=null;
      if (claimToken && !paidRef.current) api.post(`${path}/release`,{claimToken}).catch(() => {});
    };
  },[appointmentId,paid,enabled]);
  return { ...state, claimToken:token.current, retry:() => retryRef.current() };
}
