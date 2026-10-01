import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, symlink, truncate, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createEngine } from '../server/engine.js';
import { createStore } from '../server/store.js';
import { registerResume, verifiedResumeBytes } from '../server/resume.js';
import { createTestSeed } from './fixtures.js';
import type { Job } from '../shared/types.js';

const now = new Date('2026-09-28T15:00:00.000Z');
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
function job(id: string): Job {
 return { id, source: 'greenhouse', board: 'example', postingId: id, company: 'Example', title: `Data Analyst 2027 ${id}`, location: 'Chicago, IL, United States', description: 'Graduate full-time 2027 role.', sourceUrl: `https://example.test/jobs/${id}`, applyUrl: `https://job-boards.greenhouse.io/example/jobs/${id}`, fetchedAt: now.toISOString(), postedAt: null, deadline: null, status: 'open', roleFamily: 'data', sponsorship: [{ id: 'sponsor', status: 'history_only', sourceUrl: 'https://example.test/sponsorship', excerpt: 'Verified employer sponsorship history.', checkedAt: now.toISOString(), employerName: 'Example', scope: 'employer', entityMatch: true }], score: 80, fitReasons: [], concerns: [], eligible: true, eligibilityReasons: [], questions: [{ id: 'name', label: 'Full name', required: true, type: 'text' }, { id: 'resume', label: 'Resume', required: true, type: 'file' }], formInspectedAt: now.toISOString(), formVersion: null, dismissed: false };
}
async function fixture(t: any) {
 const dir = await mkdtemp(path.join(tmpdir(), 'career-resume-'));
 const original = path.join(dir, 'old.pdf'); const source = path.join(dir, 'New Resume.pdf');
 await writeFile(original, '%PDF-1.4 original unchanged résumé'); await writeFile(source, '%PDF-1.4 replacement unchanged résumé');
 const seed = await createTestSeed({ resumePath: original, originalPath: original });
 const store = await createStore({ backend: 'sqlite', dataDir: dir, seed });
 const rt = { store, engine: createEngine(store, { now: () => now }) };
 t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
 const prepare = async (id: string) => { await rt.engine.upsertJob(job(id)); return rt.engine.prepare(id); };
 return { dir, original, source, rt, prepare };
}

test('explicit résumé replacement preserves files and history while revoking and revising editable packets', async t => {
 const f = await fixture(t); const submitted = await f.prepare('submitted');
 await f.rt.engine.approve([submitted.id]); const attempt = await f.rt.engine.beginSubmission(submitted.id);
 await f.rt.engine.finishSubmission(attempt.id, 'submitted', 'Employer confirmed receipt of this application.');
 const pending = await f.prepare('pending'); await f.rt.engine.approve([pending.id]);
 const before = await f.rt.store.read(); const originalBytes = await readFile(f.original); const sourceBytes = await readFile(f.source);
 const result = await registerResume(f.rt, f.dir, f.source); const after = await f.rt.store.read();
 assert.equal(result.changed, true); assert.deepEqual(result.updatedPacketIds, [pending.id]);
 assert.equal(result.resume.path, path.join(f.dir, 'artifacts', 'resumes', `resume-${hash(sourceBytes)}.pdf`));
 assert.equal(result.resume.originalPath, f.source); assert.equal(result.resume.filename, 'New Resume.pdf');
 assert.deepEqual(verifiedResumeBytes(result.resume), sourceBytes); assert.deepEqual(await readFile(f.source), sourceBytes);
 assert.deepEqual(await readFile(f.original), originalBytes); assert.equal((await stat(result.resume.path)).mode & 0o777, 0o600);
 assert.equal((await stat(path.dirname(result.resume.path))).mode & 0o777, 0o700);
 assert.deepEqual(result.previousResume, before.profile.resume);
 assert.deepEqual(after.profile, { ...before.profile, resume: result.resume });
 const previousPending = before.packets.find(p => p.id === pending.id)!; const revised = after.packets.find(p => p.id === pending.id)!;
 assert.equal(revised.version, previousPending.version + 1); assert.equal(revised.resumeHash, result.resume.sha256);
 assert.notEqual(revised.contentHash, previousPending.contentHash); assert.equal(revised.approvalId, null); assert.equal(revised.status, 'ready');
 assert.deepEqual(revised.answers, previousPending.answers); assert.deepEqual(after.preparationLedger, before.preparationLedger);
 assert.deepEqual(after.attempts, before.attempts); assert.deepEqual(after.packets.find(p => p.id === submitted.id), before.packets.find(p => p.id === submitted.id));
 assert.equal(after.approvals.find(a => a.packetId === pending.id)!.revokedAt, now.toISOString());
 await assert.rejects(f.rt.engine.beginSubmission(pending.id), /current approval/);
 await f.rt.engine.approve([pending.id]); await f.rt.engine.beginSubmission(pending.id);
});

