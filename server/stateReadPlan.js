import {clinicClock,validDate} from './scheduling.js';
// Every read keeps the same owner/vet scope as the original full-state endpoint.
export function stateReadPlan(user,query={}) {
  const owner=user.role==='owner',vet=user.role==='vet',scoped=owner||vet;
  const params=owner?[user.ownerId]:vet?[[user.vetId,user.id].filter(Boolean)]:[];
  const petScope=owner?'SELECT id FROM pets WHERE owner_id=$1':'SELECT pet_id FROM appointments WHERE vet_id=ANY($1::varchar[])';
  const filters={appts:owner?`pet_id IN (${petScope})`:vet?'vet_id=ANY($1::varchar[])':'true',vaccs:scoped?`pet_id IN (${petScope})`:'true',consults:scoped?`pet_id IN (${petScope})`:'true',weights:scoped?`pet_id IN (${petScope})`:'true'};
  const tables={appts:'appointments',vaccs:'vaccinations',consults:'consultations',weights:'pet_weights'};
  const summary=query.view==='summary',history=query.view==='history';
  let cursor={};
  if(history && query.cursor){try{cursor=JSON.parse(Buffer.from(query.cursor,'base64url').toString());if(!cursor||Array.isArray(cursor)||typeof cursor!=='object')throw Error();}catch{throw Object.assign(Error('Invalid history cursor.'),{status:400});}}
  const pageSize=50;
  const reads={};
  for(const [key,table] of Object.entries(tables)) {
    const values=[...params];let filter=filters[key];
    if(history){
      if(cursor[key]===null)filter+=' AND false';
      else if(cursor[key]!==undefined){const mark=cursor[key];if(!mark || typeof mark.id!=='string'||mark.id.length>100||!validDate(mark.date))throw Object.assign(Error('Invalid history cursor.'),{status:400});values.push(mark.date,mark.id);filter+=` AND (date,id)<($${values.length-1}::date,$${values.length})`;}
      if(query.petId){if(typeof query.petId!=='string'||query.petId.length>50)throw Object.assign(Error('Invalid patient.'),{status:400});values.push(query.petId);filter+=` AND pet_id=$${values.length}`;}
      reads[key]={sql:`SELECT * FROM ${table} WHERE ${filter} ORDER BY date DESC,id DESC LIMIT ${pageSize+1}`,params:values};
    } else if(summary){
      const day=clinicClock().date;values.push(day);const date=`$${values.length}::date`;
      if(key==='appts') {
        // My Pets needs five recent paid records even when the visits are older.
        const recent=owner ? ` OR id IN (SELECT id FROM appointments WHERE ${filters.appts} AND billing_status='Paid' ORDER BY paid_at DESC NULLS LAST,date DESC,id DESC LIMIT 5)` : '';
        filter+=` AND (date>=${date} OR status IN ('Pending Approval','Checked-in','In consultation') OR (status='Completed' AND billing_status<>'Paid') OR follow_up_id IN (SELECT c.id FROM consultations c WHERE c.follow_up_date IS NOT NULL AND NOT EXISTS (SELECT 1 FROM appointments linked WHERE linked.follow_up_id=c.id AND linked.status='Completed')) OR (billing_status='Paid' AND paid_at IS NULL) OR (paid_at AT TIME ZONE 'Asia/Manila')::date=${date}${recent})`;
      }
      if(key==='consults')filter+=` AND (date>=${date} OR appt_id IN (SELECT id FROM appointments WHERE date>=${date} OR status IN ('Pending Approval','Checked-in','In consultation') OR (status='Completed' AND billing_status<>'Paid')) OR (follow_up_date IS NOT NULL AND NOT EXISTS (SELECT 1 FROM appointments linked WHERE linked.follow_up_id=consultations.id AND linked.status='Completed')))`;
      // Latest dose in each clinical family preserves recall semantics; current doses preserve today's EMR.
      if(key==='vaccs') {
        const family=`CASE WHEN vaccine ~* 'rabies' THEN 'rabies' WHEN vaccine ~* 'dhpp|[568]-in-1' THEN 'canine-core' WHEN vaccine ~* 'fvrcp|feline.*4.in.1' THEN 'feline-core' ELSE LOWER(TRIM(vaccine)) END`;
        reads[key]={sql:`SELECT * FROM vaccinations WHERE ${filter} AND (id IN (SELECT DISTINCT ON(pet_id,${family},done,(COALESCE(vet_id,'')<>'')) id FROM vaccinations WHERE ${filter} ORDER BY pet_id,${family},done,(COALESCE(vet_id,'')<>''),date DESC,created_at DESC NULLS LAST,id DESC) OR date>=${date} OR NOT done)`,params:values};continue;
      }
      if(key==='weights') {values.pop();reads[key]={sql:`SELECT DISTINCT ON(pet_id) * FROM pet_weights WHERE ${filter} ORDER BY pet_id,date DESC,created_at DESC,id DESC`,params:values};continue;}
      reads[key]={sql:`SELECT * FROM ${table} WHERE ${filter} ORDER BY date DESC,id DESC`,params:values};
    } else {
      const order={appts:'date ASC,time ASC',vaccs:'date ASC,id ASC',weights:'date ASC',consults:'date DESC'}[key];
      reads[key]={sql:`SELECT * FROM ${table} WHERE ${filter} ORDER BY ${order}`,params:values};
    }
  }
  return {owner,vet,scoped,params,petScope,summary,history,reads,pageSize,filters,cursor};
}
export function historyPage(plan,results) {
  const cursor={};let more=false;
  for(const [key,result] of Object.entries(results)){
    const extra=result.rows.length>plan.pageSize;
    result.rows=result.rows.slice(0,plan.pageSize);
    const last=result.rows.at(-1);
    cursor[key]=extra?{date:last.date instanceof Date?last.date.toISOString().slice(0,10):String(last.date).slice(0,10),id:last.id}:null;more ||= extra;
  }
  return {hasMore:more,cursor:more?Buffer.from(JSON.stringify(cursor)).toString('base64url'):null};
}
