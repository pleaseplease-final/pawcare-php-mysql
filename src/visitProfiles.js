// Documentation prompts only: never infer findings or treatment from a booking.
const profile = (id, title, fields, examination) => ({id,title,fields:fields.map(([key,label])=>({key,label})),examination});
const profiles = {
 wellness:profile('wellness','Wellness / annual check-up',[['changes','Changes since the last visit'],['routine','Diet, activity and preventive-care history']],'Record the general examination and any findings relevant to this check-up.'),
 skin:profile('skin','Skin / ear consultation',[['onset','Onset and affected areas'],['changes','Itching, discharge and treatments already tried']],'Record observed skin and ear findings.'),
 injury:profile('injury','Injury / mobility consultation',[['onset','When and how the problem started'],['mobility','Affected limb / area and changes in movement']],'Record mobility, affected areas and examination findings.'),
 digestive:profile('digestive','Vomiting / diarrhea consultation',[['onset','Onset and frequency'],['intake','Food / water intake and recent diet changes']],'Record the examination findings relevant to the digestive concern.'),
 appetite:profile('appetite','Appetite / drinking consultation',[['onset','When eating or drinking changed'],['intake','Recent food / water intake and other changes']],'Record examination findings relevant to the change in intake.'),
 dental:profile('dental','Dental assessment',[['concerns','Mouth / teeth concerns and duration'],['history','Eating changes and previous dental care']],'Record oral examination findings and any examination limitations.'),
 surgery:profile('surgery','Surgical assessment',[['procedure','Requested procedure / concern'],['history','Previous procedures, medicines and relevant history']],'Record findings relevant to the proposed procedure and preparation needs.'),
 followup:profile('followup','Follow-up / recheck',[['progress','Changes since the previous visit'],['response','Treatment response and outstanding concerns']],'Record current findings and comparison with the previous visit.'),
 emergency:profile('emergency','Urgent consultation',[['onset','Presenting concern and onset'],['care','Care already provided before arrival']],'Record current examination findings and care provided.'),
 consultation:profile('consultation','SOAP Consultation',[['concerns','Main concerns and duration'],['history','Relevant history and current medicines']],'Add examination findings, heart rate, hydration, mucous membranes, lymph nodes…'),
 vaccination:profile('vaccination','Vaccination record',[['history','Previous vaccination reactions / concerns']],'Record findings relevant to vaccination suitability.'),
 deworming:profile('deworming','Deworming record',[['history','Previous deworming reactions / concerns']],'Record findings relevant to deworming suitability.'),
 grooming:profile('grooming','Grooming record',[['request','Requested grooming and handling preferences'],['concerns','Skin / coat concerns or previous grooming reactions']],'Record observed coat, skin and handling concerns.'),
 sanitary:profile('sanitary','Grooming record · sanitary care',[['request','Requested sanitary care / areas'],['concerns','Handling, skin or coat concerns']],'Record findings relevant to the requested sanitary care.'),
};
export function profileForVisit(appointment,type) {
 const reason=appointment.reason || '';
 if(type==='grooming')return /sanitary|nail|ear clean/i.test(reason)?profiles.sanitary:profiles.grooming;
 if(type!=='consultation')return profiles[type];
 // Explicit surgery bookings keep their assessment purpose even for a recheck.
 if(appointment.service==='surgery')return /follow[ -]?up|recheck/i.test(reason)?profiles.followup:/dental/i.test(reason)?profiles.dental:profiles.surgery;
 if(/emergency|critical|urgent/i.test(reason))return profiles.emergency;
 if(appointment.followUpId || /follow[ -]?up|re[ -]?check/i.test(reason))return profiles.followup;
 if(/\b(?:skin|ear|allerg\w*|itch\w*)\b/i.test(reason))return profiles.skin;
 if(/limp|injur|mobility/i.test(reason))return profiles.injury;
 if(/vomit|diarrh/i.test(reason))return profiles.digestive;
 if(/not eating|not drinking|not eating or drinking|appetite/i.test(reason))return profiles.appetite;
 if(/dental|teeth|tooth/i.test(reason))return profiles.dental;
 if(!appointment.service && /surg|procedure/i.test(reason))return profiles.surgery;
 if(/annual|wellness|routine.*(?:exam|check)|check-up/i.test(reason))return profiles.wellness;
 return profiles.consultation;
}
