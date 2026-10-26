import {boosterDate} from './clinicalWorkflow.js';
export const VISIT_CARE = {
 wellness:{plans:['Review preventive-care needs and discuss the wellness plan.','Discuss diet, activity and home monitoring.'],services:['srv_consult','srv_senior'],onset:false},
 skin:{plans:['Discuss the skin / ear care plan and home monitoring.','Arrange reassessment of the skin / ear concern.'],services:['srv_consult','srv_ear'],onset:true},
 injury:{plans:['Discuss the injury / mobility care plan and activity instructions.','Arrange reassessment of mobility and the affected area.'],services:['srv_consult','srv_wound'],onset:true},
 digestive:{plans:['Discuss the digestive care plan and monitoring of food, water and symptoms.','Arrange reassessment of the digestive concern.'],services:['srv_consult','srv_cbc','srv_chem'],onset:true},
 appetite:{plans:['Discuss the care plan and monitoring of food and water intake.','Arrange reassessment of appetite and drinking.'],services:['srv_consult','srv_cbc','srv_chem'],onset:true},
 dental:{plans:['Discuss dental findings and the proposed dental care plan.','Arrange a dental procedure assessment.'],services:['srv_consult','srv_dental'],onset:true},
 surgery:{plans:['Discuss the proposed procedure and patient-specific preparation.','Arrange a surgical reassessment before proceeding.'],services:['srv_consult','srv_cbc','srv_chem','srv_wound'],onset:false},
 followup:{plans:['Review progress and discuss the ongoing care plan.','Arrange another reassessment for unresolved concerns.'],services:['srv_consult'],onset:false},
 emergency:{plans:['Record the urgent care plan and monitoring instructions.','Discuss referral or continued clinic care.'],services:['srv_consult','srv_cbc','srv_chem','srv_wound'],onset:true},
 consultation:{plans:['Discuss the findings, care plan and home monitoring.','Arrange a clinical reassessment.'],services:['srv_consult'],onset:true},
};
export const careForProfile=profile=>VISIT_CARE[profile.id] || {plans:[],services:[],onset:false};
export function elapsedDays(start,end){
 const valid=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 return valid(start)&&valid(end)&&start<=end ? (Date.parse(end)-Date.parse(start))/86400000 : null;
}
export const calculatedFollowUp=(date,days)=>boosterDate(date,days);
