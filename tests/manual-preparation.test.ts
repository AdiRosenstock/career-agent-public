import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createEngine } from '../server/engine.js';
import { createStore, decodeSupabaseState, encodeSupabaseState, validateAppState, type Store } from '../server/store.js';
import { createTestSeed } from './fixtures.js';
import type { AppState, Job } from '../shared/types.js';

const work = await mkdtemp(path.join(tmpdir(), 'career-manual-preparation-'));
const previousDirectory = process.env.CAREER_DATA_DIR; const previousBackend = process.env.CAREER_BACKEND;
process.env.CAREER_DATA_DIR = work; process.env.CAREER_BACKEND = 'sqlite';
const { runDiscovery } = await import('../server/runtime.js');
after(async () => {
 if (previousDirectory === undefined) delete process.env.CAREER_DATA_DIR; else process.env.CAREER_DATA_DIR = previousDirectory;
 if (previousBackend === undefined) delete process.env.CAREER_BACKEND; else process.env.CAREER_BACKEND = previousBackend;
 await rm(work, { recursive: true, force: true });
});
const initialNow = new Date('2026-09-28T15:00:00.000Z');
const reason = 'User explicitly requested 50 applications to review in this manual batch.';
function job(id: string): Job {
 return { id, source: 'greenhouse', board: 'manualfixture', postingId: id, company: 'Example', title: `Data Analyst 2027 ${id}`, location: 'Chicago, IL, United States', description: 'Full-time graduate Data Analyst position starting in 2027.', sourceUrl: `https://example.test/jobs/${id}`, applyUrl: `https://job-boards.greenhouse.io/manualfixture/jobs/${id}`, fetchedAt: initialNow.toISOString(), postedAt: null, deadline: null, status: 'open', roleFamily: 'data', sponsorship: [{ id: 'sponsor', status: 'history_only', sourceUrl: 'https://example.test/sponsorship', excerpt: 'Verified employer sponsorship history.', checkedAt: initialNow.toISOString(), employerName: 'Example', scope: 'employer', entityMatch: true }], score: 80, fitReasons: [], concerns: [], eligible: true, eligibilityReasons: [], questions: [], formInspectedAt: null, formVersion: null, dismissed: false };
}
async function fixture(t: any) {
 const dir = await mkdtemp(path.join(work, 'fixture-')); const resume = path.join(dir, 'resume.pdf');
 await writeFile(resume, '%PDF-1.4 private fixture only'); const seed = await createTestSeed({ resumePath: resume, originalPath: resume });
 const store = await createStore({ backend: 'sqlite', dataDir: dir, seed }); const stores: Store[] = [store]; let current = initialNow;
 const engine = createEngine(store, { now: () => current });
 t.after(async () => { for (const value of stores) await value.close(); });
 for (let index = 0; index < 55; index++) await engine.upsertJob(job(String(index)));
 return { dir, resume, seed, store, engine, stores, setNow: (date: Date) => { current = date; } };
}

test('manual allowance requires explicit use, survives retries/restarts, and caps concurrent preparation at 50', async t => {
 const f = await fixture(t);
 for (let index = 0; index < 20; index++) await f.engine.prepare(String(index));
 await assert.rejects(f.engine.prepare('20'), /Daily preparation limit/);
 const allowance = await f.engine.grantManualPreparationAllowance({ limit: 50, reason });
 await assert.rejects(f.engine.grantManualPreparationAllowance({ limit: 51, reason }), /21 to 50/);
 await assert.rejects(f.engine.grantManualPreparationAllowance({ limit: 50, reason: '' }), /explicit user request/);
 assert.deepEqual(await f.engine.grantManualPreparationAllowance({ limit: 50, reason }), allowance);
 assert.equal((await f.store.read()).manualPreparationAllowances?.length, 1);
 await assert.rejects(f.engine.prepare('20'), /Daily preparation limit/);
 await assert.rejects(f.engine.prepare('20', {}, { manualAllowanceId: 'unknown' }), /explicit allowance/);
 for (let index = 20; index < 49; index++) await f.engine.prepare(String(index), {}, { manualAllowanceId: allowance.id });
 const second = await createStore({ backend: 'sqlite', dataDir: f.dir, seed: f.seed }); f.stores.push(second);
 const restarted = createEngine(second, { now: () => initialNow });
 const outcomes = await Promise.allSettled([f.engine.prepare('49', {}, { manualAllowanceId: allowance.id }), restarted.prepare('50', {}, { manualAllowanceId: allowance.id })]);
 assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1); assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1);
 await assert.rejects(restarted.prepare('51', {}, { manualAllowanceId: allowance.id }), /allowance limit/);
 const beforeRetry = await f.store.read(); const previous = beforeRetry.packets.find(packet => packet.jobId === '20')!;
 assert.equal((await restarted.prepare('20', {}, { manualAllowanceId: allowance.id })).id, previous.id);
 await restarted.editPacket(previous.id, { notes: 'Reviewable draft updated without consuming another preparation.' });
 const state = await second.read(); assert.deepEqual(state.preparationLedger, beforeRetry.preparationLedger); assert.equal(state.preparationLedger.length, 50);
 assert.equal(state.preparationLedger.filter(entry => entry.manualAllowanceId === allowance.id).length, 30); assert.equal(state.settings.dailyLimit, 20);
 const snapshot = await restarted.snapshot(); assert.equal(snapshot.meta.remainingToday, 0); assert.equal(snapshot.meta.manualRemainingToday, 0); assert.equal(snapshot.meta.manualLimitToday, 50);
 await assert.rejects(f.engine.updateSettings({ dailyLimit: 50 }), /between 1 and 20/);
});

