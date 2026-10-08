import { roleFamilies } from '../shared/candidatePolicy.js';
import { validProfileLinkUrl } from '../shared/profileLinks.js';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { openRuntime, workspace, dataDir, importJob, runDiscovery, inspectForm, codexPrompt, backupState } from './runtime.js';
import { registerResumeUpload } from './resume.js';
import { registerDocumentUpload } from './documents.js';
import { assessJob, validateBoard } from './discovery.js';
import type { Board, PacketDraft } from '../shared/types.js';
import { verifiedDocumentBytes } from './documents.js';
import { helperBundle } from '../shared/helperBundle.js';
import { agentWork } from './agent-context.js';

const rt=await openRuntime();
const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
 const host=(req.headers.host||'').split(':')[0];
 if(!['localhost','127.0.0.1','[::1]'].includes(host)){res.status(403).json({error:'Local connections only.'});return;}
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
  const origin=req.headers.origin;
  if(origin&&origin!==`http://${req.headers.host}`){res.status(403).json({error:'Cross-origin writes are blocked.'});return;}
  if(req.headers['x-career-agent']!=='dashboard'){res.status(403).json({error:'Missing local application request header.'});return;}
  if(!req.is('application/json')){res.status(415).json({error:'JSON body required.'});return;}
 }
 next();
});
const route=(handler:(req:express.Request,res:express.Response)=>Promise<unknown>):express.RequestHandler=>(req,res,next)=>{handler(req,res).catch(next);};
app.post('/api/resume/upload', express.json({limit:'28mb'}), route(async(req,res)=>{
 const input=z.object({filename:z.string().min(1).max(255),base64:z.string().min(1).max(28_000_000)}).strict().parse(req.body);
 res.json(await registerResumeUpload(rt,dataDir,input.filename,input.base64));
}));
app.post('/api/documents/upload', express.json({limit:'28mb'}), route(async(req,res)=>{
 const input=z.object({filename:z.string().min(1).max(255),base64:z.string().min(1).max(28_000_000),kind:z.enum(['transcript','recommendation','base_cover_letter']),label:z.string().min(1).max(200).optional(),documentDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),notes:z.string().max(5000).optional()}).strict().parse(req.body);
 res.json(await registerDocumentUpload(rt,dataDir,input));
}));
app.use(express.json({limit:'2mb'}));
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'career-agent'}));
app.get('/api/state',route(async(_req,res)=>res.json(await rt.engine.snapshot())));
app.get('/api/work',route(async(req,res)=>res.json(agentWork(await rt.engine.snapshot(),{dashboardUrl:`http://${req.headers.host}`,...z.object({limit:z.coerce.number().int().min(1).max(20).optional(),offset:z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),batchId:z.string().min(1).max(128).optional()}).parse(req.query)}))));
app.get('/api/helper-export',route(async(_req,res)=>{
 res.setHeader('Content-Disposition','attachment; filename="career-helper-full.json"');
 res.json(helperBundle(await rt.engine.snapshot()));
}));
app.get('/api/documents/:id',route(async(req,res)=>{
 const document=(await rt.store.read()).profile.documents?.find(d=>d.id===req.params.id);
 if(!document){res.status(404).json({error:'Document not found.'});return;}
 try{const bytes=await verifiedDocumentBytes(document);res.type('application/pdf');res.setHeader('Content-Disposition',`inline; filename="${document.filename.replace(/[^a-zA-Z0-9 ._()-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(document.filename)}`);res.send(bytes);}
 catch{res.status(409).json({error:'Supporting document is missing or changed. Restore the unchanged original.'});}
}));
app.get('/api/resume',route(async(_req,res)=>{
 const snapshot=await rt.engine.snapshot();
 if(!snapshot.meta.resumeValid){res.status(409).json({error:'Résumé hash mismatch. Restore the original PDF before using it.'});return;}
 const filename=snapshot.profile.resume.filename || 'resume.pdf';
 res.setHeader('Content-Disposition',`inline; filename="${filename.replace(/[^a-zA-Z0-9 ._()-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`);res.sendFile(snapshot.profile.resume.path, {dotfiles: 'allow'});
}));
app.get('/api/export',route(async(_req,res)=>{await backupState(rt);res.setHeader('Content-Disposition','attachment; filename="career-agent-backup.json"');res.json(await rt.store.read());}));
const promptRoute = route(async(req,res)=>{
 const mode=String(req.query.mode||'prepare');
 if(mode==='automatic' && (await rt.engine.snapshot()).settings.applicationPreferences?.submission!=='automatic') {res.status(400).json({error:'Select and confirm automatic submission in Start here first'});return;}
 res.json({prompt:codexPrompt(mode,req.query.batchId?String(req.query.batchId):undefined,z.enum(['codex','claude']).parse(req.query.provider||'codex'))});
});
app.get('/api/agent-prompt', promptRoute);
app.get('/api/codex-prompt', promptRoute); // Compatibility for existing clients.

