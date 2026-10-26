// The status API reports provider acceptance, not handset/inbox delivery.
export function readReminderStatus(data) {
  const count=value=>Number.isSafeInteger(value) && value>=0;
  const record=value=>value && typeof value==='object' && !Array.isArray(value);
  const health=data?.health;
  if(!record(data?.summary) || !Object.values(data.summary).every(count) || !record(health)
    || typeof health.emailConfigured!=='boolean' || typeof health.smsConfigured!=='boolean'
    || !count(health.overdue) || !(health.lastRun===null || typeof health.lastRun==='string' && Number.isFinite(Date.parse(health.lastRun)))
    || !Array.isArray(data.attention) || data.attention.some(row=>!record(row) || typeof row.id!=='string' || !['email','sms'].includes(row.channel) || !['failed','uncertain'].includes(row.status))) {
    throw Error('The clinic did not return a complete reminder status. Retry to check the saved queue.');
  }
  return data;
}

export function reminderHealth(data,{loading=false,error='',now=Date.now()}={}) {
  if(loading)return {label:'Checking status…',healthy:false};
  if(error || !data)return {label:'Status unavailable',healthy:false};
  const issues=(data.summary.failed || 0)+(data.summary.uncertain || 0);
  // A 26-hour window accommodates the documented daily scheduler as well as
  // the five-minute worker. Provider configuration cannot establish activity.
  const last=data.health.lastRun===null?null:Date.parse(data.health.lastRun);
  const workerFuture=last!==null && last>now+5*60*1000;
  const workerStale=last===null || now-last>26*60*60*1000 || workerFuture;
  const label=!data.health.emailConfigured || !data.health.smsConfigured?'Provider setup needed'
    :data.health.overdue?'Overdue reminders'
    :workerStale?'Worker needs checking'
    :issues?'Follow-up needed':'Providers configured';
  return {label,workerStale,workerFuture,healthy:label==='Providers configured'};
}
