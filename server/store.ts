import Database from 'better-sqlite3';
import { roleFamilies } from '../shared/candidatePolicy.js';
import { mkdirSync, chmodSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { AppState, PriorApplication } from '../shared/types.js';
import { parseAtsJobUrl } from './discovery.js';

const text = z.string().max(1_000_000);
const id = z.string().min(1).max(300);
const nullable = text.nullable();
const role = z.enum(roleFamilies);
const source = z.enum(['greenhouse', 'lever', 'ashby']);
const evidence = z.object({ id, status: z.enum(['explicit_yes', 'history_only', 'unknown', 'explicit_no']), sourceUrl: text, excerpt: text, checkedAt: text, employerName: text, scope: z.enum(['role', 'employer']), entityMatch: z.boolean() }).strict();
const question = z.object({ id, label: text, required: z.boolean(), type: text, options: z.array(text).optional() }).strict();
const schema = z.object({
 schemaVersion: z.literal(1),
 profile: z.object({ name: text, email: text, phone: text, linkedin: text, github: text, graduation: text,
  facts: z.array(z.object({ id, label: text, value: text, source: text, confirmed: z.boolean() }).strict()),
  visaStatus: text, anticipatedOPT: z.boolean(), authorizationNow: z.boolean().nullable(), authorizationAtStart: z.boolean().nullable(), futureSponsorship: z.boolean().nullable(), usCitizen: z.boolean().nullable().optional(), exportControlEligible: z.boolean().nullable().optional(), clearanceEligible: z.boolean().nullable().optional(), authorizationConfirmedAt: nullable, earliestStart: nullable, salaryPreference: nullable,
  savedAnswers: z.array(z.object({ id, question: text, answer: text, confirmedAt: text }).strict()),
  resume: z.object({ path: text, sha256: z.string().regex(/^[a-f0-9]{64}$/), originalPath: text, filename: text }).strict(),
  documents: z.array(z.object({ id, kind: z.enum(['transcript', 'recommendation']), label: text, filename: text, path: text, originalPath: text, sha256: z.string().regex(/^[a-f0-9]{64}$/), addedAt: text, documentDate: nullable, notes: text }).strict()).optional().default([]),
 }).strict(),
 jobs: z.array(z.object({ id, source: z.enum(['greenhouse', 'lever', 'ashby', 'manual']), board: text, postingId: text, company: text, title: text, location: text, description: text, sourceUrl: text, applyUrl: text, fetchedAt: text, postedAt: nullable, deadline: nullable, status: z.enum(['open', 'closed', 'unknown']), roleFamily: role, sponsorship: z.array(evidence), score: z.number().finite(), fitReasons: z.array(text), concerns: z.array(text), eligible: z.boolean(), eligibilityReasons: z.array(text), questions: z.array(question), formInspectedAt: nullable, formVersion: nullable, dismissed: z.boolean() }).strict()),
 packets: z.array(z.object({ id, jobId: id, createdAt: text, updatedAt: text, version: z.number().int().positive(), status: z.enum(['draft', 'needs_input', 'ready', 'approved', 'submitting', 'submitted', 'failed', 'unknown', 'handoff']), resumeHash: text, formVersion: nullable, answers: z.array(z.object({ questionId: id, question: text, answer: text, factIds: z.array(id), confirmed: z.boolean() }).strict()), coverLetter: text, unresolved: z.array(text), notes: text, contentHash: text, approvalId: nullable, attachments: z.array(z.object({ questionId: id, documentId: id, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).optional().default([]) }).strict()),
 approvals: z.array(z.object({ id, batchId: id, packetId: id, packetHash: text, resumeHash: text, formVersion: text, approvedAt: text, revokedAt: nullable }).strict()),
 attempts: z.array(z.object({ id, packetId: id, jobId: id, batchId: id, startedAt: text, finishedAt: nullable, outcome: z.enum(['in_progress', 'submitted', 'failed', 'unknown', 'handoff']), evidence: text, confirmationUrl: nullable }).strict()),
 runs: z.array(z.object({ id, day: text, startedAt: text, finishedAt: nullable, status: z.enum(['running', 'complete', 'partial', 'failed']), discovered: z.number().int().nonnegative(), prepared: z.number().int().nonnegative(), errors: z.array(text) }).strict()),
 boards: z.array(z.object({ id, company: text, source, token: text, enabled: z.boolean(), sponsorship: z.array(evidence) }).strict()),
 settings: z.object({ careerStage:z.enum(['new_grad','early_career','experienced']).optional(), yearsExperience:z.number().min(0).max(60).nullable().optional(), careerTargetsConfirmed:z.boolean().optional(), preferredLocations:z.array(z.string().trim().min(1).max(200)).max(30).optional().default([]), workplacePreference:z.enum(['any','remote','hybrid','onsite']).optional().default('any'), dailyLimit: z.number().int().min(1).max(20), timezone: z.literal('America/Chicago'), scheduleTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), rolePriority: z.array(role), roleKeywords: z.array(z.string().trim().min(1).max(100)).max(30).optional(), backend: z.enum(['sqlite', 'supabase']), automationId: nullable, minimumAnnualCompensation: z.number().finite().nonnegative().max(10_000_000).nullable().optional().default(null), compensationBasis: z.enum(['base', 'total']).optional().default('base') }).strict(),
 preparationLedger: z.array(z.object({ packetId: id, jobId: id, day: text, manualAllowanceId: id.optional() }).strict()),
 manualPreparationAllowances: z.array(z.object({ id, day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), limit: z.number().int().min(21).max(50), reason: z.string().trim().min(10).max(5000), authorizedAt: z.string().datetime() }).strict()).optional().default([]),
 priorApplications: z.array(z.object({ id, company: z.string().min(1).max(1000), title: z.string().min(1).max(1000), jobUrl: nullable, postingId: nullable, source: z.enum(['email', 'linkedin', 'handshake', 'user']), sourceRef: z.string().min(1).max(10000), evidence: z.string().min(1).max(1_000_000), appliedAt: nullable, checkedAt: text, matchScope: z.enum(['exact_role', 'needs_review']).optional(), supersedesId: id.optional() }).strict()).optional().default([]),
}).strict();

export function validatePriorApplications(history: PriorApplication[]): void {
 const superseded = new Set<string>();
 const titleKey = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
 const companyKey = (value: string) => value.replace(/\b(incorporated|inc|corporation|corp|llc|ltd|limited|plc)\b[.,]?/gi, '').toLowerCase().replace(/[^a-z0-9]/g, '');
 for (const record of history) {
  if (!record.supersedesId) continue;
  if (record.supersedesId === record.id) throw new Error('Prior-application resolution cannot supersede itself');
  const original = history.find(item => item.id === record.supersedesId);
  if (!original) throw new Error('Prior-application resolution references missing history');
  if (original.matchScope !== 'needs_review') throw new Error('Only a needs_review prior application may be superseded');
  if (superseded.has(original.id)) throw new Error('Prior application has already been superseded');
  if (record.matchScope !== 'exact_role') throw new Error('Prior-application resolution requires exact_role scope');
  if (companyKey(original.company) !== companyKey(record.company) || titleKey(original.title) !== titleKey(record.title)) throw new Error('Prior-application resolution must retain the same employer and exact role title');
  if (!record.sourceRef?.trim() || !record.evidence?.trim() || !(record.postingId?.trim() || (record.jobUrl && parseAtsJobUrl(record.jobUrl)))) throw new Error('Prior-application resolution requires sourced requisition or ATS identity');
  // Resolutions are exact_role and may target only needs_review, so cycles and resolution chains are impossible.
  superseded.add(original.id);
 }
}

export function validateAppState(input: unknown): AppState {
 const s = schema.parse(input) as AppState;
 validatePriorApplications(s.priorApplications ?? []);
 for (const collection of [s.jobs, s.packets, s.approvals, s.attempts, s.runs, s.boards, s.profile.facts, s.profile.savedAnswers, s.profile.documents ?? [], s.priorApplications ?? [], s.manualPreparationAllowances ?? []]) {
  if (new Set(collection.map(x => x.id)).size !== collection.length) throw new Error('Duplicate record ID in state');
 }
 const jobs = new Set(s.jobs.map(x => x.id)); const packets = new Set(s.packets.map(x => x.id));
 if (new Set(s.packets.map(x => x.jobId)).size !== s.packets.length) throw new Error('Only one packet per job is allowed');
 if (s.packets.some(x => !jobs.has(x.jobId)) || s.attempts.some(x => !jobs.has(x.jobId) || !packets.has(x.packetId)) || s.approvals.some(x => !packets.has(x.packetId))) throw new Error('State contains orphan records');
 if (s.attempts.filter(x => x.outcome === 'in_progress').length > 1) throw new Error('Only one active submission attempt is allowed');
 if (s.preparationLedger.some(x => !packets.has(x.packetId) || !jobs.has(x.jobId)) || new Set(s.preparationLedger.map(x => x.packetId)).size !== s.preparationLedger.length) throw new Error('Invalid preparation ledger');
 if (s.packets.some(x => !s.preparationLedger.some(l => l.packetId === x.id && l.jobId === x.jobId))) throw new Error('Packet is missing its preparation ledger entry');
 const chicagoDay = (stamp: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp));
 const allowances = new Map((s.manualPreparationAllowances ?? []).map(allowance => [allowance.id, allowance]));
 for (const allowance of allowances.values()) if (chicagoDay(allowance.authorizedAt) !== allowance.day) throw new Error('Manual preparation allowance must be authorized on its Chicago calendar day');
 for (const entry of s.preparationLedger.filter(entry => entry.manualAllowanceId)) {
  const allowance = allowances.get(entry.manualAllowanceId!); const packet = s.packets.find(packet => packet.id === entry.packetId)!;
  if (!allowance || allowance.day !== entry.day || !Number.isFinite(Date.parse(packet.createdAt)) || chicagoDay(packet.createdAt) !== entry.day || Date.parse(packet.createdAt) < Date.parse(allowance.authorizedAt)) throw new Error('Preparation ledger has an invalid manual allowance');
 }
 for (const day of new Set(s.preparationLedger.map(x => x.day))) {
  const entries = s.preparationLedger.filter(entry => entry.day === day);
  const limit = Math.max(20, ...entries.flatMap(entry => entry.manualAllowanceId ? [allowances.get(entry.manualAllowanceId)!.limit] : []));
  if (entries.filter(entry => !entry.manualAllowanceId).length > 20 || entries.length > limit) throw new Error('Daily preparation cap exceeded');
 }
 return s;
}

