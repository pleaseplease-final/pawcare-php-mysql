// Renders the real portal for one role and page with realistic sample data, for visual review.
// Open as ui-tour.html?role=owner&page=appts  (roles: owner, assistant, vet, admin). No real server is used.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import '../../src/styles.css';
import '../../src/fonts.css';
import '../../src/print-documents.css';
import '../../src/polish-v2.css';
import {watchTables} from '../../src/tableLabels.js';
watchTables();
import Portal from '../../src/Portal.jsx';
import {owner} from '../../src/roles/Owner.jsx';
import {assistant} from '../../src/roles/Assistant.jsx';
import {vet} from '../../src/roles/Vet.jsx';
import {admin} from '../../src/roles/Admin.jsx';
import {emptyClinicState} from '../../src/clinicState.js';
import {today,plus} from '../../src/booking.js';

const params=new URLSearchParams(location.search),role=params.get('role')||'owner';
const cfgs={owner,assistant,vet,admin};
const me={owner:{id:'u_owner',role:'owner',ownerId:'o1',name:'Rovelyn Baterbonia',email:'rovelyn@gmail.com'},
 assistant:{id:'u_asst',role:'assistant',name:'Cza Ybanez',email:'cza@gmail.com'},
 vet:{id:'u_vet',role:'vet',vetId:'v1',name:'Dr. Ana Cruz',email:'ana@gmail.com'},
 admin:{id:'u_admin',role:'admin',name:'Clinic Admin',email:'admin@gmail.com'}}[role];
