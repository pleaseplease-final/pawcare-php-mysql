import 'dotenv/config';
import {migrateDatabase} from '../migrations.js';

const args=process.argv.slice(2);
if(args.length!==1 || !['--check','--apply'].includes(args[0])){
 console.error('Usage: node server/scripts/migrate.js --check | --apply');process.exitCode=1;
}else if(!process.env.DATABASE_URL){
 console.error('DATABASE_URL must identify the intended existing clinic database.');process.exitCode=1;
}else{
 const {pool}=await import('../db.js');
 let client;
 try{
  client=await pool.connect();
  const result=await migrateDatabase(client,{check:args[0]==='--check'});
  console.log(JSON.stringify({...result,result:result.check?'Checks passed; all changes rolled back.':'Migrations committed. No demo records seeded.'},null,2));
 }catch(error){console.error('Migration failed; batch rolled back.',error.code||'',error.message);process.exitCode=1;}
 finally{client?.release();await pool.end();}
}
