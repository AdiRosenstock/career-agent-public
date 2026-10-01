import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSeed } from '../server/seed.js';
import { createStore } from '../server/store.js';

test('new production profiles are blank unless an explicit private profile seed is provided', async t => {
 const dir = await mkdtemp(join(tmpdir(), 'career-seed-')); t.after(() => rm(dir, { recursive: true, force: true }));
 const resume = join(dir, 'resume.pdf'); await writeFile(resume, '%PDF-1.4 synthetic resume fixture');
 const blank = await createSeed({ resumePath: resume });
 for (const field of ['name', 'email', 'phone', 'linkedin', 'github', 'graduation', 'visaStatus'] as const) assert.equal(blank.profile[field], '');
 assert.deepEqual(blank.profile.facts, []); assert.equal(blank.profile.futureSponsorship, null);
 const file = join(dir, 'profile-seed.json');
 await writeFile(file, JSON.stringify({ name: 'Taylor Fixture', email: 'private@example.test', resume: { path: '/untrusted-seed-path.pdf' }, facts: [{ id: 'name', label: 'Name', value: 'Taylor Fixture', source: 'fixture:private-profile', confirmed: true }] }), { mode: 0o600 });
 const seeded = await createSeed({ resumePath: resume, profileSeedPath: file });
 assert.equal(seeded.profile.name, 'Taylor Fixture'); assert.equal(seeded.profile.email, 'private@example.test');
 assert.equal(seeded.profile.facts.length, 1); assert.equal(seeded.profile.resume.path, resume); assert.equal(seeded.profile.resume.sha256, blank.profile.resume.sha256);
 assert.equal((await createSeed({ resumePath: resume, profileSeedPath: join(dir, 'absent.json') })).profile.name, '');
});

test('a replacement seed never overwrites an existing database profile', async t => {
 const dir = await mkdtemp(join(tmpdir(), 'career-seed-preserve-')); t.after(() => rm(dir, { recursive: true, force: true }));
 const resume = join(dir, 'resume.pdf'); await writeFile(resume, '%PDF-1.4 synthetic resume fixture');
 const firstSeed = await createSeed({ resumePath: resume }); firstSeed.profile.name = 'Existing Fixture';
 const first = await createStore({ backend: 'sqlite', dataDir: dir, seed: firstSeed });
 await first.update(s => { s.profile.salaryPreference = 'Existing local preference'; }); await first.close();
 const replacement = await createSeed({ resumePath: resume }); replacement.profile.name = 'Replacement Fixture';
 const reopened = await createStore({ backend: 'sqlite', dataDir: dir, seed: replacement });
 try { const saved = await reopened.read(); assert.equal(saved.profile.name, 'Existing Fixture'); assert.equal(saved.profile.salaryPreference, 'Existing local preference'); }
 finally { await reopened.close(); }
});
