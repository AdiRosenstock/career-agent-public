import test, { after, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createTestSeed } from './fixtures.js';
import { createEngine } from '../server/engine.js';
import { validateAppState, type Store } from '../server/store.js';
import { normalizeJob, assessJob } from '../server/discovery.js';
import type { AppState, Board, DailyRun, Job, SponsorshipEvidence } from '../shared/types.js';

// Runtime exports resolve their artifact directory during import. Never let a test
// backup touch the actual workspace or use the user's configured cloud backend.
const directory = await mkdtemp(path.join(tmpdir(), 'career-runtime-test-'));
const previousDirectory = process.env.CAREER_DATA_DIR;
const previousBackend = process.env.CAREER_BACKEND;
process.env.CAREER_DATA_DIR = directory;
process.env.CAREER_BACKEND = 'sqlite';
const { runDiscovery, refreshJob, preserveLocal, dayKey } = await import('../server/runtime.js');
const resumePath = path.join(directory, 'resume.pdf');
await writeFile(resumePath, '%PDF-1.4 runtime test fixture only');
after(async () => {
  if (previousDirectory === undefined) delete process.env.CAREER_DATA_DIR;
  else process.env.CAREER_DATA_DIR = previousDirectory;
  if (previousBackend === undefined) delete process.env.CAREER_BACKEND;
  else process.env.CAREER_BACKEND = previousBackend;
  await rm(directory, { recursive: true, force: true });
});

const company = 'Runtime Example';
const originalText = 'Graduate full-time Product Manager position for 2027.';
const applicationUrl = 'https://job-boards.greenhouse.io/runtimefixture/jobs/123';
function sourcedEvidence(patch: Partial<SponsorshipEvidence> = {}): SponsorshipEvidence {
  return { id: 'reviewed-role', status: 'explicit_yes', sourceUrl: applicationUrl,
    excerpt: 'Visa sponsorship is available for this role.', checkedAt: new Date().toISOString(),
    employerName: company, scope: 'role', entityMatch: true, ...patch };
}
function fixtureJob(patch: Partial<Job> = {}): Job {
  return normalizeJob({ source: 'greenhouse', board: 'runtimefixture', postingId: '123', company,
    title: 'Associate Product Manager 2027', description: originalText,
    sourceUrl: applicationUrl, applyUrl: applicationUrl, location: 'Chicago, IL', status: 'open',
    sponsorship: [sourcedEvidence()], ...patch });
}
const fixtureBoard = (): Board => ({ id: 'greenhouse:runtimefixture', company, source: 'greenhouse', token: 'runtimefixture', enabled: true, sponsorship: [] });
async function fixture(boards: Board[] = []) {
  let state: AppState = await createTestSeed({ resumePath, originalPath: resumePath });
  state.boards = boards;
  const store: Store = {
    read: async () => structuredClone(state),
    update: async <T>(fn: (state: AppState) => T): Promise<T> => {
      const draft = structuredClone(state);
      const result = fn(draft);
      state = validateAppState(draft);
      return structuredClone(result);
    },
    close: () => undefined,
  };
  return { store, engine: createEngine(store, { workspace: directory }) };
}
function mockBoard(t: TestContext, rows = [{ id: 123, title: 'Associate Product Manager 2027', content: originalText, location: { name: 'Chicago, IL' }, absolute_url: applicationUrl }]) {
  const previous = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    assert.match(url, /^https:\/\/boards-api\.greenhouse\.io\/v1\/boards\/runtimefixture\/jobs\?content=true$/);
    return new Response(JSON.stringify({ jobs: rows }), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = previous; });
  return requested;
}

test('preserveLocal retains dismissal and sourced evidence but refreshes derived evidence', () => {
  const history = sourcedEvidence({ id: 'reviewed-history', scope: 'employer', status: 'history_only', excerpt: 'Reviewed employer sponsorship record.' });
  const old = fixtureJob({ dismissed: true, sponsorship: [sourcedEvidence(), history], description: 'Visa sponsorship is available.' });
  const incoming = fixtureJob({ description: old.description, sponsorship: [] });
  const result = preserveLocal(incoming, old);
  assert.equal(result.dismissed, true);
  assert.ok(result.sponsorship.some(e => e.id === 'reviewed-role'));
  assert.ok(result.sponsorship.some(e => e.id === 'reviewed-history'));
  assert.equal(result.sponsorship.filter(e => e.id.startsWith('text-')).length, 1);
  const changed = preserveLocal(fixtureJob({ sponsorship: [], description: 'Changed duties and requirements.' }), old);
  assert.equal(changed.dismissed, true);
  assert.deepEqual(changed.sponsorship.map(e => e.id), ['reviewed-history']);
  const changedUrl = preserveLocal(fixtureJob({ sponsorship: [], description: old.description, applyUrl: `${applicationUrl}/new` }), old);
  assert.equal(changedUrl.sponsorship.some(e => e.id === 'reviewed-role'), false);
});