test('registering identical résumé bytes is idempotent and profile updates cannot replace the résumé', async t => {
 const f = await fixture(t); const pending = await f.prepare('pending');
 await registerResume(f.rt, f.dir, f.source); await f.rt.engine.approve([pending.id]);
 const before = await f.rt.store.read();
 const result = await registerResume(f.rt, f.dir, f.source);
 assert.equal(result.changed, false); assert.deepEqual(result.updatedPacketIds, []); assert.deepEqual(await f.rt.store.read(), before);
 await assert.rejects(f.rt.engine.updateProfile({ resume: { ...before.profile.resume, path: f.original } }), /locked/);
 assert.deepEqual(await f.rt.store.read(), before);
});

for (const outcome of ['in_progress', 'unknown'] as const) {
 test(`résumé replacement rejects ${outcome} submissions without changing stored state`, async t => {
  const f = await fixture(t); const packet = await f.prepare('pending'); await f.rt.engine.approve([packet.id]);
  const attempt = await f.rt.engine.beginSubmission(packet.id);
  if (outcome === 'unknown') await f.rt.engine.finishSubmission(attempt.id, 'unknown', 'Browser connection interrupted after submit.');
  const before = await f.rt.store.read();
  await assert.rejects(registerResume(f.rt, f.dir, f.source), /reconcile unresolved submissions/);
  assert.deepEqual(await f.rt.store.read(), before); assert.deepEqual(await readFile(f.original), Buffer.from('%PDF-1.4 original unchanged résumé'));
 });
}

test('invalid PDFs, symlinks, oversized files and corrupt cached copies never become the active résumé', async t => {
 const f = await fixture(t); const before = await f.rt.store.read(); const file = path.join(f.dir, 'invalid.pdf');
 for (const bytes of ['', 'Not a PDF', '%PDFX invalid header']) {
  await writeFile(file, bytes); await assert.rejects(registerResume(f.rt, f.dir, file), /PDF/);
 }
 await writeFile(file, '%PDF-1.4 oversized'); await truncate(file, 20 * 1024 * 1024 + 1);
 await assert.rejects(registerResume(f.rt, f.dir, file), /20 MB/);
 const linked = path.join(f.dir, 'linked.pdf'); await symlink(f.source, linked);
 await assert.rejects(registerResume(f.rt, f.dir, linked));
 const target = path.join(f.dir, 'artifacts', 'resumes', `resume-${hash(await readFile(f.source))}.pdf`);
 await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, '%PDF-1.4 corrupt existing content-addressed copy');
 await assert.rejects(registerResume(f.rt, f.dir, f.source), /SHA256/);
 assert.equal(await readFile(target, 'utf8'), '%PDF-1.4 corrupt existing content-addressed copy');
 assert.deepEqual(await f.rt.store.read(), before);
});

test('atomic résumé replacement detects concurrent changes and independently verifies file hashes', async t => {
 const f = await fixture(t); const oldHash = (await f.rt.store.read()).profile.resume.sha256;
 const result = await registerResume(f.rt, f.dir, f.source); const before = await f.rt.store.read();
 await assert.rejects(f.rt.engine.replaceResume(result.previousResume, oldHash), /changed during replacement/);
 await assert.rejects(f.rt.engine.replaceResume({ ...result.resume, sha256: '0'.repeat(64) }, result.resume.sha256), /matching its SHA256/);
 await writeFile(result.resume.path, '%PDF-1.4 tampered copy');
 await assert.rejects(f.rt.engine.replaceResume(result.resume, result.resume.sha256), /matching its SHA256/);
 assert.deepEqual(await f.rt.store.read(), before);
});

test('resume-update CLI accepts a PDF path and preserves the selected version on restart', async t => {
 const dir = await mkdtemp(path.join(tmpdir(), 'career-resume-cli-')); t.after(() => rm(dir, { recursive: true, force: true }));
 const initial = path.join(dir, 'initial.pdf'); const replacement = path.join(dir, 'replacement.pdf'); const data = path.join(dir, 'data');
 await writeFile(initial, '%PDF-1.4 original CLI fixture'); await writeFile(replacement, '%PDF-1.4 new CLI fixture');
 const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'server/cli.ts', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, CAREER_DATA_DIR: data, CAREER_BACKEND: 'sqlite', CAREER_RESUME_PATH: initial }, encoding: 'utf8', timeout: 10_000 });
 const changed = run('resume-update', '--file', replacement); assert.equal(changed.status, 0, changed.stderr);
 const result = JSON.parse(changed.stdout); assert.equal(result.changed, true); assert.equal(result.resume.sha256, hash(await readFile(replacement)));
 const restarted = run('state'); assert.equal(restarted.status, 0, restarted.stderr);
 const state = JSON.parse(restarted.stdout); assert.deepEqual(state.profile.resume, result.resume); assert.equal(state.meta.resumeValid, true); assert.deepEqual(state.preparationLedger, []);
 assert.equal(await readFile(path.join(data, 'artifacts', 'resume.pdf'), 'utf8'), '%PDF-1.4 original CLI fixture');
 await rm(initial); await rm(replacement); await rm(path.join(data, 'artifacts', 'resume.pdf'));
 await writeFile(path.join(data, 'profile-seed.json'), 'invalid retired seed');
 const withoutBootstrap = run('state'); assert.equal(withoutBootstrap.status, 0, withoutBootstrap.stderr);
 const reopened = JSON.parse(withoutBootstrap.stdout); assert.deepEqual(reopened.profile, state.profile); assert.equal(reopened.meta.resumeValid, true);
 assert.deepEqual(reopened.preparationLedger, state.preparationLedger);
});

