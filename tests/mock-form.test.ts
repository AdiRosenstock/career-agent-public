import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestSeed } from './fixtures.js';
import { createStore } from '../server/store.js';
import { createEngine } from '../server/engine.js';
import { normalizeJob } from '../server/discovery.js';

test('mock hosted form validates fields, confirms success, and a lost response never causes a second submission',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'career-form-'));const pdf=path.join(dir,'resume.pdf');await writeFile(pdf,'%PDF mock');
 const seed=await createTestSeed({resumePath:pdf,originalPath:pdf});const store=await createStore({backend:'sqlite',dataDir:dir,seed});const engine=createEngine(store);let count=0;
 const server=createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{
  if(req.method==='GET'){res.setHeader('Content-Type','text/html');res.end('<form method="POST"><label>Email<input name="email" type="email" required></label><button>Submit application</button></form>');return;}
  if(!new URLSearchParams(body).get('email')){res.writeHead(422);res.end('Email is required; application was not saved.');return;}
  count++;if(req.url==='/lost'){req.socket.destroy();return;}res.end('Thank you. Your application has been received. Reference MOCK-001.');
 });});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await store.close();await rm(dir,{recursive:true,force:true});});
 const makeJob=(suffix:string)=>normalizeJob({company:'Fixture Employer',title:`Graduate Data Engineer 2027 ${suffix}`,description:'New graduate full time role. Visa sponsorship is available.',location:'Chicago, IL',source:'greenhouse',board:'fixture',postingId:suffix,sourceUrl:`${base}/${suffix}`,applyUrl:`${base}/${suffix}`,status:'open',formInspectedAt:new Date().toISOString(),questions:[{id:'email',label:'Email',required:true,type:'input_text'}]});
 assert.match(await fetch(`${base}/ok`).then(r=>r.text()),/required/);
 const job=await engine.upsertJob(makeJob('ok'));const packet=await engine.prepare(job.id);await engine.approve([packet.id]);const attempt=await engine.beginSubmission(packet.id);
 assert.equal((await store.read()).attempts[0].outcome,'in_progress');
 let response=await fetch(`${base}/ok`,{method:'POST',body:new URLSearchParams()});assert.equal(response.status,422);await engine.finishSubmission(attempt.id,'failed',await response.text());assert.equal(count,0);
 await engine.editPacket(packet.id,{});await engine.approve([packet.id]);const retry=await engine.beginSubmission(packet.id);response=await fetch(`${base}/ok`,{method:'POST',body:new URLSearchParams({email:seed.profile.email})});await engine.finishSubmission(retry.id,'submitted',await response.text(),`${base}/confirmation`);assert.equal(count,1);
 await assert.rejects(engine.beginSubmission(packet.id));
 const lostJob=await engine.upsertJob(makeJob('lost'));const lostPacket=await engine.prepare(lostJob.id);await engine.approve([lostPacket.id]);const lost=await engine.beginSubmission(lostPacket.id);
 await assert.rejects(fetch(`${base}/lost`,{method:'POST',body:new URLSearchParams({email:seed.profile.email})}));await engine.finishSubmission(lost.id,'unknown','Network connection lost after Submit; employer response was not observed.');
 await assert.rejects(engine.beginSubmission(lostPacket.id),/unknown|reconcil/i);assert.equal(count,2);
});