test('new same-ID board restriction overrides previously stored sponsorship history', () => {
 const history = sourcedEvidence({ id: 'board-policy', scope: 'employer', status: 'history_only', excerpt: 'Reviewed employer sponsorship record.' });
 const old = fixtureJob({ sponsorship: [history] });
 assert.equal(old.eligible, true);
 const restriction = { ...history, status: 'explicit_no' as const, excerpt: 'We do not sponsor employment visas for this role.' };
 const incoming = fixtureJob({ sponsorship: [restriction] });
 const merged = assessJob(preserveLocal(incoming, old));
 assert.equal(merged.sponsorship.filter(e => e.id === 'board-policy').length, 1);
 assert.equal(merged.sponsorship.find(e => e.id === 'board-policy')?.status, 'explicit_no');
 assert.equal(merged.eligible, false);
 assert.ok(merged.eligibilityReasons.some(reason => /excludes.*sponsorship/i.test(reason)));
 assert.equal(old.sponsorship[0].status, 'history_only', 'The original snapshot remains unchanged');
});

test('discovery refreshes a tracked posting that no longer matches the early-career candidate filter', async t => {
 mockBoard(t, [{ id: 123, title: 'Chief Customer Officer', content: 'Executive leadership position requiring extensive experience.', location: { name: 'Chicago, IL' }, absolute_url: applicationUrl }]);
 const rt = await fixture([fixtureBoard()]);
 const old = await rt.engine.upsertJob(fixtureJob({ questions: [{ id: 'resume', label: 'Resume', required: true, type: 'input_file' }], formInspectedAt: new Date().toISOString() }));
 const packet = await rt.engine.prepare(old.id); const approval = await rt.engine.approve([packet.id]);
 await runDiscovery(rt);
 const state = await rt.store.read(); const current = state.jobs.find(job => job.id === old.id)!;
 assert.equal(current.title, 'Chief Customer Officer');
 assert.equal(current.status, 'open', 'Posting is present in the feed, so it must not be marked closed');
 assert.equal(current.eligible, false);
 assert.ok(current.eligibilityReasons.some(reason => /outside.*career tracks/i.test(reason)));
 assert.equal(state.packets[0].status, 'needs_input');
 assert.notEqual(state.approvals.find(a => a.batchId === approval.batchId)?.revokedAt, null);
 assert.equal(state.preparationLedger.length, 1, 'Refreshing an unsuitable job does not erase its preparation history');
});

test('discovery never reactivates or prepares a dismissed role', async t => {
  const requests = mockBoard(t);
  const rt = await fixture([fixtureBoard()]);
  const original = await rt.engine.upsertJob(fixtureJob({ dismissed: true }));
  const run = await runDiscovery(rt, { prepare: true });
  const state = await rt.store.read();
  assert.equal(run.status, 'complete');
  assert.equal(run.discovered, 1);
  assert.equal(state.jobs.find(j => j.id === original.id)?.dismissed, true);
  assert.equal(state.jobs[0].sponsorship.some(e => e.id === 'reviewed-role'), true);
  assert.equal(state.packets.length, 0);
  assert.equal(state.preparationLedger.length, 0);
  assert.equal(requests.length, 1);
});

