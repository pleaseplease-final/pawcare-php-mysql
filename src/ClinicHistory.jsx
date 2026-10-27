import {createContext,useContext,useEffect,useRef,useState} from 'react';
import {clinicRequest} from './clinicApi.js';
const Context=createContext(null);
const combine=(older=[],current=[])=>[...new Map([...older,...current].map(row=>[row.id,row])).values()];
const signature=db=>JSON.stringify([db.appts,db.vacc,db.records,db.totals,db.pets.map(p=>[p.id,p.weights])]);
function appendHistory(previous,result) {
  if(!previous)return result;
  const weights={...previous.weights};
  for(const [pet,rows] of Object.entries(result.weights||{}))weights[pet]=combine(weights[pet],rows);
  return {...result,appts:combine(previous.appts,result.appts),vaccs:combine(previous.vaccs,result.vaccs),consults:combine(previous.consults,result.consults),weights};
}
export function mergeClinicHistory(db,history,me) {
  if(!history)return db;
  const patients=new Set(db.pets.map(p=>p.id));
  const permitted=row=>patients.has(row.petId);
  const assigned=row=>me?.role!=='vet'||[me.id,me.vetId].filter(Boolean).includes(row.vetId);
  const appts=combine((history.appts||[]).filter(row=>permitted(row)&&assigned(row)),db.appts),vacc=combine((history.vaccs||[]).filter(permitted),db.vacc),records=combine((history.consults||[]).filter(permitted),db.records);
  const pets=db.pets.map(p=>({...p,weights:combine(history.weights?.[p.id],p.weights).sort((a,b)=>a.date.localeCompare(b.date))}));
  return {...db,appts,vacc,vaccs:vacc,records,consults:records,pets};
}
export function ClinicHistory({db,me,children}) {
  const [history,setHistory]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [stale,setStale]=useState(false),[loadingAll,setLoadingAll]=useState(false),[pagesLoaded,setPagesLoaded]=useState(0);
  const pending=useRef(null),mounted=useRef(true),baseline=useRef(null),latest=useRef(null),saved=useRef(null);
  latest.current=signature(db);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;pending.current?.abort();};},[]);
  useEffect(()=>{if(history && baseline.current!==latest.current)setStale(true);},[db,history]);
  const load=async(reset=false,all=false)=>{
    if(pending.current)return;
    const controller=new AbortController();pending.current=controller;setLoading(true);setLoadingAll(all);setError('');setPagesLoaded(0);
    const startedAt=latest.current;
    let combined=reset?null:saved.current;
    const seen=new Set();
    try{
      do {
        const cursor=combined?.page?.hasMore ? combined.page.cursor : null;
        if(cursor && seen.has(cursor))throw Error('History loading could not advance. Please retry.');
        if(cursor)seen.add(cursor);
        const path='/api/state/history'+(cursor?'?'+new URLSearchParams({cursor}):'');
        const timeout=setTimeout(()=>controller.abort(),20000);
        let result;
        try{result=await clinicRequest('GET',path,undefined,{signal:controller.signal});}
        finally{clearTimeout(timeout);}
        if(!mounted.current || controller.signal.aborted)return;
        if(result.page?.hasMore && !result.page.cursor)throw Error('History loading returned an incomplete page. Please retry.');
        combined=appendHistory(combined,result);
        saved.current=combined;setHistory(combined);setPagesLoaded(n=>n+1);
      }while(all && combined.page?.hasMore);
      baseline.current=startedAt;
      setStale(startedAt!==latest.current);
    }catch(err){if(mounted.current)setError(controller.signal.aborted?'History loading timed out. Please retry.':err.message);}
    finally{pending.current=null;if(mounted.current){setLoading(false);setLoadingAll(false);}}
  };
  const value={loading,loadingAll,pagesLoaded,error,stale:stale || !!history && baseline.current!==latest.current,started:!!history,complete:!!history&&!history.page?.hasMore&&!stale&&!loading&&!error&&baseline.current===latest.current,hasMore:!history||history.page?.hasMore,load};
  const merged=mergeClinicHistory(db,history,me);
  return <Context.Provider value={value}>{children({...merged,historyComplete:value.complete})}</Context.Provider>;
}
/* Older records load in the background on pages that search, report or print them, so nobody has to ask for them.
   Pages that don't need the full history show nothing. A visible message appears only if loading fails. */
export function HistoryControls({auto=false}) {
  const history=useContext(Context);
  useEffect(()=>{if(auto && history && !history.started && !history.loading && !history.error)history.load(false,true);},[auto,history?.started,history?.loading,history?.error]);
  useEffect(()=>{if(auto && history?.started && history.hasMore && !history.loading && !history.error && !history.stale)history.load(false,true);},[auto,history?.started,history?.hasMore,history?.loading,history?.error,history?.stale]);
  useEffect(()=>{if(auto && history?.stale && !history.loading && !history.error)history.load(true,true);},[auto,history?.stale,history?.loading,history?.error]);
  if(!history || !auto)return null;
  if(history.error)return <div className="clinic-data-error" role="alert" style={{margin:'0 0 14px',padding:'10px 14px',borderRadius:8,display:'flex',gap:12,flexWrap:'wrap',justifyContent:'space-between',alignItems:'center'}}>
    <span>Older records could not be loaded. {history.error}</span><button className="btn sm ghost" onClick={()=>history.load(true,true)}>Try again</button>
  </div>;
  if(history.loading)return <p className="clinic-history-status" role="status" aria-live="polite" style={{margin:'0 0 10px',fontSize:'calc(12.5px * var(--fs, 1))',opacity:.75}}>Loading saved records…</p>;
  return null;
}
export function useHistoryComplete(){return useContext(Context)?.complete ?? true;}
