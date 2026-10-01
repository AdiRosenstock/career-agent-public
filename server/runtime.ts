import { readFile, mkdir, writeFile, chmod, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSeed } from './seed.js';
import { createStore } from './store.js';
import { createEngine, sameJob } from './engine.js';
import { assessJob, discoverBoard, normalizeJob, parseAtsJobUrl, validateBoard, inspectGreenhouse } from './discovery.js';
import type { AppState, Board, DailyRun, Job, PacketDraft } from '../shared/types.js';

export const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Configuration stays on the server; never prefix secrets with VITE_.
try { process.loadEnvFile(path.join(workspace,'.env.local')); } catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e; }
export const dataDir = path.resolve(process.env.CAREER_DATA_DIR || path.join(workspace,'.data'));
if(process.env.CAREER_BACKEND && !['sqlite','supabase'].includes(process.env.CAREER_BACKEND))throw new Error('CAREER_BACKEND must be sqlite or supabase; refusing to select a different database.');
export const backend = process.env.CAREER_BACKEND === 'supabase' ? 'supabase' : 'sqlite';
export async function openRuntime() {
 await mkdir(dataDir,{recursive:true,mode:0o700}); await chmod(dataDir,0o700);
 const initialState=async()=>{
 const resumePath = path.join(dataDir,'artifacts','resume.pdf');
 const source = process.env.CAREER_RESUME_PATH || resumePath;
 await mkdir(path.dirname(resumePath),{recursive:true,mode:0o700});
 try { await access(resumePath); } catch {
  if(!process.env.CAREER_RESUME_PATH)throw new Error('Set CAREER_RESUME_PATH to your local PDF before initializing a new data directory.');
  await copyFile(source,resumePath); await chmod(resumePath,0o600);
 }
 const profileSeedPath=path.join(dataDir,'profile-seed.json');
 const seed = await createSeed({resumePath,originalPath:source,profileSeedPath});
 seed.profile.resume.originalPath=source;
 seed.profile.resume.filename=path.basename(source);
 seed.settings.backend=backend;
 if(!seed.boards.length) seed.boards=[
  ['ID.me','idmeuniversityrecruiting'], ['Databricks','databricks'], ['Stripe','stripe'], ['Optiver','optiverus'], ['IMC Trading','imc'], ['Roblox','roblox']
 ].map(([company,token])=>({id:`greenhouse:${token}`,company,source:'greenhouse',token,enabled:true,sponsorship:[]}));
 return seed;
 };
 const store = await createStore({backend,dataDir,seed:initialState,supabaseUrl:process.env.SUPABASE_URL,supabaseServiceKey:process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY});
 const engine=createEngine(store,{workspace});
 return {store,engine};
}
export type Runtime=Awaited<ReturnType<typeof openRuntime>>;
export function codexPrompt(mode:string,batchId?:string) {
 if(mode==='accounts') return `Use $job-application-agent in ${workspace}. Check the authorized email connector and signed-in LinkedIn and Handshake sessions for previous applications and suitable 2027 US full-time new-grad jobs. Read application confirmations, not marketing or suggested jobs. Import verified prior applications with source references and exclude exact matching jobs. Never infer that an entire employer is already applied to. Use the saved salary minimum and compensation basis, keep unverified pay in research, and exclude internships. If sign-in or connector access is missing, report the missing connection. Do not submit applications, send messages, or change account settings.`;
 if(mode==='submit') {
  if(!batchId) throw new Error('Choose an approved batch first.');
  return `Use $job-application-agent in ${workspace}. Submit only the approved application batch ${batchId}. Read the submission workflow and exact approved packets, refresh each job and inspect its hosted form, preserve the original résumé, and record an attempt before clicking Submit. Stop for changed content or missing answers. Record confirmation evidence; never retry an uncertain submission.`;
 }
 return `Use $job-application-agent in ${workspace}. First finish existing Needs answers packets: apply newly confirmed profile facts and exact saved answers, inspect or recheck hosted forms, complete every factual answer that the saved sources support, and remove review notes only when actually resolved. Surface a short grouped list of genuinely personal choices or employer declarations that the candidate still needs to answer; do not guess or mark them confirmed. Then run today's discovery and preparation workflow, with at most 20 new applications across all runs today. Prioritize 2027 US full-time new-grad, graduate, and entry-level PM/APM and data roles, and cover Forward Deployed Engineer, wealth and asset management, sales and trading, consulting, and SWE. Exclude internships and follow the saved annual compensation minimum and basis; keep unknown pay in research. Check authorized email and account history for exact prior applications before preparing. Check sponsorship evidence, preserve the original résumé and supporting PDFs, and save only complete packets to Ready to review. Do not submit applications. Notify only if a new reviewable batch or user action is ready.`;
}
export function dayKey(date=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
let discoveryRunning=false;
export async function runDiscovery(rt:Runtime,{prepare=false}:{prepare?:boolean}={}) {
 if(discoveryRunning) throw new Error('A discovery run is already active.');
 discoveryRunning=true;
 const start=new Date().toISOString();
 const run:DailyRun={id:randomUUID(),day:dayKey(),startedAt:start,finishedAt:null,status:'running',discovered:0,prepared:0,errors:[]};
 try {
  await rt.store.update(s=>{
   const recent=s.runs.find(r=>r.status==='running' && Date.now()-Date.parse(r.startedAt)<30*60*1000);
   if(recent)throw new Error('A discovery run is already active. Retry after it completes.');
   for(const stale of s.runs.filter(r=>r.status==='running')){stale.status='failed';stale.finishedAt=start;stale.errors.push('Previous discovery was interrupted; recovered after its lease expired.');}
   s.runs.push(run);
  });
 }catch(e){discoveryRunning=false;throw e;}
 try {
  const state=await rt.store.read();
  const active=state.boards.filter(b=>b.enabled);
  if(!active.length) throw new Error('Enable at least one employer board in Settings.');
  // Bound network concurrency, and persist only potentially relevant graduate roles.
  for(let i=0;i<active.length;i+=2) {
   const responses=await Promise.allSettled(active.slice(i,i+2).map(async board=>({board,jobs:await discoverBoard(board)})));
   for(let j=0;j<responses.length;j++) {
    const response=responses[j];
    if(response.status==='rejected'){run.errors.push(`${active[i+j].company}: ${response.reason instanceof Error?response.reason.message:String(response.reason)}`);continue;}
    const {board,jobs}=response.value;
    const seen=new Set(jobs.map(job=>job.postingId));
    const tracked=jobs.filter(job=>state.jobs.some(old=>sameJob(old,job)));
    const candidates=jobs.filter(job=>!tracked.includes(job)&&job.roleFamily!=='other' && (/new[ -]?grad|graduate|early[ -]?career|entry[ -]?level|2027|analyst\s*(?:i\b|1\b)|associate product|quantitative (?:trader|researcher)/i.test(job.title) || job.eligible));
    for(const job of [...tracked,...candidates.slice(0,250)]){const local=state.jobs.find(j=>sameJob(j,job));await rt.engine.upsertJob(assessJob(preserveLocal(job,local)));run.discovered++;}
    for(const old of state.jobs.filter(job=>job.source===board.source&&job.board===board.token&&job.status!=='closed'&&!seen.has(job.postingId))) await rt.engine.upsertJob({...old,status:'closed',fetchedAt:new Date().toISOString()});
   }
  }
  if(prepare) {
   const s=await rt.store.read();
   const remaining=Math.max(0,s.settings.dailyLimit-s.preparationLedger.filter(x=>x.day===dayKey()).length);
   const candidates=s.jobs.filter(j=>j.eligible&&!j.dismissed&&!s.packets.some(p=>p.jobId===j.id)).sort((a,b)=>b.score-a.score).slice(0,remaining);
   for(const job of candidates) {
    try {
     if(job.source==='greenhouse') {
      const inspected=await inspectGreenhouse(job);
      await rt.engine.upsertJob(assessJob({...job,...inspected}));
     }
     await rt.engine.prepare(job.id);run.prepared++;
    }catch(e){run.errors.push(`${job.company} / ${job.title}: ${e instanceof Error?e.message:String(e)}`);}
   }
  }
  run.status=run.errors.length?(run.discovered?'partial':'failed'):'complete';
 }catch(e){run.status='failed';run.errors.push(e instanceof Error?e.message:String(e));}
 finally {
  run.finishedAt=new Date().toISOString();
  try {await rt.engine.updateRun(run);await backupState(rt);} finally {discoveryRunning=false;}
 }
 return run;
}
export async function importJob(rt:Runtime,input:{url?:string;company?:string;title?:string;location?:string;description?:string}) {
 const url=input.url?.trim();
 if(!url) throw new Error('Provide the original job URL.');
 const u=new URL(url);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error('Use a public http(s) job URL.');
 const ats=parseAtsJobUrl(url);
 if(ats) {
  const board:Board={id:`${ats.source}:${ats.token}`,company:input.company||ats.token,source:ats.source,token:ats.token,enabled:false,sponsorship:[]};
  const existing=(await rt.store.read()).boards.find(b=>b.source===board.source&&b.token===board.token);
  const jobs=await discoverBoard({...existing||board,enabled:true});
  const found=jobs.find(j=>j.postingId===ats.postingId);
  if(!found)throw new Error('This posting is absent from its live board. It may have closed.');
  const local=(await rt.store.read()).jobs.find(j=>sameJob(j,found));
  return rt.engine.upsertJob(assessJob(preserveLocal(found,local)));
 }
 if(!input.company?.trim()||!input.title?.trim()||!input.description?.trim())throw new Error('For this site, paste the employer, title, location, and description. Codex can research the source page.');
 const job=normalizeJob({company:input.company,title:input.title,location:input.location||'Unknown',description:input.description,sourceUrl:url,applyUrl:url,status:'unknown',fetchedAt:new Date().toISOString()});
 const local=(await rt.store.read()).jobs.find(j=>sameJob(j,job));
 return rt.engine.upsertJob(assessJob(preserveLocal(job,local)));
}
export async function refreshJob(rt:Runtime,id:string) {
 const s=await rt.store.read();const old=s.jobs.find(j=>j.id===id);if(!old)throw new Error('Job not found.');
 if(old.source==='manual')throw new Error('Inspect this employer page with Codex, then use job-put to record the refreshed source.');
 const board=s.boards.find(b=>b.source===old.source&&b.token===old.board)||{id:`${old.source}:${old.board}`,company:old.company,source:old.source,token:old.board,enabled:false,sponsorship:old.sponsorship.filter(x=>x.scope==='employer')};
 const jobs=await discoverBoard({...board,enabled:true} as Board);
 const found=jobs.find(j=>j.postingId===old.postingId);
 if(!found)return rt.engine.upsertJob({...old,status:'closed',fetchedAt:new Date().toISOString()});
 // Keep human-inspected form only while its questions and source remain valid; reinspection occurs before submit.
 return rt.engine.upsertJob(assessJob({...preserveLocal(found,old),questions:old.questions,formInspectedAt:old.formInspectedAt,formVersion:old.formVersion}));
}
export async function backupState(rt:Runtime) {
 const state=await rt.store.read();
 const dir=path.join(dataDir,'backups');await mkdir(dir,{recursive:true,mode:0o700});
 const dest=path.join(dir,'latest.json');await writeFile(dest,JSON.stringify(state,null,2),{mode:0o600});
 return dest;
}
export async function inspectForm(rt:Runtime,id:string,input:{questions:Job['questions'];checkedAt?:string;applyUrl?:string}) {
 const job=(await rt.store.read()).jobs.find(j=>j.id===id);if(!job)throw new Error('Job not found.');
 if(!Array.isArray(input.questions))throw new Error('Supply the complete inspected question list.');
 for(const q of input.questions)if(!q.id||!q.label||typeof q.required!=='boolean')throw new Error('Each inspected question needs an id, label, required flag, and type.');
 return rt.engine.upsertJob(assessJob({...job,questions:input.questions,applyUrl:input.applyUrl||job.applyUrl,formInspectedAt:input.checkedAt||new Date().toISOString()}));
}
export const sha256=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');

export function preserveLocal(incoming:Job,existing?:Job):Job {
 if(!existing)return incoming;
 const unchanged=incoming.description===existing.description && incoming.applyUrl===existing.applyUrl;
 const evidence=[...existing.sponsorship.filter(e=>!e.id.startsWith('text-')&&(e.scope==='employer'||unchanged)),...incoming.sponsorship];
 const unique=[...new Map(evidence.map(e=>[e.id,e])).values()];
 return {...incoming,dismissed:existing.dismissed,sponsorship:unique};
}
