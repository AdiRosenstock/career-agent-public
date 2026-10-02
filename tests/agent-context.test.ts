import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestSeed } from './fixtures.js';
import { agentWork } from '../server/agent-context.js';
import { setupComplete, setupChecklist } from '../shared/workflow.js';
import { normalizeJob } from '../server/discovery.js';
import type { AppSnapshot, ApplicationPacket } from '../shared/types.js';

async function fixture(t: TestContext): Promise<AppSnapshot> {
 const directory = await mkdtemp(path.join(tmpdir(), 'career-work-'));
 t.after(() => rm(directory, { recursive: true, force: true }));
 const resumePath = path.join(directory, 'resume.pdf'); await writeFile(resumePath, '%PDF-1.4 synthetic');
 const state = await createTestSeed({ resumePath });
 state.profile.authorizationNow = true; state.profile.authorizationAtStart = true; state.profile.futureSponsorship = false; state.profile.authorizationConfirmedAt = new Date().toISOString();
 state.settings.careerStage = 'new_grad'; state.settings.careerTargetsConfirmed = true;
 return { ...state, meta: { backend: 'sqlite', preparedToday: 2, remainingToday: 18, lastSuccessfulRun: null, catchUpDue: false, resumeValid: true, workspace: directory } };
}

test('setup checklist uses saved answers without assuming a career or authorization', async t => {
 const state = await fixture(t); assert.equal(setupComplete(state), true);
 state.settings.careerTargetsConfirmed = false; state.profile.futureSponsorship = null;
 assert.deepEqual(setupChecklist(state).filter(item => !item.complete).map(item => item.id), ['targets', 'authorization']);
 state.settings.careerTargetsConfirmed = true; state.settings.careerStage = 'experienced'; state.profile.graduation = ''; state.settings.yearsExperience = null;
 assert.equal(setupChecklist(state).find(item => item.id === 'experience')?.complete, false);
 state.settings.yearsExperience = 3; assert.equal(setupChecklist(state).find(item => item.id === 'experience')?.complete, true);
});

test('work context stays bounded as descriptions and application history grow; pages retain exact IDs', async t => {
 const state = await fixture(t);
 for (let i = 0; i < 60; i++) {
  const job = normalizeJob({ id: `job-${i}`, company: 'Synthetic Employer', title: `Product Analyst ${i}`, description: 'large-source-evidence '.repeat(3000), location: 'Chicago', status: 'open', sourceUrl: `https://example.test/jobs/${i}`, applyUrl: `https://example.test/jobs/${i}` });
  job.eligible = true; state.jobs.push(job);
  state.packets.push({ id: `packet-${i}`, jobId: job.id, status: 'needs_input', answers: [], unresolved: ['Form review pending: inspect all application questions'], createdAt: '', updatedAt: '', version: 1, resumeHash: '', formVersion: null, coverLetter: 'large-private-cover-letter '.repeat(500), notes: '', contentHash: '', approvalId: null });
  job.title = 'long-title '.repeat(5000);
  state.packets[i].unresolved.push('long-question '.repeat(5000));
 }
 const before = JSON.stringify(state); const work = agentWork(state);
 assert.equal(work.next, 'complete_existing_packets'); assert.equal(work.packets.length, 8); assert.equal(work.morePackets, 52); assert.equal(work.nextOffset, 8);
 assert.equal(JSON.stringify(work).includes('large-source-evidence'), false); assert.equal(JSON.stringify(work).includes('large-private-cover-letter'), false);
 assert.ok(JSON.stringify(work).length < 10000); assert.ok(JSON.stringify(work).length < before.length / 100);
 assert.equal(JSON.stringify(state), before, 'Read-only work context cannot alter answers or approvals');
 assert.equal(agentWork(state, { offset: 8, limit: 2 }).packets[0].packetId, 'packet-8');
 assert.throws(() => agentWork(state, { limit: 0 }), /limit/); assert.throws(() => agentWork(state, { offset: -1 }), /offset/);
});

test('focused submission context includes only current approvals and never treats old batches as executable', async t => {
 const state = await fixture(t);
 const job = normalizeJob({ id: 'approved-job', company: 'Synthetic', title: 'Product Analyst', status: 'open', description: '', sourceUrl: 'https://example.test/job', applyUrl: 'https://example.test/job' }); job.eligible = true; state.jobs.push(job);
 const packet: ApplicationPacket = { id: 'approved-packet', jobId: job.id, status: 'approved', answers: [], unresolved: [], createdAt: '', updatedAt: '', version: 1, resumeHash: '', formVersion: 'v1', coverLetter: '', notes: '', contentHash: '', approvalId: 'approval-1' }; state.packets.push(packet);
 state.approvals.push({ id: 'approval-1', packetId: packet.id, batchId: 'batch-1', approvedAt: '', revokedAt: null, packetHash: '', resumeHash: '', formVersion: 'v1' });
 assert.equal(agentWork(state, { batchId: 'batch-1' }).packets[0].packetId, packet.id);
 assert.throws(() => agentWork(state, { batchId: 'missing' }), /No current approved/);
 packet.approvalId = null; assert.throws(() => agentWork(state, { batchId: 'batch-1' }), /No current approved/);
 packet.status = 'handoff';
 state.attempts.push({ id: 'handoff-1', jobId: job.id, packetId: packet.id, batchId: 'manual-handoff', startedAt: '', finishedAt: '', outcome: 'handoff', evidence: 'Sign in with your own account.', confirmationUrl: null });
 assert.equal(agentWork(state).handoffs[0].evidence, 'Sign in with your own account.');
 assert.equal(agentWork(state).counts.userActionRequired, 1);
});
