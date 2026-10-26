import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visitNextStep} from '../src/visitProgress.js';
test('next responsibility follows saved clinical and financial states independently',()=>{
 for(const [status,by] of [['Pending Approval','Reception'],['Scheduled','Reception'],['Checked-in','Assigned veterinarian'],['In consultation','Assigned veterinarian'],['Completed','Reception']])assert.equal(visitNextStep({status}).by,by);
 assert.equal(visitNextStep({status:'Completed',billingStatus:'Paid'}).by,'Owner');
 assert.match(visitNextStep({status:'Completed',admissionStatus:'Admitted'}).text,/Continue hospital care/);
 assert.match(visitNextStep({status:'Completed',admissionStatus:'Ready for discharge',billingStatus:'Unpaid'}).text,/payment before release/);
 assert.match(visitNextStep({status:'Completed',admissionStatus:'Ready for discharge',billingStatus:'Paid'}).text,/Confirm.*release/);
 for(const status of ['Cancelled','Rejected','No-show'])assert.match(visitNextStep({status}).text,/another visit/);
});

test('past unarrived visits direct reception to review rather than capture a backdated arrival',()=>{assert.match(visitNextStep({status:'Scheduled',date:'2026-10-25'},'2026-10-26').text,/missed arrival/);});