test('unchanged discovery and explicit refresh preserve approved packet and non-feed role evidence', async t => {
  mockBoard(t);
  const rt = await fixture([fixtureBoard()]);
  const questions = [{ id: 'resume', label: 'Resume', required: true, type: 'input_file' }];
  const old = await rt.engine.upsertJob(fixtureJob({ questions, formInspectedAt: new Date().toISOString() }));
  const packet = await rt.engine.prepare(old.id);
  const approval = await rt.engine.approve([packet.id]);
  await runDiscovery(rt);
  let state = await rt.store.read();
  assert.equal(state.packets[0].status, 'approved');
  assert.equal(state.approvals.find(a => a.batchId === approval.batchId)?.revokedAt, null);
  await refreshJob(rt, old.id);
  state = await rt.store.read();
  assert.equal(state.packets[0].status, 'approved');
  assert.equal(state.jobs[0].eligible, true);
  assert.ok(state.jobs[0].sponsorship.some(e => e.id === 'reviewed-role'));
  assert.deepEqual(state.jobs[0].questions, questions);
  assert.equal(state.preparationLedger.length, 1);
});

test('manual-to-ATS dedup keeps its local ID and is not falsely closed by later feeds', async t => {
  mockBoard(t);
  const rt = await fixture([fixtureBoard()]);
  const original = await rt.engine.upsertJob(fixtureJob({ source: 'manual', board: '', postingId: '' }));
  const incoming = fixtureJob();
  assert.notEqual(original.id, incoming.id);
  await runDiscovery(rt);
  let state = await rt.store.read();
  assert.equal(state.jobs.length, 1);
  assert.equal(state.jobs[0].id, original.id);
  assert.equal(state.jobs[0].source, 'greenhouse');
  assert.equal(state.jobs[0].postingId, '123');
  await runDiscovery(rt);
  state = await rt.store.read();
  assert.equal(state.jobs[0].status, 'open');
  assert.equal(state.jobs[0].id, original.id);
});

test('initial storage failure releases discovery lock and permits a later run', async () => {
  const rt = await fixture();
  const originalUpdate = rt.store.update;
  rt.store.update = async () => { throw new Error('Simulated initial storage failure'); };
  await assert.rejects(runDiscovery(rt), /initial storage failure/);
  rt.store.update = originalUpdate;
  const next = await runDiscovery(rt);
  assert.equal(next.status, 'failed');
  assert.match(next.errors[0], /Enable at least one employer board/);
  assert.equal((await rt.store.read()).runs.length, 1);
});

test('final storage failure releases process lock; persistent interrupted lease is recoverable', async () => {
  const rt = await fixture();
  const originalUpdateRun = rt.engine.updateRun;
  rt.engine.updateRun = async () => { throw new Error('Simulated final storage failure'); };
  await assert.rejects(runDiscovery(rt), /final storage failure/);
  rt.engine.updateRun = originalUpdateRun;
  // Final write failed: persisted lease must still prevent a concurrent retry.
  await assert.rejects(runDiscovery(rt), /already active/);
  await rt.store.update(s => { s.runs[0].startedAt = new Date(Date.now() - 31 * 60_000).toISOString(); });
  const next = await runDiscovery(rt);
  const state = await rt.store.read();
  assert.equal(next.status, 'failed');
  assert.equal(state.runs.length, 2);
  assert.equal(state.runs[0].status, 'failed');
  assert.match(state.runs[0].errors.at(-1) || '', /lease expired/);
});

test('active persisted runs block a second worker without leaving an extra run or sticky process lock', async () => {
  const rt = await fixture();
  const run: DailyRun = { id: 'another-worker', day: dayKey(), startedAt: new Date().toISOString(), finishedAt: null, status: 'running', discovered: 0, prepared: 0, errors: [] };
  await rt.engine.updateRun(run);
  await assert.rejects(runDiscovery(rt), /already active/);
  assert.equal((await rt.store.read()).runs.length, 1);
  await rt.engine.updateRun({ ...run, status: 'complete', finishedAt: new Date().toISOString() });
  assert.equal((await runDiscovery(rt)).status, 'failed');
  assert.equal((await rt.store.read()).runs.length, 2);
});

test('invalid backend configuration fails before any local database initialization', () => {
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'server/cli.ts', 'state'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, CAREER_BACKEND: 'supabsae', CAREER_DATA_DIR: path.join(directory, 'must-not-initialize') },
    encoding: 'utf8', timeout: 10_000,
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /CAREER_BACKEND must be sqlite or supabase/);
  assert.equal(existsSync(path.join(directory, 'must-not-initialize')), false);
});

function runCli(args: string[], dataDirectory: string, source = resumePath) {
 return spawnSync(process.execPath, ['--import', 'tsx', 'server/cli.ts', ...args], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, CAREER_BACKEND: 'sqlite', CAREER_DATA_DIR: dataDirectory, CAREER_RESUME_PATH: source },
  encoding: 'utf8', timeout: 10_000,
 });
}