const T=today();
const iv=(w,t,level='Routine')=>({weight:w,temp:t,triageLevel:level,fasted:false,notes:'Eating well',checkedInAt:'09:05',checkedInBy:'Cza Ybanez',weightAnalysis:{status:'ideal',label:'Ideal weight'},tempAnalysis:{status:t>39.4?'high_fever':'normal',label:t>39.4?'High fever':'Normal',flag:t>39.4?'High fever':'Normal',color:'#16a34a'}});
const db={...emptyClinicState(),
 owners:[{id:'o1',name:'Rovelyn Baterbonia',email:'rovelyn@gmail.com',phone:'+63 917 123 4567',address:'12 Rizal St, Makati City'},{id:'o2',name:'Mark Santos',email:'mark@gmail.com',phone:'+63 918 222 3344',address:'45 Mabini Ave, Pasig'},{id:'o3',name:'Liza Reyes',email:'liza@gmail.com',phone:'+63 920 555 1212',address:'8 Luna St, Quezon City'}],
 pets:[{id:'p1',ownerId:'o1',name:'Mochi',species:'Canine',breed:'Shih Tzu',sex:'Male',birth:'2022-03-14',weight:7.2,color:'White and gold',neutered:'Yes',allergies:['Chicken'],registrationStatus:'Verified',vaccinationCardId:'PAT-1001',weights:[{id:'w1',date:plus(-60),kg:6.9,origin:'clinic'},{id:'w2',date:plus(-10),kg:7.2,origin:'clinic'}]},
       {id:'p2',ownerId:'o1',name:'Luna',species:'Feline',breed:'Puspin',sex:'Female',birth:'2021-08-01',weight:4.1,color:'Grey',neutered:'Yes',allergies:[],registrationStatus:'Verified',vaccinationCardId:'PAT-1002',weights:[]},
       {id:'p3',ownerId:'o1',name:'Cookie',species:'Lagomorph',breed:'Dutch',sex:'Female',birth:'2024-01-10',weight:1.6,color:'Brown',neutered:'No',allergies:[],registrationStatus:'Pending',weights:[]},
       {id:'p4',ownerId:'o2',name:'Bantay',species:'Canine',breed:'Aspin',sex:'Male',birth:'2019-05-20',weight:18.4,color:'Black',neutered:'Yes',allergies:['Penicillin','Beef'],registrationStatus:'Verified',vaccinationCardId:'PAT-1004',weights:[]},
       {id:'p5',ownerId:'o3',name:'Pusa',species:'Feline',breed:'Persian',sex:'Female',birth:'2020-11-11',weight:4.8,color:'Cream',neutered:'No',allergies:[],registrationStatus:'Verified',vaccinationCardId:'PAT-1005',weights:[]}],
 vets:[{id:'v1',name:'Dr. Ana Cruz'},{id:'v2',name:'Dr. Ben Lim'}],
 appts:[
  {id:'a1',petId:'p1',vetId:'v1',date:T,time:'09:00',status:'Checked-in',service:'checkup',reason:'Annual check-up',billingStatus:'Unbilled',amount:500,intakeVitals:iv(7.2,38.6)},
  {id:'a2',petId:'p4',vetId:'v1',date:T,time:'09:30',status:'In consultation',service:'checkup',reason:'Skin or ear problem',billingStatus:'Unbilled',amount:500,intakeVitals:iv(18.4,39.8,'Priority')},
  {id:'a3',petId:'p2',vetId:'v2',date:T,time:'10:30',status:'Scheduled',service:'vaccination',reason:'Vaccination: Feline 4-in-1',billingStatus:'Unbilled',amount:700},
  {id:'a4',petId:'p5',vetId:'v1',date:T,time:'11:00',status:'Completed',service:'grooming',reason:'Grooming – Routine grooming',billingStatus:'Unbilled',amount:250,invoiceItems:[{catalogId:'srv_groom',name:'Sanitary Grooming & Nail Trim',price:250,qty:1,source:'performed'}]},
  {id:'a5',petId:'p1',vetId:'v2',date:plus(3),time:'14:00',status:'Pending Approval',service:'deworming',reason:'Deworming – Routine deworming',billingStatus:'Unbilled',amount:250},
  {id:'a6',petId:'p2',vetId:'v1',date:plus(8),time:'10:00',status:'Scheduled',service:'checkup',reason:'Annual check-up',billingStatus:'Unbilled',amount:500},
  {id:'a7',petId:'p1',vetId:'v1',date:plus(-14),time:'09:00',status:'Completed',service:'vaccination',reason:'Vaccination: Anti-rabies',billingStatus:'Paid',amount:350,paymentMethod:'GCash',paymentReference:'GC-88421',paidAt:new Date().toISOString(),invoiceItems:[{catalogId:'srv_rabies',name:'Anti-Rabies Vaccine (Annual Booster)',price:350,qty:1,source:'performed'}]},
  {id:'a8',petId:'p4',vetId:'v2',date:plus(-20),time:'13:00',status:'Cancelled',service:'checkup',reason:'Annual check-up',billingStatus:'Unbilled',cancelReason:'Schedule conflict'},
  {id:'a9',petId:'p5',vetId:'v1',date:plus(-5),time:'15:00',status:'Scheduled',service:'checkup',reason:'Annual check-up',billingStatus:'Unbilled'},
  {id:'a10',petId:'p3',vetId:'v2',date:plus(5),time:'11:30',status:'Pending Approval',service:'checkup',reason:'Annual check-up',billingStatus:'Unbilled'}],
 records:[{id:'r1',petId:'p1',vetId:'v1',apptId:'a7',date:plus(-14),symptoms:'Reason for visit: Vaccination: Anti-rabies',objective:'Temp 38.5',diagnosis:'Veterinarian confirmed suitability for vaccination.',treatment:'Anti-rabies administered.',prescription:'',careStatus:'Routine care',prescriptionItems:[]},
          {id:'r2',petId:'p4',vetId:'v1',apptId:'a8',date:plus(-45),symptoms:'Itchy skin',objective:'Red patches',diagnosis:'Pyoderma',treatment:'Medicated bath twice weekly.',prescription:'Complete the course.',careStatus:'Follow-up required',followUpDate:plus(2),followUpReason:'Skin recheck',prescriptionItems:[{catalogId:'product_medicated_wash',name:'Miconazole + Chlorhexidine Medicated Wash',quantity:2,unit:'item / package',instructions:'Bathe twice weekly for 4 weeks.'}]}],
 vacc:[{id:'d1',petId:'p1',apptId:'a7',consultationId:'r1',vaccine:'Anti-rabies',brand:'Defensor 3',batch:'LOT-2026-01',date:plus(-14),nextDue:plus(351),done:true,vetId:'v1',doseNo:1,doseOf:1},
       {id:'d2',petId:'p1',vaccine:'5-in-1',brand:'Vanguard Plus 5',batch:'LOT-2025-07',date:plus(-380),nextDue:plus(-15),done:true,vetId:'v1'},
       {id:'d3',petId:'p1',vaccine:'Deworming',brand:'Canex',date:plus(-80),nextDue:plus(10),done:true,vetId:'v2'},
       {id:'d4',petId:'p2',vaccine:'Feline 4-in-1',brand:'Felocell 4',date:plus(-300),nextDue:plus(65),done:true,vetId:'v1'}],
 petRequests:[{id:'req1',petId:'p3',ownerId:'o1',name:'Cookie',species:'Lagomorph',status:'Pending',revision:0,createdAt:new Date().toISOString()}],
 log:[{id:'l1',user:'Cza Ybanez',role:'assistant',action:'Recorded clinic intake for Mochi',at:new Date().toISOString()}],
 accountProfiles:{[me.id]:{name:me.name,email:me.email,phone:'+63 917 123 4567',role:me.role,emailVerified:true,mobileVerified:true,houseStreet:'12 Rizal St',city:'Makati',state:'Metro Manila',country:'Philippines',zipCode:'1200'}},
 summary:true,historyComplete:true};

