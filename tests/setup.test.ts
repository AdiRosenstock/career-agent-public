import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
const setupModule = '../scripts/setup.mjs';
const { configureWorkspace } = await import(setupModule);

test('setup captures configuration without changing documents, creating state, or overwriting existing credentials', async t => {
 const dir=await mkdtemp(path.join(tmpdir(),'career-setup-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const resume=path.join(dir,'Original Resume.pdf');const bytes=Buffer.from('%PDF-1.4 unchanged fixture');await writeFile(resume,bytes);
 await configureWorkspace({directory:dir,resume});
 const config=await readFile(path.join(dir,'.env.local'),'utf8');assert.match(config,/CAREER_BACKEND=sqlite/);assert.match(config,/Original Resume\.pdf/);assert.deepEqual(await readFile(resume),bytes);
 assert.deepEqual((await readdir(dir)).sort(),['.env.local','Original Resume.pdf']);
 await assert.rejects(configureWorkspace({directory:dir,resume,backend:'supabase',supabaseUrl:'https://example.supabase.co'}),{code:'EEXIST'});
 assert.equal(await readFile(path.join(dir,'.env.local'),'utf8'),config);
});
test('setup rejects invalid documents, backend choices and credential-bearing service URLs without creating config',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'career-setup-'));t.after(()=>rm(dir,{recursive:true,force:true}));const resume=path.join(dir,'original.pdf');await writeFile(resume,'not a PDF');
 await assert.rejects(configureWorkspace({directory:dir,resume}),/PDF/);await writeFile(resume,'%PDF-1.4 fixture');
 await assert.rejects(configureWorkspace({directory:dir,resume,backend:'automatic'}),/sqlite or supabase/);
 await assert.rejects(configureWorkspace({directory:dir,resume,backend:'supabase',supabaseUrl:'https://user:secret@example.test'}),/without credentials/);
 assert.deepEqual(await readdir(dir),['original.pdf']);
});

test('setup can defer résumé selection to the dashboard', async t => {
 const dir=await mkdtemp(path.join(tmpdir(),'career-setup-dashboard-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await configureWorkspace({directory:dir});
 const config=await readFile(path.join(dir,'.env.local'),'utf8');
 assert.match(config,/CAREER_BACKEND=sqlite/);
 assert.doesNotMatch(config,/CAREER_RESUME_PATH/);
});
