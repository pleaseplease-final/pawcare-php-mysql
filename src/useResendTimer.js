import {useEffect,useState} from 'react';
// Elapsed time keeps resend feedback correct after a background tab resumes.
export function useResendTimer(seconds=0) {
  const [deadline,setDeadline]=useState(()=>Date.now()+Math.max(0,seconds)*1000);
  const [remaining,setRemaining]=useState(seconds);
  useEffect(()=>{
    let timer;
    const tick=()=>{const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));setRemaining(left);if(!left)clearInterval(timer);};
    timer=setInterval(tick,1000);tick();
    window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);};
  },[deadline]);
  return [remaining,value=>{const seconds=Math.max(0,Number(value)||0);setRemaining(seconds);setDeadline(Date.now()+seconds*1000);}];
}
