import {useFormValidation} from '../components/useFormValidation.jsx';
import {noteChoiceError} from '../formValidation.js';
import {useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {clinicRequest} from '../clinicApi.js';
import {useSubmissionReview} from '../components/SubmissionReview.jsx';
import {noteLines,readNoteOptions,savedNoteOptions} from '../noteOptions.js';

export default function NoteOptionsPage({onPageState}={}) {
  const [config,setConfig]=useState(null),[diagnosis,setDiagnosis]=useState(''),[treatment,setTreatment]=useState('');
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[needsReload,setNeedsReload]=useState(false);
  const validation=useFormValidation({diagnosis:noteChoiceError(diagnosis),treatment:noteChoiceError(treatment)});
  const operation=useRef(null),mounted=useRef(true);
  const dirty=!!config && (diagnosis!==config.options.diagnosis.join('\n') || treatment!==config.options.treatment.join('\n'));
  const signature=JSON.stringify([diagnosis,treatment,config?.revision]);
  const review=useSubmissionReview([signature,loading,saving,needsReload]);
  useEffect(()=>{onPageState?.({dirty,busy:saving,signature});},[dirty,saving,signature,onPageState]);
  useEffect(()=>{
    if(!dirty && !saving)return;
    const leave=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',leave);
    return()=>window.removeEventListener('beforeunload',leave);
  },[dirty,saving]);
  const apply=data=>{
    setConfig(data);setDiagnosis(data.options.diagnosis.join('\n'));setTreatment(data.options.treatment.join('\n'));setNeedsReload(false);
    validation.changed('diagnosis');validation.changed('treatment');
  };
  const load=async()=>{
    if(operation.current)return;
    const controller=new AbortController();operation.current=controller;
    setLoading(true);setError('');setMessage('');
    const timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const data=readNoteOptions(await clinicRequest('GET','/api/clinical/note-options',undefined,{signal:controller.signal}));
      if(mounted.current && operation.current===controller)apply(data);
    } catch(e) {
      if(mounted.current && operation.current===controller)setError(controller.signal.aborted?'Loading saved choices timed out. Your entries are retained; retry the reload.':e.message);
    } finally {
      clearTimeout(timeout);
      if(operation.current===controller){operation.current=null;if(mounted.current)setLoading(false);}
    }
  };
  useEffect(()=>{
    mounted.current=true;load();
    return()=>{mounted.current=false;if(operation.current instanceof AbortController)operation.current.abort();operation.current=null;};
  },[]);
  const reload=async()=>{
    if(operation.current)return;
    if(dirty && !await review.ask({title:'Reload saved choices?',confirmLabel:'Reload and replace entries',description:'Your current entries will be replaced only after the saved choices load successfully. Go back to keep editing or copy your changes before reloading.',fields:[['Diagnosis entries',diagnosis || 'No choices'],['Treatment entries',treatment || 'No choices']]}))return;
    await load();
  };
  const submit=async event=>{
    event.preventDefault();if(operation.current || !config || needsReload)return;
    if(!validation.validate(event))return;
    setError('');setMessage('');
    const options={diagnosis:noteLines(diagnosis),treatment:noteLines(treatment)},revision=config.revision;
    if(!await review.ask({title:'Review diagnosis and treatment suggestions',confirmLabel:'Save choices',description:'These optional entries will be available when veterinarians next open a consultation. Saved clinical notes keep their existing text.',fields:[['Diagnosis choices',options.diagnosis.join('\n') || 'No choices'],['Treatment choices',options.treatment.join('\n') || 'No choices']]}))return;
    if(operation.current)return;
    operation.current='save';setSaving(true);
    try {
      const data=savedNoteOptions(await api.put('/api/clinical/note-options',{options,revision}),revision,options);
      if(mounted.current){apply(data);setMessage('Diagnosis and treatment suggestions saved.');}
    } catch(e) {
      if(mounted.current){setError(e.message);if(e.status===409 || e.unconfirmed)setNeedsReload(true);}
    } finally {operation.current=null;if(mounted.current)setSaving(false);}
  };
  const count=text=>noteLines(text).length;
  const list=(name,title,hint,value,setter)=><div className="nc-list">
    <div className="nc-list-head"><label htmlFor={`nc-${name}`}>{title}</label><span className={`nc-count${count(value)>100?' over':''}`}>{count(value)} of 100</span></div>
    <textarea rows={11} {...validation.field(name)} id={`nc-${name}`} value={value} onChange={e=>setter(e.target.value)} />
    <small>{hint}</small>{validation.feedback(name)}
  </div>;
  return <section className="card nc-page">
    {review.card}
    <header className="nc-intro">
      <h2>Diagnosis &amp; treatment choices</h2>
      <p>These are the suggestions veterinarians pick from during a consultation. They never add billing charges, and vets can always type their own notes.</p>
      <ol className="nc-steps">
        <li><b>One choice per line</b><span>Up to 100 in each list.</span></li>
        <li><b>Remove a line to retire it</b><span>Saved clinical notes keep their text.</span></li>
        <li><b>Use clinic-approved wording</b><span>Custom visit notes join the lists only when you add them here.</span></li>
      </ol>
    </header>
    {loading && <p role="status" className="nc-status">Loading saved suggestions…</p>}
    {config && <form {...validation.formProps} onSubmit={submit}>
      <fieldset disabled={saving || loading} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <div className="nc-grid">
          {list('diagnosis','Diagnosis choices','Example: Otitis externa, Gastroenteritis',diagnosis,setDiagnosis)}
          {list('treatment','Treatment choices','Example: Ear cleaning and topical drops',treatment,setTreatment)}
        </div>
        <div className="nc-actions">
          <button className="btn gold" disabled={saving || loading || needsReload}>{saving?'Saving…':'Review and save choices'}</button>
          <button type="button" className="btn ghost" disabled={saving || loading} onClick={reload}>Reload saved choices</button>
          {dirty && <span role="status" className="nc-dirty">Unsaved changes</span>}
        </div>
      </fieldset>
    </form>}
    {!config && <div className="nc-actions"><button type="button" className="btn ghost" disabled={saving || loading} onClick={reload}>Reload saved choices</button></div>}
    {needsReload && <p role="status" className="nc-status">Your entries are retained. Copy any changes you want to keep, then reload the saved choices before reviewing another save.</p>}
    {error && <p role="alert" className="err">{error}</p>}
    {message && !dirty && <p role="status" className="nc-ok">{message}</p>}
  </section>;
}