test('backup import remaps the matching résumé to its new local directory and revokes pending approvals', async () => {
 const rt = await fixture(); const oldResume = path.join(directory, 'retired-resume.pdf');
 await writeFile(oldResume, '%PDF-1.4 runtime test fixture only');
 await rt.store.update(s => { s.profile.resume.path = oldResume; s.profile.resume.originalPath = oldResume; });
 const old = await rt.engine.upsertJob(fixtureJob({ questions: [{ id: 'resume', label: 'Resume', required: true, type: 'input_file' }], formInspectedAt: new Date().toISOString() }));
 const packet = await rt.engine.prepare(old.id); await rt.engine.approve([packet.id]);
 const backup = path.join(directory, 'migration-backup.json'); await writeFile(backup, JSON.stringify(await rt.store.read()));
 const target = path.join(directory, 'migrated');
 const imported = runCli(['import-backup', backup], target);
 assert.equal(imported.status, 0, imported.stderr); assert.equal(JSON.parse(imported.stdout).imported, true);
 await rm(oldResume);
 const read = runCli(['state'], target); assert.equal(read.status, 0, read.stderr);
 const state = JSON.parse(read.stdout);
 assert.equal(state.profile.resume.path, path.join(target, 'artifacts', 'resume.pdf'));
 assert.equal(state.profile.resume.originalPath, oldResume, 'Original source path remains provenance');
 assert.equal(state.meta.resumeValid, true, 'Removing the old directory cannot break the imported local snapshot');
 assert.equal(state.packets[0].status, 'ready'); assert.equal(state.packets[0].approvalId, null);
 assert.ok(state.approvals[0].revokedAt); assert.equal(state.preparationLedger.length, 1);
 const attempt = runCli(['begin', packet.id], target); assert.notEqual(attempt.status, 0); assert.match(attempt.stderr, /current approval/);
});

test('backup import refuses a mismatched target résumé without importing any records', async () => {
 const rt = await fixture(); await rt.engine.upsertJob(fixtureJob());
 const backup = path.join(directory, 'mismatch-backup.json'); await writeFile(backup, JSON.stringify(await rt.store.read()));
 const wrongResume = path.join(directory, 'wrong-resume.pdf'); await writeFile(wrongResume, '%PDF-1.4 different resume snapshot');
 const target = path.join(directory, 'mismatch-target');
 const imported = runCli(['import-backup', backup], target, wrongResume);
 assert.notEqual(imported.status, 0); assert.match(imported.stderr, /résumé hash does not match/);
 const read = runCli(['state'], target, wrongResume); assert.equal(read.status, 0, read.stderr);
 const state = JSON.parse(read.stdout); assert.equal(state.jobs.length, 0); assert.equal(state.packets.length, 0); assert.equal(state.attempts.length, 0);
});

test('feeds retain selected engineering and custom title matches without sponsorship evidence', async t => {
 mockBoard(t, [
  { id: 201, title: 'Mechanical Engineer — New Grad 2027', content: 'Graduate full-time 2027 role. No visa sponsorship.', location: { name: 'Chicago, IL' }, absolute_url: applicationUrl.replace('123', '201') },
  { id: 202, title: 'Graduate Science Teacher 2027', content: 'Graduate full-time 2027 role.', location: { name: 'Chicago, IL' }, absolute_url: applicationUrl.replace('123', '202') },
  { id: 203, title: 'New Graduate Software Engineer 2027', content: 'Graduate full-time 2027 role.', location: { name: 'Chicago, IL' }, absolute_url: applicationUrl.replace('123', '203') },
 ]);
 const rt = await fixture([fixtureBoard()]);
 await rt.engine.updateSettings({ rolePriority: ['engineering'], roleKeywords: ['science teacher'] });
 await rt.engine.updateProfile({ authorizationAtStart: true, futureSponsorship: false, authorizationConfirmedAt: new Date().toISOString() });
 await runDiscovery(rt);
 const state = await rt.store.read();
 assert.deepEqual(state.jobs.map(job => job.roleFamily).sort(), ['engineering', 'other']);
 assert.ok(state.jobs.every(job => job.eligible));
});
