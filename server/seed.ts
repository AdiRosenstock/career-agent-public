import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AppState } from '../shared/types.js';
import { validateAppState } from './store.js';

export function assertPdfRead(bytes: Buffer, expectedSize: number): void {
 if (bytes.length < 5 || bytes.length !== expectedSize || bytes.subarray(0, 4).toString('ascii') !== '%PDF') {
  throw new Error('Résumé PDF read is empty, truncated, or invalid. Hydrate the original file and capture a complete local PDF before starting.');
 }
}
export async function createSeed(options: { resumePath?: string; originalPath?: string; profileSeedPath?: string; now?: Date } = {}): Promise<AppState> {
 const resumePath = options.resumePath ?? process.env.CAREER_RESUME_PATH;
 if (!resumePath) throw new Error('Provide a local résumé PDF with resumePath or CAREER_RESUME_PATH before initialization.');
 const originalPath = options.originalPath ?? resumePath;
 const before = await stat(resumePath); const bytes = await readFile(resumePath); const after = await stat(resumePath);
 if (!before.isFile() || !after.isFile() || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error('Résumé PDF changed while being read. Capture a stable local PDF before starting.');
 assertPdfRead(bytes, after.size);
 const sha256 = createHash('sha256').update(bytes).digest('hex');
 const state: AppState = {
  schemaVersion: 1,
  profile: {
   name: '', email: '', phone: '', linkedin: '', github: '', graduation: '', facts: [],
   visaStatus: '', anticipatedOPT: false, authorizationNow: null, authorizationAtStart: null,
   futureSponsorship: null, authorizationConfirmedAt: null, earliestStart: null, salaryPreference: null, savedAnswers: [],
   resume: { path: resumePath, originalPath, sha256, filename: basename(resumePath) },
  },
  jobs: [], packets: [], approvals: [], attempts: [], runs: [], boards: [], preparationLedger: [],
  settings: { dailyLimit: 20, timezone: 'America/Chicago', scheduleTime: '09:00', rolePriority: ['product', 'data', 'finance', 'consulting', 'software'], preferredLocations: [], workplacePreference: 'any', backend: 'sqlite', automationId: null },
 };
 // Private candidate details are opt-in local data, never bundled source defaults.
 if (options.profileSeedPath) {
  let raw: string | undefined;
  try { raw = await readFile(options.profileSeedPath, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (raw !== undefined) {
   let profile: unknown;
   try { profile = JSON.parse(raw); } catch { throw new Error('Private profile seed is invalid JSON'); }
   if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Private profile seed must be a candidate profile object');
   state.profile = { ...state.profile, ...profile, resume: state.profile.resume };
  }
 }
 return validateAppState(state);
}