test('allowances expire on the Chicago date boundary and cannot bypass ordinary job checks', async t => {
 const f = await fixture(t); f.setNow(new Date('2026-09-29T04:59:59.000Z'));
 const allowance = await f.engine.grantManualPreparationAllowance({ limit: 50, reason }); assert.equal(allowance.day, '2026-09-28');
 const blocked = { ...job('closed'), status: 'closed' as const }; await f.engine.upsertJob(blocked);
 await assert.rejects(f.engine.prepare('closed', {}, { manualAllowanceId: allowance.id }), /not eligible/);
 await f.engine.prepare('0', {}, { manualAllowanceId: allowance.id });
 f.setNow(new Date('2026-09-29T05:00:00.000Z'));
 await assert.rejects(f.engine.prepare('1', {}, { manualAllowanceId: allowance.id }), /explicit allowance for today/);
 await f.engine.prepare('1'); const state = await f.store.read();
 assert.deepEqual(state.preparationLedger.map(entry => entry.day), ['2026-09-28', '2026-09-29']); assert.equal(state.preparationLedger[1].manualAllowanceId, undefined);
 const snapshot = await f.engine.snapshot(); assert.equal(snapshot.meta.manualLimitToday, 20); assert.equal(snapshot.meta.remainingToday, 19);
 const next = await f.engine.grantManualPreparationAllowance({ limit: 50, reason }); assert.notEqual(next.id, allowance.id); assert.equal(next.day, '2026-09-29');
 f.setNow(new Date('2026-11-01T06:59:59.000Z')); const beforeFallback = await f.engine.grantManualPreparationAllowance({ limit: 50, reason });
 f.setNow(new Date('2026-11-01T07:00:00.000Z')); const afterFallback = await f.engine.grantManualPreparationAllowance({ limit: 50, reason });
 assert.equal(beforeFallback.day, '2026-11-01'); assert.equal(afterFallback.id, beforeFallback.id, 'The repeated DST hour does not create a new allowance day');
});

test('scheduled discovery cannot use a manual allowance after the ordinary daily cap', async t => {
 const f = await fixture(t); const allowance = await f.engine.grantManualPreparationAllowance({ limit: 50, reason });
 for (let index = 0; index < 20; index++) await f.engine.prepare(String(index));
 await f.engine.prepare('20', {}, { manualAllowanceId: allowance.id });
 await f.engine.upsertBoard({ id: 'greenhouse:manualfixture', company: 'Example', source: 'greenhouse', token: 'manualfixture', enabled: true, sponsorship: job('0').sponsorship });
 // runDiscovery uses today's actual Chicago date; keep all fixture entries and
 // the allowance on that same day while preserving their authorization ordering.
 const today = new Date(); const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
 await f.store.update(state => { state.manualPreparationAllowances![0].day = day; state.manualPreparationAllowances![0].authorizedAt = today.toISOString(); for (const entry of state.preparationLedger) entry.day = day; for (const packet of state.packets) packet.createdAt = today.toISOString(); });
 const previousFetch = globalThis.fetch;
 globalThis.fetch = async () => new Response(JSON.stringify({ jobs: Array.from({ length: 55 }, (_, index) => ({ id: String(index), title: `Data Analyst 2027 ${index}`, content: job(String(index)).description, location: { name: 'Chicago, IL, United States' }, absolute_url: job(String(index)).applyUrl })) }), { headers: { 'Content-Type': 'application/json' } });
 t.after(() => { globalThis.fetch = previousFetch; });
 const before = await f.store.read(); const run = await runDiscovery({ store: f.store, engine: f.engine }, { prepare: true });
 const after = await f.store.read(); assert.equal(run.prepared, 0); assert.deepEqual(after.preparationLedger, before.preparationLedger); assert.equal(after.packets.length, 21); assert.equal(after.settings.dailyLimit, 20);
});

