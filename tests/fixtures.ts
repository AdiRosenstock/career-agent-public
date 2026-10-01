import { createSeed } from '../server/seed.js';
import type { AppState } from '../shared/types.js';

export const SYNTHETIC_NAME = 'Alex Example';
export const SYNTHETIC_EDUCATION = 'Example University, BA in Computer Science; expected June 2027';

/** Deliberately fictional candidate; tests never load a user's private profile seed. */
export async function createTestSeed(options: { resumePath: string; originalPath?: string }): Promise<AppState> {
 const state = await createSeed(options);
 state.profile = { ...state.profile, name: SYNTHETIC_NAME, email: 'candidate@example.test', phone: '+1 202-555-0100',
  linkedin: 'https://example.test/linkedin', github: 'https://example.test/github', graduation: '2027-06',
  visaStatus: 'F-1', anticipatedOPT: true, futureSponsorship: true,
  facts: [
   ['name', 'Full name', SYNTHETIC_NAME], ['email', 'Email', 'candidate@example.test'],
   ['phone', 'Phone', '+1 202-555-0100'], ['education', 'Education', SYNTHETIC_EDUCATION],
  ].map(([id, label, value]) => ({ id, label, value, source: 'fixture:synthetic-candidate', confirmed: true })),
 };
 return state;
}
