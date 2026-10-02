import { matchesTargets, priorityRank } from '../shared/candidatePolicy.js';
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
function workflowPrompt(mode:string,batchId?:string) {
 if(!['prepare','submit','accounts'].includes(mode)) throw new Error('Choose prepare, submit or accounts.');
 const start = `Use $job-application-agent in ${workspace}. Run npm run agent -- work`;
 if(mode==='accounts') return `${start}. Check available authorized email and application history, record exact confirmation evidence, and continue useful research if an account is disconnected. Report missing access once. Do not submit or send messages.`;
 if(mode==='submit') {
  if(!batchId || !/^[a-zA-Z0-9_-]{1,128}$/.test(batchId)) throw new Error('Choose an approved batch first.');
  return `${start} --batch ${batchId}. Complete and submit approved batch ${batchId} using the exact approved packets and live browser forms. Follow begin → Submit once → finish with confirmation evidence. No repeat permission requests for unchanged approved contents. Return changed forms or missing personal answers to dashboard review; continue the other approved jobs. Never retry an uncertain submission.`;
 }
 return `${start}. Use my saved dashboard criteria. Complete existing drafts, then search employer sites and prepare matching applications within today's cap. Inspect live forms and complete all supported browser steps using confirmed facts and unchanged documents. Put missing personal questions in Review queue → Needs answers; continue other jobs. If setup is incomplete, link Start here once. Do the work without an interview or a planning round. Stop at review; do not submit or start a schedule.`;
}
export function codexPrompt(mode: string, batchId?: string, provider: string = 'codex'): string {
 if (!['codex', 'claude'].includes(provider)) throw new Error('Agent provider must be codex or claude.');
 const prompt = workflowPrompt(mode, batchId);
 return provider === 'claude' ? prompt.replaceAll('$job-application-agent', '/job-application-agent').replaceAll('Codex', 'Claude Code') : prompt;
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
    const candidates=jobs.filter(job=>!tracked.includes(job)&&matchesTargets(job,state.settings) && (state.settings.careerStage !== undefined || /new[ -]?grad|graduate|early[ -]?career|entry[ -]?level|2027|analyst\s*(?:i\b|1\b)|associate product|quantitative (?:trader|researcher)/i.test(job.title) || job.eligible || /0\s*[–-]\s*2\s*years/i.test(job.description)));
    for(const job of [...tracked,...candidates.slice(0,250)]){const local=state.jobs.find(j=>sameJob(j,job));await rt.engine.upsertJob(assessJob(preserveLocal(job,local)));run.discovered++;}
    for(const old of state.jobs.filter(job=>job.source===board.source&&job.board===board.token&&job.status!=='closed'&&!seen.has(job.postingId))) await rt.engine.upsertJob({...old,status:'closed',fetchedAt:new Date().toISOString()});
   }
  }
  if(prepare) {
   const s=await rt.store.read();
   const remaining=Math.max(0,s.settings.dailyLimit-s.preparationLedger.filter(x=>x.day===dayKey()).length);
   const candidates=s.jobs.filter(j=>j.eligible&&!j.dismissed&&!s.packets.some(p=>p.jobId===j.id)).sort((a,b)=>priorityRank(a,s.settings)-priorityRank(b,s.settings)||b.score-a.score).slice(0,remaining);
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