const catalog=[{id:'srv_consult',name:'Routine General Consultation & Exam',category:'Consultation & Exam',price:500,desc:'Standard physical evaluation'},{id:'srv_rabies',name:'Anti-Rabies Vaccine (Annual Booster)',category:'Vaccination & Preventive',price:350},{id:'srv_groom',name:'Sanitary Grooming & Nail Trim',category:'Procedures & Care',price:250},{id:'product_oatmeal_shampoo',name:'Oatmeal & Aloe Vera Soothing Shampoo',category:'Pet shampoo',price:350,unit:'item / package'},{id:'product_probiotic',name:'Veterinary Probiotic Paste',category:'Pet vitamins',price:750,unit:'item / package'}];
const json=(data,status=200)=>new Response(JSON.stringify(status<400?{success:true,...(Array.isArray(data)?{data}:data)}:data),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async (path,options={})=>{
 const url=String(path);
 if(url.includes('/auth/profile'))return json({profile:db.accountProfiles[me.id]});
 if(url.includes('/services/prices'))return json({catalog,dewormingProducts:[]});
 if(url.includes('/admin/staff'))return json({staff:[{id:'u_vet',name:'Dr. Ana Cruz',email:'ana@gmail.com',role:'vet',vetId:'v1',active:true,locked:false,mobileVerified:true,accessRevision:0},{id:'u_vet2',name:'Dr. Ben Lim',email:'ben@gmail.com',role:'vet',vetId:'v2',active:true,locked:false,mobileVerified:true,accessRevision:0},{id:'u_asst',name:'Cza Ybanez',email:'cza@gmail.com',role:'assistant',active:false,locked:false,mobileVerified:true,accessRevision:1},{id:'u_admin',name:'Clinic Admin',email:'admin@gmail.com',role:'admin',self:true,active:true,locked:false,mobileVerified:true,accessRevision:0},{id:'u_admin2',name:'Maria Dela Cruz',email:'maria@gmail.com',role:'admin',self:false,active:true,locked:false,mobileVerified:true,accessRevision:0}],invitations:[{id:'i1',email:'new@gmail.com',name:'New Staff',role:'assistant',status:'Pending',expiresAt:new Date(Date.now()+6e8).toISOString()}],total:3});
 if(url.includes('/admin/audit'))return json({entries:[{id:'e1',actor:'Cza Ybanez',role:'assistant',action:'Recorded clinic intake for Mochi',at:new Date().toISOString()},{id:'e2',actor:'Clinic Admin',role:'admin',action:'Added price list item product_x "Joint chews" (Pet vitamins) at ₱250.00',at:new Date().toISOString()}],nextCursor:null});
 if(url.includes('/admin/catalog'))return json({items:catalog.map(c=>({...c,unit:c.unit||'visit',description:c.desc||'',active:true,builtIn:true,kind:c.id.startsWith('srv_')?'service':'product',requiresPrescription:false,revision:0,updatedBy:''}))});
 if(url.includes('/clinical/note-options'))return json({revision:1,options:{diagnosis:['Dermatitis','Otitis externa','Gastroenteritis'],treatment:['Monitor appetite at home.']}});
 if(url.includes('/clinic-document-profile'))return json({profile:{details:{name:'PawCare Veterinary Clinic',address:'123 Animal Wellness Blvd',phone:'(02) 8123-4567',email:'care@pawcare.ph',registration:'BAI-1'},revision:1,verified_at:new Date().toISOString()}});
 if(url.includes('/availability'))return json({slots:['09:00','09:30','10:00','10:30','13:00']});
 if(url.includes('/admissions'))return json({admissions:[],visits:[],summary:{},total:0});
 if(url.includes('/reminders/status'))return json({configured:false,pending:0});
 if(url.includes('/reminders/calls'))return json({calls:[],pending:0});
 if(url.includes('/checkout-inbox'))return json({tasks:[]});
 if(url.includes('/vet-card'))return json({history:{complete:true,pet:db.pets[0],owner:db.owners[0],events:db.vacc.filter(v=>v.petId==='p1').map(v=>({...v,kind:v.vaccine==='Deworming'?'deworming':'vaccination',vetName:'Dr. Ana Cruz'}))},document:{reference:'DVC-1',revision:1}});
 return json({});
};
sessionStorage.setItem(`pawcare_page_${me.id}`,params.get('page')||cfgs[role].menu[0].k);
window.menuKeys=()=>cfgs[role].menu.filter(m=>!m.hide).map(m=>m.k);
const root=createRoot(document.getElementById('root'));
flushSync(()=>root.render(<Portal cfg={cfgs[role]} me={me} db={db} setDb={()=>{}} onLogout={()=>{}} dataLoading={false} dataError="" refreshing={false} onRetry={()=>{}}/>));
setTimeout(()=>{document.body.dataset.ready='1';},1800);
