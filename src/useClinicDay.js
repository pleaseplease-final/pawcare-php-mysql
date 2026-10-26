import {useEffect,useState,useSyncExternalStore} from 'react';
import {subscribeClinicDate,clinicDateSnapshot} from './clinicDate.js';
export const useClinicDay=()=>useSyncExternalStore(subscribeClinicDate,clinicDateSnapshot,clinicDateSnapshot);
// A view that was following today advances; an explicitly selected older/future day stays selected.
export function useFollowingClinicDay() {
  const today=useClinicDay(),[state,setState]=useState(()=>({day:today,selected:today}));
  useEffect(()=>{setState(previous=>previous.day===today?previous:{day:today,selected:previous.selected===previous.day?today:previous.selected});},[today]);
  return [state.selected,value=>setState(previous=>({...previous,selected:typeof value==='function'?value(previous.selected):value}))];
}
