import {test,after} from 'node:test';
import {buildSync} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const directory=mkdtempSync(join(tmpdir(),'pawcare-staff-validation-'));
after(()=>rmSync(directory,{recursive:true,force:true}));
const outfile=join(directory,'validation.cjs');
buildSync({entryPoints:['src/staffSetupValidation.js'],bundle:true,platform:'node',format:'cjs',outfile,define:{'import.meta.env':'{}'},logLevel:'silent'});
const {validateStaffSetupField:error}=createRequire(import.meta.url)(outfile);
test('staff setup validates optional initial, real adult birth, phone and required province inline',()=>{
 assert.equal(error('middleInitial',''), '');assert.equal(error('middleInitial','M.'),'');assert.ok(error('middleInitial','..'));
 assert.ok(error('birthday','2000-02-30'));assert.ok(error('birthday','2020-01-01'));assert.equal(error('birthday','1990-01-01'),'');
 assert.ok(error('mobileNumber','1234567890'));assert.equal(error('mobileNumber','09171234567'),'');
 assert.ok(error('state',''));assert.equal(error('state','Metro Manila'),'');
 assert.ok(error('confirmPassword','Mismatch',{password:'Original'}));
});