export interface Store { read(): Promise<AppState>; update<T>(fn: (state: AppState) => T): Promise<T>; close(): void | Promise<void> }
export interface StoreOptions { backend: 'sqlite' | 'supabase'; dataDir: string; seed: AppState | (() => Promise<AppState>); supabaseUrl?: string; supabaseServiceKey?: string }

const COVER_LETTER_REFERENCE = 'local-artifact:cover-letter:v1:sha256:';
const coverLetterHash = (body: string) => createHash('sha256').update(body, 'utf8').digest('hex');
const coverLetterPath = (dataDir: string, hash: string) => join(dataDir, 'artifacts', 'cover-letters', `${hash}.md`);
function readCoverLetter(dataDir: string, hash: string): string {
 const file = coverLetterPath(dataDir, hash);
 let body: string;
 try {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Not a regular file');
  body = readFileSync(file, 'utf8');
 } catch {
  throw new Error(`Local cover-letter artifact is missing or unreadable: ${file}. Restore your local artifacts backup before continuing.`);
 }
 if (coverLetterHash(body) !== hash) throw new Error(`Local cover-letter artifact failed SHA256 verification: ${file}. Restore the unchanged artifact before continuing.`);
 return body;
}

/** Cloud state contains references only. Generated document bodies remain on this Mac. */
export function encodeSupabaseState(state: AppState, dataDir: string): AppState {
 const encoded = structuredClone(validateAppState(state));
 for (const packet of encoded.packets) {
  if (!packet.coverLetter) continue;
  const body = packet.coverLetter; const hash = coverLetterHash(body); const file = coverLetterPath(dataDir, hash);
  for (const dir of [dataDir, join(dataDir, 'artifacts'), join(dataDir, 'artifacts', 'cover-letters')]) {
   mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700);
  }
  try { writeFileSync(file, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  readCoverLetter(dataDir, hash); chmodSync(file, 0o600);
  packet.coverLetter = `${COVER_LETTER_REFERENCE}${hash}`;
 }
 return encoded;
}

/** Decode before domain validation/hashing so approvals always cover the actual letter. */
export function decodeSupabaseState(input: unknown, dataDir: string): AppState {
 const decoded = structuredClone(input) as { packets?: unknown } | null;
 if (decoded && typeof decoded === 'object' && Array.isArray(decoded.packets)) {
  for (const value of decoded.packets) {
   if (!value || typeof value !== 'object') continue;
   const packet = value as { coverLetter?: unknown };
   if (typeof packet.coverLetter !== 'string' || !packet.coverLetter) continue;
   if (!packet.coverLetter.startsWith(COVER_LETTER_REFERENCE)) throw new Error('Supabase cover letter is not a supported local artifact reference. Restore a compatible local backup before continuing.');
   const hash = packet.coverLetter.slice(COVER_LETTER_REFERENCE.length);
   if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Supabase cover-letter artifact reference is invalid');
   packet.coverLetter = readCoverLetter(dataDir, hash);
  }
 }
 return validateAppState(decoded);
}

export async function createStore(options: StoreOptions): Promise<Store> {
 // Existing databases own their profile and active résumé. Bootstrap files are
 // needed only when there is no stored state, including for the cloud backend.
 const initialState = async () => {
  const supplied = typeof options.seed === 'function' ? await options.seed() : options.seed;
  return validateAppState({ ...supplied, settings: { ...supplied.settings, backend: options.backend } });
 };
 if (options.backend === 'sqlite') {
  mkdirSync(options.dataDir, { recursive: true, mode: 0o700 }); chmodSync(options.dataDir, 0o700);
  const path = join(options.dataDir, 'career-agent.sqlite'); const db = new Database(path);
  chmodSync(path, 0o600); db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 10000');
  db.exec('CREATE TABLE IF NOT EXISTS agent_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL)');
  try {
   if (!db.prepare('SELECT id FROM agent_state WHERE id=1').get()) {
    const seed = await initialState();
    db.prepare('INSERT OR IGNORE INTO agent_state (id, revision, payload) VALUES (1,0,?)').run(JSON.stringify(seed));
   }
  } catch (error) { db.close(); throw error; }
  const read = () => validateAppState(JSON.parse((db.prepare('SELECT payload FROM agent_state WHERE id=1').get() as { payload: string }).payload));
  return {
   read: async () => read(),
   update: async <T>(fn: (state: AppState) => T): Promise<T> => db.transaction(() => {
    const state = read(); const result = fn(state);
    if (result && typeof (result as any).then === 'function') throw new Error('Store mutations must be synchronous');
    validateAppState(state); db.prepare('UPDATE agent_state SET payload=?, revision=revision+1 WHERE id=1').run(JSON.stringify(state)); return result;
   }).immediate(),
   close: () => { db.close(); },
  };
 }
 if (!options.supabaseUrl || !options.supabaseServiceKey) throw new Error('Supabase is selected but its server credentials are missing. Database was not switched.');
 const client = createClient(options.supabaseUrl, options.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
 const initial = await client.from('job_agent_state').select('revision,payload').eq('id', 'personal').maybeSingle();
 if (initial.error) throw new Error(`Supabase unavailable; no fallback: ${initial.error.message}`);
 if (!initial.data) {
  const seed = await initialState();
  const inserted = await client.from('job_agent_state').insert({ id: 'personal', revision: 0, payload: encodeSupabaseState(seed, options.dataDir) });
  if (inserted.error && inserted.error.code !== '23505') throw new Error(`Supabase initialization failed: ${inserted.error.message}`);
 }
 async function row() {
  const result = await client.from('job_agent_state').select('revision,payload').eq('id', 'personal').single();
  if (result.error) throw new Error(`Supabase unavailable; no fallback: ${result.error.message}`);
  return { revision: result.data.revision as number, state: decodeSupabaseState(result.data.payload, options.dataDir) };
 }
 return {
  read: async () => (await row()).state,
  update: async <T>(fn: (state: AppState) => T): Promise<T> => {
   for (let attempt = 0; attempt < 16; attempt++) {
    const { revision, state } = await row(); const result = fn(state);
    if (result && typeof (result as any).then === 'function') throw new Error('Store mutations must be synchronous');
    validateAppState(state);
    const written = await client.from('job_agent_state').update({ revision: revision + 1, payload: encodeSupabaseState(state, options.dataDir) }).eq('id', 'personal').eq('revision', revision).select('revision');
    if (written.error) throw new Error(`Supabase write failed; no fallback: ${written.error.message}`);
    if (written.data?.length) return result;
   }
   throw new Error('Concurrent update conflict; retry the operation');
  },
  close: () => undefined,
 };
}
