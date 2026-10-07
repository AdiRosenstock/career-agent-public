import { priorityRank } from '../shared/candidatePolicy.js';
import { setupChecklist } from '../shared/workflow.js';
import type { AppSnapshot } from '../shared/types.js';
const summary = (text: string, max = 240) => text.length > max ? `${text.slice(0, max)}…` : text;

/** A bounded index. Read packet ID for exact facts, answers and job descriptions. */
export function agentWork(state: AppSnapshot, options: { limit?: number; offset?: number; batchId?: string; dashboardUrl?: string } = {}) {
 const limit = options.limit ?? 8;
 const offset = options.offset ?? 0;
 if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Work limit must be between 1 and 20.');
 if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Work offset must be a nonnegative integer.');
 const gaps = setupChecklist(state).filter(item => !item.complete).map(({ id, label }) => ({ id, label }));
 const jobById = new Map(state.jobs.map(job => [job.id, job]));
 const applied = new Set(state.meta.appliedJobIds || []);
 const active = state.packets.filter(packet => !['submitted', 'failed', 'unknown', 'submitting'].includes(packet.status) && !applied.has(packet.jobId) && !jobById.get(packet.jobId)?.dismissed && jobById.get(packet.jobId)?.status !== 'closed');
 const approvals = state.approvals.filter(approval => !approval.revokedAt && active.some(packet => packet.status === 'approved' && packet.id === approval.packetId && packet.approvalId === approval.id));
 const batches = [...new Set(approvals.map(approval => approval.batchId))].map(batchId => {
  const packetIds = approvals.filter(approval => approval.batchId === batchId).map(approval => approval.packetId);
  return { batchId, packetCount: packetIds.length, packetIds: packetIds.slice(0, limit), command: `npm run agent -- approved ${batchId}` };
 });
 if (options.batchId && !batches.some(batch => batch.batchId === options.batchId)) throw new Error('No current approved packets for this batch. Review the batch in the dashboard.');
 const pending = active.filter(packet => ['draft', 'needs_input'].includes(packet.status) && jobById.get(packet.jobId)?.eligible);
 const ready = active.filter(packet => packet.status === 'ready' && jobById.get(packet.jobId)?.eligible);
 const handoffs = active.filter(packet => packet.status === 'handoff');
 const candidates = state.jobs.filter(job => job.eligible && job.status === 'open' && !job.dismissed && !applied.has(job.id) && !state.packets.some(packet => packet.jobId === job.id))
  .sort((a, b) => priorityRank(a, state.settings) - priorityRank(b, state.settings) || b.score - a.score);
 const research = state.jobs.filter(job => !job.eligible && job.status !== 'closed' && !job.dismissed && !applied.has(job.id));
 const packetSummary = (packet: typeof active[number]) => ({ packetId: packet.id, jobId: packet.jobId, company: summary(jobById.get(packet.jobId)?.company || '', 80), title: summary(jobById.get(packet.jobId)?.title || '', 160), status: packet.status, blockers: packet.unresolved.slice(0, 4).map(text => summary(text)), command: `npm run agent -- packet ${packet.id}` });
 const missing = new Map<string, { question: string; options: string[]; packetIds: string[] }>();
 for (const packet of pending) for (const question of jobById.get(packet.jobId)?.questions || []) {
  if (!question.required || !packet.unresolved.includes(`Required answer missing or unconfirmed: ${question.label}`)) continue;
  const key = JSON.stringify([question.label, question.options || []]);
  const group = missing.get(key) || { question: question.label, options: question.options || [], packetIds: [] };
  group.packetIds.push(packet.id); missing.set(key, group);
 }
 const unresolvedAttempts = state.attempts.filter(attempt => ['unknown', 'in_progress'].includes(attempt.outcome));
 const focused = options.batchId ? active.filter(packet => approvals.some(approval => approval.batchId === options.batchId && approval.packetId === packet.id)) : [];
 const dashboard = options.dashboardUrl || 'http://127.0.0.1:4317';
 return {
  dashboard,
  links: { setup: `${dashboard}/?view=start`, questions: `${dashboard}/?view=review` },
  backend: state.meta.backend,
  next: options.batchId ? 'submit_approved_batch' : gaps.length ? 'finish_dashboard_setup' : unresolvedAttempts.length ? 'reconcile_outcomes_then_continue_other_jobs' : pending.length ? 'complete_existing_packets' : 'discover_and_prepare',
  setupGaps: gaps,
  criteria: { careerStage: state.settings.careerStage ?? null, yearsExperience: state.settings.yearsExperience ?? null, rolePriority: state.settings.rolePriority, roleKeywords: state.settings.roleKeywords || [], preferredLocations: state.settings.preferredLocations || [], targetEmployers: state.settings.targetEmployers || [], preferredCareerSites: (state.settings.preferredCareerSites || []).slice(0, 8).map(site => summary(site, 180)), moreCareerSites: Math.max(0, (state.settings.preferredCareerSites || []).length - 8), workplacePreference: state.settings.workplacePreference || 'any', minimumAnnualCompensation: state.settings.minimumAnnualCompensation ?? null, compensationBasis: state.settings.compensationBasis ?? 'base', graduation: state.profile.graduation, earliestStart: state.profile.earliestStart },
  applicationPreferences: state.settings.applicationPreferences ?? null,
  profile: { authorizationNow: state.profile.authorizationNow, authorizationAtStart: state.profile.authorizationAtStart, futureSponsorship: state.profile.futureSponsorship, authorizationConfirmedAt: state.profile.authorizationConfirmedAt, resumeValid: state.meta.resumeValid, facts: state.profile.facts.length, savedAnswers: state.profile.savedAnswers.length },
  quota: { preparedToday: state.meta.preparedToday, remainingToday: state.meta.remainingToday },
  counts: { needsAnswersOrInspection: pending.length, userActionRequired: handoffs.length, readyToReview: ready.length, approved: approvals.length, research: research.length, unpreparedMatches: candidates.length, submitted: state.attempts.filter(attempt => attempt.outcome === 'submitted').length },
  packets: (options.batchId ? focused : pending).slice(offset, offset + limit).map(packetSummary),
  readyPackets: options.batchId ? [] : ready.slice(offset, offset + limit).map(packetSummary),
  morePackets: Math.max(0, (options.batchId ? focused : pending).length - offset - limit),
  nextOffset: (options.batchId ? focused : pending).length > offset + limit ? offset + limit : null,
  approvedBatches: options.batchId ? batches.filter(batch => batch.batchId === options.batchId) : batches.slice(-limit),
  unresolvedAttempts: unresolvedAttempts.slice(0, limit).map(({ id, packetId, jobId, outcome }) => ({ id, packetId, jobId, outcome })),
  handoffs: handoffs.slice(0, limit).map(packet => ({ ...packetSummary(packet), evidence: summary([...state.attempts].reverse().find(attempt => attempt.packetId === packet.id && attempt.outcome === 'handoff')?.evidence || '', 400) })),
  ...(options.batchId ? {} : {
   questions: [...missing.values()].sort((a, b) => b.packetIds.length - a.packetIds.length).slice(0, limit).map(group => ({ question: summary(group.question, 160), options: group.options.slice(0, 8).map(option => summary(option, 80)), affectedPackets: group.packetIds.length, packetIds: group.packetIds.slice(0, limit) })),
   matches: candidates.slice(0, limit).map(({ id, company, title, location }) => ({ id, company: summary(company, 80), title: summary(title, 160), location: summary(location, 120), command: `npm run agent -- job ${id}` })),
   research: research.slice(0, Math.min(limit, 5)).map(({ id, company, title, eligibilityReasons }) => ({ id, company: summary(company, 80), title: summary(title, 160), reasons: eligibilityReasons.slice(0, 4).map(text => summary(text)), command: `npm run agent -- job ${id}` })),
  }),
  guidance: 'Summaries may be shortened; use packet ID, job ID or profile for exact contents. Use work --offset N for more packets. Save missing personal questions in inspected packets; the candidate answers in Review queue → Needs answers. Continue other jobs. This read-only index never grants submission permission.',
 };
}