test('a full artifacts restore selects the current résumé over the retired bootstrap PDF', async t => {
 const f = await fixture(t); const pending = await f.prepare('pending');
 await registerResume(f.rt, f.dir, f.source); await f.rt.engine.approve([pending.id]);
 const before = await f.rt.store.read(); const backup = path.join(f.dir, 'replacement-backup.json'); await writeFile(backup, JSON.stringify(before));
 const target = path.join(f.dir, 'restored'); const restored = path.join(target, 'artifacts', 'resumes', `resume-${before.profile.resume.sha256}.pdf`);
 await mkdir(path.dirname(restored), { recursive: true }); await writeFile(restored, await readFile(before.profile.resume.path));
 const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'server/cli.ts', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, CAREER_DATA_DIR: target, CAREER_BACKEND: 'sqlite', CAREER_RESUME_PATH: f.original }, encoding: 'utf8', timeout: 10_000 });
 const imported = run('import-backup', backup); assert.equal(imported.status, 0, imported.stderr); assert.equal(JSON.parse(imported.stdout).imported, true);
 const read = run('state'); assert.equal(read.status, 0, read.stderr); const state = JSON.parse(read.stdout);
 assert.deepEqual(state.profile, { ...before.profile, resume: { ...before.profile.resume, path: restored } }); assert.equal(state.meta.resumeValid, true);
 assert.deepEqual(state.jobs, before.jobs); assert.deepEqual(state.preparationLedger, before.preparationLedger); assert.deepEqual(state.attempts, before.attempts);
 assert.equal(state.packets[0].resumeHash, before.profile.resume.sha256); assert.equal(state.packets[0].approvalId, null); assert.ok(state.approvals[0].revokedAt);
 assert.equal(await readFile(path.join(target, 'artifacts', 'resume.pdf'), 'utf8'), await readFile(f.original, 'utf8'));
 assert.deepEqual(await readFile(before.profile.resume.path), await readFile(restored)); assert.equal(await readFile(backup, 'utf8'), JSON.stringify(before));
});

for (const kind of ['corrupt', 'symlink'] as const) {
 test(`backup import refuses a ${kind} content-addressed résumé instead of falling back to a matching legacy PDF`, async t => {
  const f = await fixture(t); const before = await f.rt.store.read(); const backup = path.join(f.dir, 'backup.json'); await writeFile(backup, JSON.stringify(before));
  const target = path.join(f.dir, 'restored'); const restored = path.join(target, 'artifacts', 'resumes', `resume-${before.profile.resume.sha256}.pdf`);
  await mkdir(path.dirname(restored), { recursive: true });
  if (kind === 'corrupt') await writeFile(restored, '%PDF-1.4 different bytes'); else await symlink(f.original, restored);
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'server/cli.ts', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, CAREER_DATA_DIR: target, CAREER_BACKEND: 'sqlite', CAREER_RESUME_PATH: f.original }, encoding: 'utf8', timeout: 10_000 });
  const imported = run('import-backup', backup); assert.notEqual(imported.status, 0); assert.match(imported.stderr, /résumé hash does not match/);
  const read = run('state'); assert.equal(read.status, 0, read.stderr); const state = JSON.parse(read.stdout);
  assert.equal(state.profile.name, ''); assert.deepEqual(state.packets, []); assert.deepEqual(state.preparationLedger, []);
 });
}

test('existing Supabase state opens without reading a retired résumé seed', async t => {
 const f = await fixture(t); await registerResume(f.rt, f.dir, f.source);
 const state = await f.rt.store.read(); state.settings.backend = 'supabase';
 const previousFetch = globalThis.fetch; let seedCalls = 0;
 globalThis.fetch = async () => new Response(JSON.stringify({ revision: 4, payload: state }), { headers: { 'Content-Type': 'application/json' } });
 t.after(() => { globalThis.fetch = previousFetch; });
 const store = await createStore({ backend: 'supabase', dataDir: f.dir, supabaseUrl: 'https://store.example.test', supabaseServiceKey: 'fixture-only-key', seed: async () => { seedCalls++; throw new Error('Retired bootstrap résumé is missing'); } });
 assert.deepEqual(await store.read(), state); assert.equal(seedCalls, 0); await store.close();
});