test('state validation preserves legacy backups and rejects unaudited excess or invalid allowance references', async t => {
 const f = await fixture(t); const legacy = await f.store.read(); delete legacy.manualPreparationAllowances;
 assert.deepEqual(validateAppState(legacy).manualPreparationAllowances, []);
 const allowance = await f.engine.grantManualPreparationAllowance({ limit: 50, reason });
 for (let index = 0; index < 21; index++) await f.engine.prepare(String(index), {}, { manualAllowanceId: allowance.id });
 const state = await f.store.read(); assert.deepEqual(decodeSupabaseState(encodeSupabaseState(state, f.dir), f.dir), state);
 const noAudit = structuredClone(state); noAudit.preparationLedger.forEach(entry => { delete entry.manualAllowanceId; });
 assert.throws(() => validateAppState(noAudit), /Daily preparation cap/);
 const missing = structuredClone(state); missing.manualPreparationAllowances = []; assert.throws(() => validateAppState(missing), /invalid manual allowance/);
 const wrongDay = structuredClone(state); wrongDay.manualPreparationAllowances![0].day = '2026-09-29'; assert.throws(() => validateAppState(wrongDay), /Chicago calendar day/);
 const broadSetting = structuredClone(state); broadSetting.settings.dailyLimit = 50; assert.throws(() => validateAppState(broadSetting));
 const excessive = structuredClone(state); excessive.manualPreparationAllowances![0].limit = 51; assert.throws(() => validateAppState(excessive));
});

test('CLI records allowances and export/import roundtrips their ledger audit without granting submission approval', async t => {
 const f = await fixture(t); const allowance = await f.engine.grantManualPreparationAllowance({ limit: 50, reason });
 for (let index = 0; index < 21; index++) await f.engine.prepare(String(index), {}, { manualAllowanceId: allowance.id });
 const cli = (directory: string, ...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'server/cli.ts', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, CAREER_DATA_DIR: directory, CAREER_BACKEND: 'sqlite', CAREER_RESUME_PATH: f.resume }, encoding: 'utf8', timeout: 10_000 });
 const created = cli(f.dir, 'preparation-allowance', '--limit', '50', '--reason', reason); assert.equal(created.status, 0, created.stderr);
 const currentAllowance = JSON.parse(created.stdout);
 const prepared = cli(f.dir, 'prepare', '21', '--allowance', currentAllowance.id); assert.equal(prepared.status, 0, prepared.stderr);
 const backup = path.join(f.dir, 'backup.json'); const exported = cli(f.dir, 'export', backup); assert.equal(exported.status, 0, exported.stderr);
 const exportedState: AppState = JSON.parse(await readFile(backup, 'utf8'));
 const target = path.join(f.dir, 'restored'); const imported = cli(target, 'import-backup', backup); assert.equal(imported.status, 0, imported.stderr);
 const read = cli(target, 'state'); assert.equal(read.status, 0, read.stderr); const restored = JSON.parse(read.stdout);
 assert.deepEqual(restored.manualPreparationAllowances, exportedState.manualPreparationAllowances); assert.deepEqual(restored.preparationLedger, exportedState.preparationLedger);
 assert.equal(restored.preparationLedger.at(-1).manualAllowanceId, currentAllowance.id);
 assert.deepEqual(restored.approvals, []); assert.deepEqual(restored.attempts, []); assert.equal(restored.settings.dailyLimit, 20); assert.equal(restored.packets.length, 22);
});