app.post('/api/discover',route(async(_req,res)=>res.json(await runDiscovery(rt,{prepare:true}))));
app.post('/api/jobs/import',route(async(req,res)=>res.json(await importJob(rt,z.object({url:z.string().max(4096),company:z.string().max(300).optional(),title:z.string().max(500).optional(),location:z.string().max(500).optional(),description:z.string().max(100000).optional()}).parse(req.body)))));
app.post('/api/jobs/:id/dismiss',route(async(req,res)=>{
 const {dismissed}=z.object({dismissed:z.boolean()}).parse(req.body);
 const job=(await rt.store.read()).jobs.find(j=>j.id===req.params.id);if(!job){res.status(404).json({error:'Job not found.'});return;}
 res.json(await rt.engine.upsertJob({...job,dismissed}));
}));
app.post('/api/jobs/:id/applied',route(async(req,res)=>res.json(await rt.engine.markAlreadyApplied(String(req.params.id)))));
app.post('/api/jobs/:id/prepare',route(async(req,res)=>res.json(await rt.engine.prepare(String(req.params.id)))));
app.post('/api/jobs/:id/inspect',route(async(req,res)=>res.json(await inspectForm(rt,String(req.params.id),req.body))));
app.post('/api/packets/:id/edit',route(async(req,res)=>{
 const input=z.object({answers:z.array(z.object({questionId:z.string(),question:z.string(),answer:z.string().max(15000),factIds:z.array(z.string()),confirmed:z.boolean()})).optional(),attachments:z.array(z.object({questionId:z.string(),documentId:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).optional(),coverLetter:z.string().max(30000).optional(),unresolved:z.array(z.string()).optional(),notes:z.string().max(10000).optional()}).parse(req.body);
 res.json(await rt.engine.editPacket(String(req.params.id),input));
}));
app.post('/api/approvals',route(async(req,res)=>{
 const {packetIds,provider}=z.object({packetIds:z.array(z.string()).min(1).max(100),provider:z.enum(['codex','claude']).default('codex')}).parse(req.body);
 const approved=await rt.engine.approve(packetIds);res.json({...approved,approved:approved.packetIds.length,prompt:codexPrompt('submit',approved.batchId,provider)});
}));
const booleanAnswer=z.boolean().nullable();
const portfolioLink=z.object({id:z.string().min(1).max(300),label:z.string().trim().min(1).max(120),url:z.url().max(2000).refine(validProfileLinkUrl),notes:z.string().max(1000)}).strict();
const profilePatch=z.object({name:z.string().trim().min(1).max(300).optional(),email:z.email().optional(),phone:z.string().max(100).optional(),linkedin:z.union([z.url(),z.literal('')]).optional(),github:z.union([z.url(),z.literal('')]).optional(),graduation:z.string().regex(/^$|^\d{4}-(?:0[1-9]|1[0-2])$/).optional(),visaStatus:z.string().max(200).optional(),anticipatedOPT:z.boolean().optional(),earliestStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),salaryPreference:z.string().max(500).nullable().optional(),usCitizen:booleanAnswer.optional(),exportControlEligible:booleanAnswer.optional(),clearanceEligible:booleanAnswer.optional(),authorizationNow:booleanAnswer.optional(),authorizationAtStart:booleanAnswer.optional(),futureSponsorship:booleanAnswer.optional(),authorizationConfirmedAt:z.string().nullable().optional(),facts:z.array(z.object({id:z.string().min(1),label:z.string().min(1),value:z.string().max(5000),source:z.string().min(1),confirmed:z.boolean()})).max(200).optional(),portfolioLinks:z.array(portfolioLink).max(20).optional(),savedAnswers:z.array(z.object({id:z.string(),question:z.string().min(1).max(3000),answer:z.string().max(15000),confirmedAt:z.string()})).max(500).optional()});
const settingsPatch=z.object({applicationPreferences:z.object({writtenAnswers:z.enum(['draft','saved_only','self']),formFilling:z.enum(['agent','self']),submission:z.enum(['self','review','automatic']),confirmedAt:z.string().datetime(),automaticRiskAccepted:z.boolean()}).strict().optional(),careerStage:z.enum(['new_grad','early_career','experienced']).optional(),yearsExperience:z.number().min(0).max(60).nullable().optional(),careerTargetsConfirmed:z.boolean().optional(),rolePriority:z.array(z.enum(roleFamilies)).max(roleFamilies.length).optional(),roleKeywords:z.array(z.string().trim().min(1).max(100)).max(30).optional(),preferredLocations:z.array(z.string().trim().min(1).max(200)).max(30).optional(),targetEmployers:z.array(z.string().trim().min(1).max(200)).max(30).optional(),preferredCareerSites:z.array(z.url().max(500)).max(20).optional(),workplacePreference:z.enum(['any','remote','hybrid','onsite']).optional(),dailyLimit:z.number().int().min(1).max(20).optional(),minimumAnnualCompensation:z.number().int().min(0).max(10000000).nullable().optional(),compensationBasis:z.enum(['base','total']).optional()}).strict();
app.post('/api/profile',route(async(req,res)=>res.json(await rt.engine.updateProfile(profilePatch.parse(req.body)))));
app.post('/api/settings',route(async(req,res)=>res.json(await rt.engine.updateSettings(settingsPatch.parse(req.body)))));
app.post('/api/onboarding',route(async(req,res)=>{
 const input=z.object({profile:profilePatch,settings:settingsPatch}).strict().parse(req.body);
 res.json(await rt.engine.updateOnboarding(input));
}));
app.post('/api/boards',route(async(req,res)=>{
 const data=z.object({id:z.string().optional(),company:z.string().min(1).max(300),source:z.enum(['greenhouse','lever','ashby']),token:z.string().min(1).max(200),enabled:z.boolean().optional(),sponsorship:z.array(z.object({id:z.string(),status:z.enum(['explicit_yes','history_only','unknown','explicit_no']),sourceUrl:z.url(),excerpt:z.string().min(1).max(10000),checkedAt:z.string(),employerName:z.string(),scope:z.enum(['role','employer']),entityMatch:z.boolean()})).optional()}).parse(req.body);
 const board:Board={...data,id:data.id||`${data.source}:${data.token}`,enabled:data.enabled??true,sponsorship:data.sponsorship||[]};
 res.json(await rt.engine.upsertBoard(validateBoard(board)));
}));
app.use('/api',(_req,res)=>res.status(404).json({error:'Unknown API route.'}));
if(existsSync(path.join(workspace,'dist','index.html'))){
 app.use(express.static(path.join(workspace,'dist')));
 app.get('/{*splat}',(_req,res)=>res.sendFile(path.join(workspace,'dist','index.html')));
}else{
 const vite=await createViteServer({root:workspace,server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
}
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
 const e=error as Error & {status?:number;statusCode?:number};
 const status=error instanceof z.ZodError?400:e.status||e.statusCode||400;
 res.status(status>=400&&status<600?status:400).json({error:error instanceof z.ZodError?error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '):e.message||'Request failed.'});
});
const port=Number(process.env.PORT||4317);
const server=app.listen(port,'127.0.0.1',()=>console.log(`Career Agent ready: http://127.0.0.1:${(server.address() as {port:number}).port}`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
for(const sig of ['SIGTERM','SIGINT'] as const)process.on(sig,()=>{server.close(()=>{Promise.resolve(rt.store.close()).finally(()=>process.exit(0));});});
