import { candidateRestrictions, matchesTargets, roleFamilies, sponsorshipNotRequired } from '../shared/candidatePolicy.js';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import type { Answer, AppSnapshot, AppState, ApplicationPacket, Board, CandidateDocument, CandidateProfile, DailyRun, FormQuestion, Job, ManualPreparationAllowance, PacketDraft, PriorApplication, Settings, SubmissionAttempt } from '../shared/types.js';
import { validatePriorApplications, type Store } from './store.js';
import { assessCompensation, compensationEligibilityReasons } from './compensation.js';
import { isGraduateSoftwareStaffRole, isNonPermanentJob, parseAtsJobUrl, assessJob, sponsorshipStatus } from './discovery.js';
import { verifiedResumeBytes } from './resume.js';

export class AgentError extends Error { constructor(message: string, public status = 409) { super(message); this.name = 'AgentError'; } }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const textKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const companyKey = (s: string) => textKey(s.replace(/\b(incorporated|inc|corporation|corp|llc|ltd|limited|plc)\b[.,]?/gi, ''));
const hours = (stamp: string | null, now: Date) => stamp ? (now.getTime() - new Date(stamp).getTime()) / 3_600_000 : Infinity;
const isFresh = (stamp: string | null, now: Date, maxHours: number) => { const age = hours(stamp, now); return Number.isFinite(age) && age >= -0.1 && age <= maxHours; };
const httpUrl = (value: string) => { try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; } };
const canonicalUrl = (value: string) => { try {
 const u = new URL(value); u.hash = '';
 if (u.hostname === 'boards.greenhouse.io') u.hostname = 'job-boards.greenhouse.io';
 for (const key of [...u.searchParams.keys()]) if (/^utm_/i.test(key) || /^(ref|source|referrer|gh_src|lever-source|lever-origin|fbclid|gclid)$/i.test(key)) u.searchParams.delete(key);
 u.searchParams.sort(); return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/$/, '')}${u.search}`;
} catch { return value; } };
const dateKey = (date: Date, timezone = 'America/Chicago') => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const clockTime = (date: Date, timezone: string) => new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
const protectedStatuses = new Set(['submitting', 'submitted', 'unknown']);
const isFileQuestion = (type: string) => /(?:^|\|)(?:input_)?file(?:\||$)/i.test(type.replace(/\s/g, ''));
const linkedinQuestion = /^(?:(?:what's|what is) your\s+)?linkedin(?:\s+profile)?(?:\s+(?:url|link))?(?:\s*\((?:if available|optional)\))?\??\*?$/i;
const githubQuestion = /^(?:(?:what's|what is) your\s+)?(?:github(?:\s+profile)?(?:\s+(?:url|link))?(?:\s*\((?:if relevant|if available|optional)\))?|github,\s*portfolio,\s*or\s+website\s+link(?:\s*\(if relevant\))?|github\s+or\s+(?:personal\s+)?website)\??\*?$/i;

export function sameJob(a: Job, b: Job): boolean {
 return a.id === b.id || (!!a.postingId && a.source === b.source && a.board === b.board && a.postingId === b.postingId)
  || (!!a.applyUrl && !!b.applyUrl && canonicalUrl(a.applyUrl) === canonicalUrl(b.applyUrl))
  || (a.source !== b.source && !!a.title && !!a.location && companyKey(a.company) === companyKey(b.company) && textKey(a.title) === textKey(b.title) && textKey(a.location) === textKey(b.location));
}
function priorApplicationCandidateMatchesJob(record: PriorApplication, job: Job): boolean {
 const priorAts = record.jobUrl ? parseAtsJobUrl(record.jobUrl) : null; const currentAts = parseAtsJobUrl(job.applyUrl) ?? parseAtsJobUrl(job.sourceUrl);
 if (priorAts && currentAts) return priorAts.source === currentAts.source && priorAts.token.toLowerCase() === currentAts.token.toLowerCase() && priorAts.postingId === currentAts.postingId;
 const priorYears: string[] = record.title.match(/\b20\d{2}\b/g) ?? []; const jobYears: string[] = job.title.match(/\b20\d{2}\b/g) ?? [];
 if (priorYears.length && jobYears.length && !priorYears.some(year => jobYears.includes(year))) return false;
 if (record.jobUrl && [job.applyUrl, job.sourceUrl].some(url => !!url && canonicalUrl(url) === canonicalUrl(record.jobUrl!))) return true;
 if (companyKey(record.company) !== companyKey(job.company)) return false;
 const priorId = record.postingId || priorAts?.postingId; const currentId = job.postingId || currentAts?.postingId;
 if (priorId && currentId) return priorId === currentId;
 const title = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
 return !!record.title.trim() && title(record.title) === title(job.title);
}
export function priorApplicationMatchesJob(record: PriorApplication, job: Job): boolean {
 return record.matchScope !== 'needs_review' && priorApplicationCandidateMatchesJob(record, job);
}
function activePriorApplications(s: AppState): PriorApplication[] {
 const history = s.priorApplications ?? []; const superseded = new Set(history.flatMap(record => record.supersedesId ? [record.supersedesId] : []));
 return history.filter(record => !superseded.has(record.id));
}
function priorMatches(s: AppState, job: Job): PriorApplication[] { return activePriorApplications(s).filter(record => priorApplicationMatchesJob(record, job)); }
function priorReviewReasons(s: AppState, job: Job): string[] {
 return activePriorApplications(s).filter(record => record.matchScope === 'needs_review' && priorApplicationCandidateMatchesJob(record, job))
  .map(record => `Prior application review: ${record.company} — ${record.title}; confirm the requisition before applying (${record.id})`);
}
function applyPriorApplicationPolicy(s: AppState, job: Job): Job {
 const existingReasons = job.eligibilityReasons.filter(reason => !reason.startsWith('Prior application review: ') && reason !== 'Prior application already recorded for this role');
 const unexplainedBlock = !job.eligible && job.eligibilityReasons.length === 0;
 const exactMatch = priorMatches(s, job).length > 0;
 const reasons = [...existingReasons, ...priorReviewReasons(s, job), ...(exactMatch ? ['Prior application already recorded for this role'] : [])];
 return { ...job, dismissed: job.dismissed || exactMatch, eligible: !unexplainedBlock && reasons.length === 0, eligibilityReasons: [...new Set(reasons)] };
}
function applyCompensationPolicy(job: Job, settings: Settings): Job {
 const existingReasons = job.eligibilityReasons.filter(reason => !reason.startsWith('Compensation: '));
 const unexplainedBlock = !job.eligible && job.eligibilityReasons.length === 0;
 const reasons = [...existingReasons, ...compensationEligibilityReasons(job, settings.minimumAnnualCompensation ?? null, settings.compensationBasis ?? 'base')];
 return { ...job, eligibilityReasons: [...new Set(reasons)], eligible: !unexplainedBlock && reasons.length === 0 };
}
const careerReason = (reason: string) => /^(Career target:|Title indicates a senior role|Management role is outside|Requires at least three years|Posting explicitly excludes graduate|Graduate\/entry-level suitability|Explicit graduation or start|Requires a graduate degree beyond|Required advanced degree needs profile verification)/.test(reason);
function applyCandidatePolicy(job: Job, s: AppState, current = new Date()): Job {
 const assessed = assessJob(job, {...s.settings, graduation:s.profile.graduation});
 const updated = { ...job, roleFamily: assessed.roleFamily, ...(s.settings.careerStage ? {score:assessed.score,fitReasons:assessed.fitReasons,concerns:assessed.concerns} : {}) };
 const unexplainedBlock = !job.eligible && !job.eligibilityReasons.length;
 const reasons = job.eligibilityReasons.filter(reason => !(s.settings.careerStage && careerReason(reason)) && !/sponsorship|selected career tracks|citizenship requirement|Export-control eligibility|Security-clearance eligibility|Work authorization at/i.test(reason));
 if (s.settings.careerStage) reasons.push(...assessed.eligibilityReasons.filter(careerReason));
 if (!matchesTargets(updated, s.settings)) reasons.push('Role is outside the selected career tracks');
 const noSponsor = sponsorshipNotRequired(s.profile);
 if (!noSponsor) {
  const sponsor = sponsorshipStatus(updated, current.getTime());
  if (sponsor === 'explicit_no') reasons.push('Posting explicitly excludes required sponsorship');
  else if (sponsor === 'unknown') reasons.push('Sponsorship evidence needs research');
 }
 reasons.push(...candidateRestrictions(updated, s.profile));
 updated.eligibilityReasons = [...new Set(reasons)];
 updated.eligible = !unexplainedBlock && updated.eligibilityReasons.length === 0;
 return updated;
}
export function eligibilityReasons(job: Job, now = new Date(), profile?: CandidateProfile, settings?: Settings): string[] {
 const reasons: string[] = [];
 if (job.status !== 'open') reasons.push('Posting is not confirmed open');
 if (job.dismissed) reasons.push('Posting was dismissed');
 if (job.deadline && (!Number.isFinite(Date.parse(job.deadline)) || Date.parse(job.deadline) < now.getTime())) reasons.push('Application deadline has passed or is invalid');
 if (!httpUrl(job.applyUrl) || !httpUrl(job.sourceUrl)) reasons.push('A valid source and application URL are required');
 const matching = job.sponsorship.filter(e => e.entityMatch && companyKey(e.employerName) === companyKey(job.company) && httpUrl(e.sourceUrl) && e.excerpt.trim());
 // A current restriction always wins over historical sponsorship, including an explicit restriction in the posting itself.
 const restriction = /(?:cannot|unable to|will not|do not|does not|not able to)\s+(?:\w+\s+){0,4}(?:sponsor|provide\s+(?:visa\s+)?sponsorship)|(?:no|without)\s+(?:(?:current|future|visa|immigration|employment)\s+){0,3}sponsorship|sponsorship\s+(?:is\s+)?(?:not available|unavailable|not offered)|(?:must|need to)\s+(?:be\s+)?(?:a\s+)?(?:U\.?S\.?|United States)\s+citizen/i;
 const negative = (value: string) => restriction.test(value.replace(/\b(?:cannot|can't|do not|don't)\s+guarantee\b[^;.!?\n]{0,80}\bsponsorship\b/gi, 'uncertain sponsorship').replace(/\bwith or without\s+(?:(?:visa|immigration|employment)\s+)?sponsorship\b/gi, 'with possible sponsorship'));
 if (!sponsorshipNotRequired(profile) && (negative(job.description) || matching.some(e => e.status === 'explicit_no' || (e.scope === 'role' && negative(e.excerpt))))) reasons.push('Employer or role explicitly excludes sponsorship');
 else if (!sponsorshipNotRequired(profile) && !matching.some(e => (e.status === 'explicit_yes' && e.scope === 'role' && isFresh(e.checkedAt, now, 24 * 180)) || (e.status === 'history_only' && e.scope === 'employer' && isFresh(e.checkedAt, now, 24 * 730)))) reasons.push('Current sponsorship support or verified employer history is required');
 reasons.push(...candidateRestrictions(job, profile));
 if (isNonPermanentJob(job)) reasons.push('Target is full-time employment; non-permanent roles are excluded');
 const seniorityTitle = isGraduateSoftwareStaffRole(job) ? job.title.replace(/\bMember of Technical Staff\b/i, '') : job.title;
 if (settings?.careerStage !== 'experienced' && /\b(?:senior|sr\.?|staff|principal|director|vice president|vp|head of)\b/i.test(seniorityTitle)) reasons.push('Role seniority is outside the graduate/entry-level target');
 // Some December-2026 new-grad titles explicitly accept a second graduation
 // cohort through summer 2027. A start-year restriction is not that alternative.
 const hasSummerGraduationAlternative = !/\b(?:start|commenc)\w*\b/i.test(job.title)
  && /\b2026\b/.test(job.title) && !/\b20(?:2[0-5]|[3-9]\d)\b/.test(job.title)
  && job.description.split(/[.!?\n;]/).some(clause =>
   /\bgraduating\s+(?:in\s+)?(?:December|Dec)\s+2026\s+or\s+(?:by\s+|in\s+)?(?:Summer|June|July|August)\s+2027\b/i.test(clause)
   && !/\b(?:not|exclude[sd]?|ineligible|cannot|can't)\b/i.test(clause));
 if (!settings?.careerStage && /\b20(?:2[0-6]|[3-9]\d)\b/.test(job.title) && !/\b2027\b/.test(job.title) && !hasSummerGraduationAlternative) reasons.push('Advertised cohort does not match 2027');
 if (!job.eligible) reasons.push(...(job.eligibilityReasons.length ? job.eligibilityReasons : ['Role requires further eligibility review']));
 return [...new Set(reasons)];
}

function formVersion(job: Job): string | null { return job.formInspectedAt ? digest({ questions: job.questions, applyUrl: job.applyUrl }) : null; }
function packetHash(s: AppState, p: ApplicationPacket, j: Job): string {
 const sponsorship = [...new Map(j.sponsorship.map(({ id: _id, checkedAt: _checkedAt, ...material }) => [JSON.stringify(material), material])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const { documents, ...legacyProfile } = s.profile;
 const profile = documents?.length ? { ...legacyProfile, documents } : legacyProfile;
 return digest({ jobId: p.jobId, answers: p.answers, coverLetter: p.coverLetter, unresolved: p.unresolved, notes: p.notes,
  resumeHash: p.resumeHash, formVersion: p.formVersion, profile,
  posting: { title: j.title, company: j.company, location: j.location, description: j.description, applyUrl: j.applyUrl, sourceUrl: j.sourceUrl, source: j.source, sponsorship, status: j.status, eligible: j.eligible, dismissed: j.dismissed },
  ...(s.settings.careerStage ? { careerPolicy:{careerStage:s.settings.careerStage,yearsExperience:s.settings.yearsExperience,rolePriority:s.settings.rolePriority,roleKeywords:s.settings.roleKeywords} } : {}),
  ...(p.attachments?.length ? { attachments: p.attachments } : {}),
  ...(s.settings.minimumAnnualCompensation != null ? { compensationPolicy: { minimumAnnualCompensation: s.settings.minimumAnnualCompensation, compensationBasis: s.settings.compensationBasis ?? 'base' } } : {}),
 });
}
function resumeValid(profile: CandidateProfile): boolean {
 // originalPath is provenance. iCloud may evict that source after we capture its
 // exact bytes; submissions use only the immutable, verified local snapshot.
 try {
  const bytes = readFileSync(profile.resume.path);
  return bytes.length >= 5 && bytes.subarray(0, 4).toString('ascii') === '%PDF' && createHash('sha256').update(bytes).digest('hex') === profile.resume.sha256;
 } catch { return false; }
}
function requireResume(s: AppState): void { if (!resumeValid(s.profile)) throw new AgentError('Résumé file is missing or changed. Restore the unchanged original before approving or submitting.'); }
function documentValid(document: CandidateDocument): boolean {
 try {
  const info = lstatSync(document.path);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 5 || info.size > 20 * 1024 * 1024) return false;
  const bytes = readFileSync(document.path);
  return bytes.length === info.size && bytes.subarray(0, 4).toString('ascii') === '%PDF' && createHash('sha256').update(bytes).digest('hex') === document.sha256;
 } catch { return false; }
}
function documentAccepted(document: CandidateDocument, question: FormQuestion): boolean {
 if (document.kind === 'base_cover_letter') return false;
 if (!isFileQuestion(question.type) || /resume|résumé|\bcv\b|cover\s*letter/i.test(question.label)) return false;
 if (/transcript|academic\s+record/i.test(question.label)) return document.kind === 'transcript';
 if (/recommendation|reference\s+letter|letter\s+of\s+reference/i.test(question.label)) return document.kind === 'recommendation';
 return !question.required && /(?:additional|supplemental|supporting|other)\s+(?:documents?|attachments?|files?|materials?)/i.test(question.label);
}
function attachmentProblems(s: AppState, p: ApplicationPacket, job: Job): string[] {
 const attachments = p.attachments ?? []; const problems: string[] = [];
 if (new Set(attachments.map(a => a.questionId)).size !== attachments.length) problems.push('Attachment: Select only one document for each upload question');
 for (const attachment of attachments) {
  const document = s.profile.documents?.find(d => d.id === attachment.documentId); const question = job.questions.find(q => q.id === attachment.questionId);
  if (!document) problems.push('Attachment: Selected document is no longer registered');
  else if (!question || !documentAccepted(document, question)) problems.push(`Attachment: ${document.label} does not match an accepted upload question`);
  else if (attachment.sha256 !== document.sha256 || !documentValid(document)) problems.push(`Attachment: ${document.label} is missing or changed; verify its SHA256 before approval or upload`);
 }
 return problems;
}
function requireAttachments(s: AppState, p: ApplicationPacket, job: Job): void {
 const problems = attachmentProblems(s, p, job); if (problems.length) throw new AgentError(problems.join('; '));
}
function getJob(s: AppState, id: string): Job { const job = s.jobs.find(j => j.id === id); if (!job) throw new AgentError('Job not found', 404); return sponsorshipNotRequired(s.profile) ? applyCandidatePolicy(job, s) : job; }
function getPacket(s: AppState, id: string): ApplicationPacket { const p = s.packets.find(x => x.id === id); if (!p) throw new AgentError('Packet not found', 404); return p; }
function revoke(s: AppState, p: ApplicationPacket, at: string): void {
 for (const a of s.approvals.filter(a => a.packetId === p.id && !a.revokedAt)) a.revokedAt = at;
 p.approvalId = null;
}
function exactSaved(s: AppState, question: string, answer?: string) {
 return s.profile.savedAnswers.find(x => textKey(x.question) === textKey(question) && (answer === undefined || x.answer === answer) && Number.isFinite(Date.parse(x.confirmedAt)));
}
function selfIdentificationQuestion(label: string): boolean {
 return /\b(?:gender|ethnic(?:ity)?|race|racial|hispanic|latino|sexual orientation|transgender|veteran|disabilit(?:y|ies)|age range)\b/i.test(label);
}
function reusableSelfIdentificationChoice(q: FormQuestion, answer: string): boolean {
 return !selfIdentificationQuestion(q.label) || (
  /select|radio|single|dropdown/i.test(q.type)
  && !/multi_select|checkbox|check_box|array|mark all that apply|select all that apply/i.test(q.type + ' ' + q.label)
  && !!q.options?.includes(answer)
 );
}
function answerShapeMatchesField(questionId: string, label: string, answer: string): boolean {
 if (/^start-month--\d+$/.test(questionId) && /^start date month$/i.test(label)) return /^(?:January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(answer);
 if (questionId === 'country' && /^phone country$/i.test(label)) return /^[^\d]+\+\d{1,3}$/.test(answer);
 return true;
}
function coreContactAnswer(s: AppState, q: FormQuestion): Answer | null {
 const label = q.label.trim().toLowerCase().replace(/\s*\*$/, '');
 let answer: string; let key: 'name' | 'email' | 'phone';
 if (/^(?:full )?name$/.test(label)) { answer = s.profile.name; key = 'name'; }
 else if (label === 'first name') { answer = s.profile.name.split(' ')[0]; key = 'name'; }
 else if (label === 'last name') { answer = s.profile.name.split(' ').slice(1).join(' '); key = 'name'; }
 else if (/^(?:e-?mail|email address)$/.test(label)) { answer = s.profile.email; key = 'email'; }
 else if (/^(?:phone|phone number|telephone)$/.test(label)) { answer = s.profile.phone; key = 'phone'; }
 else return null;
 const fact = s.profile.facts.find(f => f.id === key && f.value === s.profile[key] && f.confirmed && !!f.source);
 return { questionId: q.id, question: q.label, answer, factIds: fact ? [fact.id] : [], confirmed: !!fact || !!exactSaved(s, q.label, answer) };
}
function confirmedProfileAnswer(s: AppState, q: FormQuestion): Answer | null {
 const label = q.label.trim().replace(/\s+/g, ' ').replace(/\s*\*$/, '');
 const choice = (value: boolean) => q.options?.length ? q.options.find(option => new RegExp(`^${value ? 'yes' : 'no'}$`, 'i').test(option.trim())) : value ? 'Yes' : 'No';
 const saved = (question: string) => exactSaved(s, question)?.answer;
 const savedChoice = (questions: string[]) => {
  const values = questions.map(question => saved(question)).filter((value): value is string => value !== undefined);
  const choices = values.map(value => /^yes$/i.test(value.trim()) ? true : /^no$/i.test(value.trim()) ? false : null);
  if (!choices.length || choices.some(value => value === null || value !== choices[0])) return undefined;
  return choice(choices[0]!);
 };
 let answer: string | undefined; const factIds: string[] = [];
 const confirmedAuthorization = !!s.profile.authorizationConfirmedAt && Number.isFinite(Date.parse(s.profile.authorizationConfirmedAt));
 if (confirmedAuthorization && typeof s.profile.authorizationNow === 'boolean'
   && /^(?:are you|do you) (?:currently |legally |lawfully )?(?:authorized|eligible) to work (?:lawfully )?(?:in|within) (?:the )?(?:united states(?: of america)?|u\.?s\.?a?\.?)(?:\s*\(yes\/no\))?\??$/i.test(label)) answer = choice(s.profile.authorizationNow);
 else if (confirmedAuthorization && typeof s.profile.futureSponsorship === 'boolean'
   && /\b(?:now,? or in (?:the )?future|at any (?:point|time))\b/i.test(label)
   && /^(?:will|do) you (?:(?:now,? or in (?:the )?future|at any (?:point|time)) )?(?:require|need) (?:(?:employment|work|visa|immigration) )?(?:visa )?sponsorship(?: for (?:employment(?: visa status)?|work(?: authorization)?|immigration(?: status)?|visa status)| to work in (?:the )?(?:united states|u\.?s\.?a?\.?))?(?: (?:now,? or in (?:the )?future|at any (?:point|time)))?(?: \(e\.g\.,? h-?1b(?: visa status)?\))?\??$/i.test(label)) answer = choice(s.profile.futureSponsorship);
 else if (/^(?:are you (?:open|willing) to relocat(?:e|ion)|would you be (?:open|willing) to relocate)\??$/i.test(label)) answer = savedChoice(['Are you open to relocation?', 'Are you willing to relocate?']);
 else if (/^(?:are you (?:willing|open) to (?:work|be|working)|would you be (?:open|willing) to work) (?:in[- ]office|in[- ]person|on[- ]?site)\??$/i.test(label)) answer = savedChoice(['Are you willing to work on site?', 'Are you willing to work onsite?']);
 else if (/^(?:phone country code|country \(phone dialing code\))$/i.test(label) && /^\+\d{1,3}$/.test(saved('Country (phone dialing code)') || '')) answer = saved('Country (phone dialing code)')!;
 else if (/^(?:city|what city do you live in\?)$/i.test(label) && saved('Location (City)')?.includes(',')) answer = saved('Location (City)')!.split(',')[0].trim();
 else if (/^(?:city|current city|city of residence)$/i.test(label)) answer = saved('City');
 else if (/^(?:state|state\/province|state or province|province)$/i.test(label)) answer = saved('State');
 else if (/^(?:zip|zip code|postal code|zip\/postal code)$/i.test(label)) answer = saved('Postal Code');
 else if (/^(?:school|university|school or university|college|college or university)$/i.test(label)) answer = saved('School or University');
 else if (/^(?:degree|degree earned|degree type|highest degree)$/i.test(label)) answer = saved('Degree');
 else if (/^(?:major|field of study|discipline)$/i.test(label)) answer = saved('Discipline');
 else if (/^(?:gpa|overall gpa)$/i.test(label)) answer = saved('GPA:');
 else if (/^(?:are you willing to travel(?: for work)?|are you open to travel|willing to travel)\??$/i.test(label)) answer = savedChoice(['Are you willing to travel for work?']);
 else if (/^(?:year of graduation|what is your expected graduation year\?)\s*$/i.test(label) && /^\d{4}-\d{2}$/.test(s.profile.graduation)) answer = s.profile.graduation.slice(0, 4);
 if (!answer || (q.options?.length && !q.options.includes(answer))) return null;
 return { questionId: q.id, question: q.label, answer, factIds, confirmed: true };
}
function generateAnswers(s: AppState, job: Job): Answer[] {
 return job.questions.flatMap(q => {
  if (isFileQuestion(q.type)) return [];
  // Plain contact fields follow the current profile; older saved answers cannot override an edit.
  const contact = coreContactAnswer(s, q);
  if (contact) return contact.answer.trim() && (!q.options?.length || q.options.includes(contact.answer)) ? [contact] : [];
  const saved = exactSaved(s, q.label);
  if (saved && answerShapeMatchesField(q.id, q.label, saved.answer) && reusableSelfIdentificationChoice(q, saved.answer) && (!q.options?.length || q.options.includes(saved.answer))) return [{ questionId: q.id, question: q.label, answer: saved.answer, factIds: [], confirmed: true }];
  const confirmed = confirmedProfileAnswer(s, q);
  if (confirmed) return [confirmed];
  const label = q.label.trim().toLowerCase();
  let answer = '';
  if (linkedinQuestion.test(label)) { answer = s.profile.linkedin; }
  else if (githubQuestion.test(label)) { answer = s.profile.github; }
  if (!answer) return [];
  return [{ questionId: q.id, question: q.label, answer, factIds: [], confirmed: true }];
 });
}
function fillConfirmedAnswers(s: AppState, p: ApplicationPacket, job: Job): void {
 const generated = generateAnswers(s, job);
 for (const answer of generated) {
  const existing = p.answers.find(item => item.questionId === answer.questionId);
  if (!existing) p.answers.push(answer);
  else if (!existing.answer.trim() || !supportedAnswer(s, existing, job.questions.find(q => q.id === answer.questionId)!)) Object.assign(existing, answer);
 }
}
function supportedAnswer(s: AppState, answer: Answer, question: FormQuestion): boolean {
 if (!answer.confirmed || !answer.answer.trim()) return false;
 if (!reusableSelfIdentificationChoice(question, answer.answer)) return false;
 const contact = coreContactAnswer(s, { id: answer.questionId, label: answer.question, required: true, type: 'text' });
 if (contact) return contact.confirmed && contact.answer === answer.answer;
 if (answerShapeMatchesField(answer.questionId, answer.question, answer.answer) && exactSaved(s, answer.question, answer.answer)) return true;
 const derived = confirmedProfileAnswer(s, { id: answer.questionId, label: answer.question, required: true, type: 'text' });
 if (derived?.answer.trim().toLowerCase() === answer.answer.trim().toLowerCase()) return true;
 if (/authoriz|sponsor|visa|citizen|gender|ethnic|race\b|racial|hispanic|latino|sexual orientation|transgender|veteran|disabil|\bage\b|18 years|(?:currently|presently) (?:a )?(?:full.time )?student|pronoun|licens|registr|credential|certif|clearance|export|criminal|convict|felon|misdemeanor|background|disciplin|bond|lien|judg/i.test(answer.question)) return false;
 if (/^(?:legal|preferred) (?:first |last )?name$/i.test(answer.question.trim().replace(/\s*\*$/, ''))) return false;
 if (linkedinQuestion.test(answer.question.trim()) && answer.answer === s.profile.linkedin) return true;
 if (githubQuestion.test(answer.question.trim()) && answer.answer === s.profile.github) return true;
 if (s.settings.applicationPreferences?.writtenAnswers !== 'draft' && s.settings.applicationPreferences) return false;
 return answer.factIds.length > 0 && answer.factIds.every(id => s.profile.facts.some(f => f.id === id && f.confirmed && !!f.source));
}
function unresolved(s: AppState, p: ApplicationPacket, job: Job, now = new Date()): string[] {
 const problems: string[] = eligibilityReasons(job, now, s.profile, s.settings).map(reason => `Eligibility: ${reason}`);
 if (priorMatches(s, job).length) problems.push('Prior application: Sourced history already records an application for this role');
 problems.push(...priorReviewReasons(s, job));
 problems.push(...compensationEligibilityReasons(job, s.settings.minimumAnnualCompensation ?? null, s.settings.compensationBasis ?? 'base'), ...attachmentProblems(s, p, job));
 if (!job.formInspectedAt || !job.formVersion) problems.push('Form review pending: inspect all application questions');
 if (p.formVersion !== job.formVersion) problems.push('Application form changed; review the current questions');
 const questionIds = new Set(job.questions.map(q => q.id));
 if (new Set(p.answers.map(a => a.questionId)).size !== p.answers.length) problems.push('Duplicate answers must be removed');
 for (const a of p.answers) {
  const q = job.questions.find(q => q.id === a.questionId);
  if (!questionIds.has(a.questionId) || q?.label !== a.question) problems.push(`Answer no longer matches current form: ${a.question}`);
  else if (a.answer.trim() && !supportedAnswer(s, a, q!)) problems.push(`Confirm a sourced or saved exact answer: ${a.question}`);
  else if (a.answer.trim() && q.options?.length && !q.options.includes(a.answer)) problems.push(`Choose an available option: ${q.label}`);
 }
 for (const q of job.questions.filter(q => q.required)) {
  if (isFileQuestion(q.type) && /resume|résumé|\bcv\b/i.test(q.label)) continue;
  if (/cover\s*letter/i.test(q.label) && p.coverLetter.trim()) continue;
  if (isFileQuestion(q.type)) {
   const attachment = p.attachments?.find(a => a.questionId === q.id); const document = s.profile.documents?.find(d => d.id === attachment?.documentId);
   if (attachment && document && documentAccepted(document, q) && attachment.sha256 === document.sha256 && documentValid(document)) continue;
   problems.push(`Required attachment needs manual handling: ${q.label}`); continue;
  }
  if (!p.answers.some(a => a.questionId === q.id && a.answer.trim() && supportedAnswer(s, a, q))) problems.push(`Required answer missing or unconfirmed: ${q.label}`);
 }
 return [...new Set(problems)];
}
function refreshPacket(s: AppState, p: ApplicationPacket, now: Date, extra?: string[]): void {
 const job = getJob(s, p.jobId);
 const persistent = extra ?? p.unresolved.filter(x => !/^(Eligibility:|Compensation:|Prior application:|Prior application review:|Attachment:|Form review pending:|Application form changed;|Duplicate answers|Answer no longer matches current form:|Confirm a sourced or saved exact answer:|Choose an available option:|Required attachment needs manual handling:|Required answer missing or unconfirmed:)/.test(x));
 p.unresolved = [...new Set([...unresolved(s, p, job, now), ...persistent])];
 p.contentHash = packetHash(s, p, job);
 if (!protectedStatuses.has(p.status)) p.status = p.unresolved.length ? 'needs_input' : 'ready';
 p.updatedAt = now.toISOString();
}
function requireEligible(job: Job, now: Date, profile: CandidateProfile, settings: Settings): void { const problems = eligibilityReasons(job, now, profile, settings); if (problems.length) throw new AgentError(`Job is not eligible: ${problems.join('; ')}`); }
function requireApplicationPolicy(s: AppState, job: Job): void {
 if (!s.settings.careerStage && s.profile.graduation !== '2027-06') throw new AgentError('Automated preparation currently supports June 2027 graduation. Confirm your actual date; other cohorts need manual review and updated matching rules.');
 if (priorMatches(s, job).length) throw new AgentError('A prior application is already recorded for this role; do not apply again');
 const reviews = priorReviewReasons(s, job); if (reviews.length) throw new AgentError(reviews.join('; '));
 const problems = compensationEligibilityReasons(job, s.settings.minimumAnnualCompensation ?? null, s.settings.compensationBasis ?? 'base');
 if (problems.length) throw new AgentError(problems.join('; '));
}

function validateProfilePatch(s: AppState, patch: Partial<CandidateProfile>): void {
 if (patch.resume && digest(patch.resume) !== digest(s.profile.resume)) throw new AgentError('The supplied résumé is locked and cannot be replaced through profile edits');
 if (s.attempts.some(a => a.outcome === 'in_progress')) throw new AgentError('Finish or recover the active submission before editing the candidate profile');
 if (patch.documents) {
  if (new Set(patch.documents.map(d => d.id)).size !== patch.documents.length) throw new AgentError('Registered document IDs must be unique', 400);
  for (const document of patch.documents) if (!documentValid(document)) throw new AgentError(`Document ${document.label} is missing, empty, or does not match its SHA256`);
 }
}
function applyProfilePatch(s: AppState, patch: Partial<CandidateProfile>): void {
 s.profile = { ...s.profile, ...structuredClone(patch), resume: s.profile.resume };
 // Explicit contact edits are user-confirmed inputs, including on a blank new profile.
 for (const [key, label] of [['name', 'Full name'], ['email', 'Email'], ['phone', 'Phone']] as const) {
  if (patch[key] === undefined) continue;
  s.profile.facts = s.profile.facts.filter(fact => fact.id !== key);
  if (patch[key]!.trim()) s.profile.facts.push({ id: key, label, value: patch[key]!, source: 'user:confirmed-profile', confirmed: true });
 }
}
function settingsPolicyChanged(s: AppState, patch: Partial<Settings>): boolean {
 return patch.careerStage !== undefined || patch.yearsExperience !== undefined || patch.rolePriority !== undefined || patch.roleKeywords !== undefined || (patch.minimumAnnualCompensation !== undefined && patch.minimumAnnualCompensation !== (s.settings.minimumAnnualCompensation ?? null)) || (patch.compensationBasis !== undefined && patch.compensationBasis !== (s.settings.compensationBasis ?? 'base'));
}
function validateSettingsPatch(s: AppState, patch: Partial<Settings>): void {
 const preferences = patch.applicationPreferences;
 if (preferences) {
  if (!Number.isFinite(Date.parse(preferences.confirmedAt))) throw new AgentError('Confirm application preferences on the dashboard', 400);
  if (preferences.submission === 'automatic' && !preferences.automaticRiskAccepted) throw new AgentError('Accept the automatic submission risk before saving this choice', 400);
  if (preferences.submission !== 'automatic' && preferences.automaticRiskAccepted) throw new AgentError('Risk acceptance applies only to automatic submission', 400);
  if (preferences.submission === 'automatic' && (preferences.formFilling !== 'agent' || preferences.writtenAnswers === 'self')) throw new AgentError('Automatic submission requires agent form filling and agent-prepared answers', 400);
  if (s.attempts.some(a => a.outcome === 'in_progress')) throw new AgentError('Finish the active submission before changing application preferences');
 }
 if (patch.backend && patch.backend !== s.settings.backend) throw new AgentError('Changing storage requires an explicit export/import and server restart');
 if (patch.timezone && patch.timezone !== 'America/Chicago') throw new AgentError('The daily ledger is fixed to America/Chicago');
 if (patch.dailyLimit !== undefined && (!Number.isInteger(patch.dailyLimit) || patch.dailyLimit < 1 || patch.dailyLimit > 20)) throw new AgentError('Daily preparation limit must be between 1 and 20', 400);
 if (patch.minimumAnnualCompensation !== undefined && patch.minimumAnnualCompensation !== null && (!Number.isFinite(patch.minimumAnnualCompensation) || patch.minimumAnnualCompensation < 0 || patch.minimumAnnualCompensation > 10_000_000)) throw new AgentError('Minimum annual compensation must be a nonnegative annual USD amount', 400);
 if (patch.rolePriority && (new Set(patch.rolePriority).size !== patch.rolePriority.length || patch.rolePriority.some(role => !roleFamilies.includes(role)))) throw new AgentError('Choose distinct supported career tracks', 400);
 if (patch.roleKeywords && (patch.roleKeywords.length > 30 || patch.roleKeywords.some(term => typeof term !== 'string' || !term.trim() || term.length > 100))) throw new AgentError('Choose up to 30 role title terms', 400);
 if (patch.preferredLocations && (patch.preferredLocations.length > 30 || patch.preferredLocations.some(location => typeof location !== 'string' || !location.trim() || location.length > 200))) throw new AgentError('Choose up to 30 preferred locations', 400);
 if (patch.targetEmployers && (patch.targetEmployers.length > 30 || patch.targetEmployers.some(employer => typeof employer !== 'string' || !employer.trim() || employer.length > 200))) throw new AgentError('Choose up to 30 employers to prioritize', 400);
 if (patch.preferredCareerSites && (patch.preferredCareerSites.length > 20 || patch.preferredCareerSites.some(site => { try { const url = new URL(site); return url.protocol !== 'https:' || !!url.username || !!url.password || !!url.hash || site.length > 500; } catch { return true; } }))) throw new AgentError('Choose up to 20 HTTPS career page URLs without credentials or fragments', 400);
 if (patch.workplacePreference !== undefined && !['any', 'remote', 'hybrid', 'onsite'].includes(patch.workplacePreference)) throw new AgentError('Choose a supported workplace preference', 400);
 if (patch.careerStage !== undefined && !['new_grad','early_career','experienced'].includes(patch.careerStage)) throw new AgentError('Choose a supported experience level', 400);
 if (patch.yearsExperience !== undefined && patch.yearsExperience !== null && (!Number.isFinite(patch.yearsExperience) || patch.yearsExperience < 0 || patch.yearsExperience > 60)) throw new AgentError('Years of experience must be between 0 and 60', 400);
 if ((patch.careerStage ?? s.settings.careerStage) === 'experienced' && (patch.yearsExperience === undefined ? s.settings.yearsExperience : patch.yearsExperience) == null) throw new AgentError('Enter years of experience for experienced roles', 400);
 if (patch.careerTargetsConfirmed === true && (!(patch.careerStage ?? s.settings.careerStage) || (!(patch.rolePriority ?? s.settings.rolePriority).length && !(patch.roleKeywords ?? s.settings.roleKeywords)?.length))) throw new AgentError('Choose an experience level and at least one career path or title term', 400);
 if (settingsPolicyChanged(s, patch) && s.attempts.some(a => a.outcome === 'in_progress')) throw new AgentError('Finish or recover the active submission before changing compensation requirements');
}
function refreshPendingPackets(s: AppState, current: Date, fillAnswers = false): void {
 s.jobs = s.jobs.map(job => applyPriorApplicationPolicy(s, applyCandidatePolicy(applyCompensationPolicy(job, s.settings), s, current)));
 for (const p of s.packets.filter(p => !protectedStatuses.has(p.status))) {
  revoke(s, p, current.toISOString()); p.version++;
  if (fillAnswers) fillConfirmedAnswers(s, p, getJob(s, p.jobId));
  refreshPacket(s, p, current);
 }
}

export function createEngine(store: Store, options: { workspace?: string; now?: () => Date } = {}) {
 const now = options.now ?? (() => new Date());
 return {
  async snapshot(): Promise<AppSnapshot> {
   const state = await store.read(); state.jobs = state.jobs.map(job => applyPriorApplicationPolicy(state, applyCandidatePolicy(job, state, now()))); const current = now(); const today = dateKey(current, state.settings.timezone);
   const preparedToday = state.preparationLedger.filter(l => l.day === today).length;
   const manualLimitToday = Math.max(state.settings.dailyLimit, ...(state.manualPreparationAllowances ?? []).filter(allowance => allowance.day === today).map(allowance => allowance.limit));
   const successful = state.runs.filter(r => r.status === 'complete').sort((a, b) => b.startedAt.localeCompare(a.startedAt));
   return { ...state, meta: { backend: state.settings.backend, preparedToday, remainingToday: Math.max(0, state.settings.dailyLimit - preparedToday), manualLimitToday, manualRemainingToday: Math.max(0, manualLimitToday - preparedToday), lastSuccessfulRun: successful[0]?.finishedAt ?? null,
    catchUpDue: clockTime(current, state.settings.timezone) >= state.settings.scheduleTime && !state.runs.some(r => r.day === today && (r.status === 'complete' || (r.status === 'running' && isFresh(r.startedAt, current, 0.5)))),
    appliedJobIds: state.jobs.filter(job => priorMatches(state, job).length > 0 || state.attempts.some(a => a.jobId === job.id && a.outcome === 'submitted')).map(job => job.id), resumeValid: resumeValid(state.profile), workspace: options.workspace ?? process.cwd(), salaryAssessments: Object.fromEntries(state.jobs.map(job => [job.id, assessCompensation(job, state.settings.minimumAnnualCompensation ?? null, state.settings.compensationBasis ?? 'base')])) } };
  },
  async upsertJob(input: Job): Promise<Job> {
   return store.update(s => {
    const incoming = applyPriorApplicationPolicy(s, applyCandidatePolicy(applyCompensationPolicy(structuredClone(input), s.settings), s, now())); const existing = s.jobs.find(j => sameJob(j, incoming));
    if (!incoming.company.trim() || !incoming.title.trim()) throw new AgentError('Job company and title are required', 400);
    if (existing) {
     incoming.id = existing.id;
     const unchanged = incoming.description === existing.description && incoming.applyUrl === existing.applyUrl;
     if (!incoming.formInspectedAt && unchanged && existing.formInspectedAt) { incoming.questions = existing.questions; incoming.formInspectedAt = existing.formInspectedAt; }
     if (!unchanged && incoming.formInspectedAt === existing.formInspectedAt) { incoming.questions = []; incoming.formInspectedAt = null; }
    }
    incoming.formVersion = formVersion(incoming);
    if (new Set(incoming.questions.map(q => q.id)).size !== incoming.questions.length) throw new AgentError('Form question IDs must be unique', 400);
    if (existing) s.jobs[s.jobs.indexOf(existing)] = incoming; else s.jobs.push(incoming);
    const packet = s.packets.find(p => p.jobId === incoming.id);
    if (packet && !protectedStatuses.has(packet.status)) {
     const hash = packetHash(s, packet, incoming);
     if (hash !== packet.contentHash || packet.formVersion !== incoming.formVersion || eligibilityReasons(incoming, now(), s.profile, s.settings).length) {
      revoke(s, packet, now().toISOString()); refreshPacket(s, packet, now());
     }
    }
    return incoming;
   });
  },
  async grantManualPreparationAllowance(input: { limit: number; reason: string }): Promise<ManualPreparationAllowance> {
   if (!Number.isInteger(input.limit) || input.limit < 21 || input.limit > 50 || typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.trim().length > 5000) throw new AgentError('A manual allowance requires a limit from 21 to 50 and the explicit user request as its reason', 400);
   return store.update(s => {
    const current = now(); const day = dateKey(current, s.settings.timezone); const reason = input.reason.trim();
    const allowances = s.manualPreparationAllowances ?? (s.manualPreparationAllowances = []);
    const existing = allowances.find(allowance => allowance.day === day && allowance.limit === input.limit && allowance.reason === reason);
    if (existing) return existing;
    const allowance: ManualPreparationAllowance = { id: randomUUID(), day, limit: input.limit, reason, authorizedAt: current.toISOString() };
    allowances.push(allowance); return allowance;
   });
  },
  async prepare(jobId: string, draft: PacketDraft = {}, preparation: { manualAllowanceId?: string } = {}): Promise<ApplicationPacket> {
   return store.update(s => {
    const current = now(); const job = getJob(s, jobId); requireApplicationPolicy(s, job); requireEligible(job, current, s.profile, s.settings); requireResume(s);
    const existing = s.packets.find(p => p.jobId === jobId); if (existing) return existing;
    if (s.attempts.some(a => sameJob(getJob(s, a.jobId), job) && ['submitted', 'in_progress', 'unknown'].includes(a.outcome))) throw new AgentError('Job already has a submitted or unresolved application');
    const day = dateKey(current, s.settings.timezone);
    const allowance = preparation.manualAllowanceId ? s.manualPreparationAllowances?.find(allowance => allowance.id === preparation.manualAllowanceId && allowance.day === day) : undefined;
    if (preparation.manualAllowanceId && !allowance) throw new AgentError('Manual preparation requires an explicit allowance for today in America/Chicago');
    const limit = allowance?.limit ?? s.settings.dailyLimit;
    if (s.preparationLedger.filter(l => l.day === day).length >= limit) throw new AgentError(allowance ? 'Manual preparation allowance limit reached' : 'Daily preparation limit reached');
    const timestamp = current.toISOString();
    const packet: ApplicationPacket = { id: randomUUID(), jobId, createdAt: timestamp, updatedAt: timestamp, version: 1, status: 'draft', resumeHash: s.profile.resume.sha256, formVersion: job.formVersion, answers: draft.answers ?? generateAnswers(s, job), coverLetter: draft.coverLetter ?? '', unresolved: [], notes: draft.notes ?? '', contentHash: '', approvalId: null, attachments: structuredClone(draft.attachments ?? []) };
    refreshPacket(s, packet, current, draft.unresolved);
    s.packets.push(packet); s.preparationLedger.push({ packetId: packet.id, jobId, day, ...(allowance ? { manualAllowanceId: allowance.id } : {}) }); return packet;
   });
  },
  async editPacket(packetId: string, draft: PacketDraft): Promise<ApplicationPacket> {
   return store.update(s => {
    const packet = getPacket(s, packetId); if (protectedStatuses.has(packet.status)) throw new AgentError('Cannot edit a submitted or unresolved submission packet');
    revoke(s, packet, now().toISOString());
    if (draft.answers !== undefined) packet.answers = structuredClone(draft.answers);
    if (draft.coverLetter !== undefined) packet.coverLetter = draft.coverLetter;
    if (draft.notes !== undefined) packet.notes = draft.notes;
    if (draft.attachments !== undefined) packet.attachments = structuredClone(draft.attachments);
    packet.version++; packet.formVersion = getJob(s, packet.jobId).formVersion; packet.resumeHash = s.profile.resume.sha256;
    refreshPacket(s, packet, now(), draft.unresolved); return packet;
   });
  },
  async approve(packetIds: string[]): Promise<{ batchId: string; packetIds: string[]; prompt: string }> {
   return store.update(s => {
    if (s.settings.applicationPreferences && s.settings.applicationPreferences.submission !== 'review') throw new AgentError('Choose dashboard approval mode before approving a batch');
    if (!packetIds.length || new Set(packetIds).size !== packetIds.length) throw new AgentError('Select one or more distinct packets', 400);
    requireResume(s); const batchId = randomUUID(); const approvedAt = now().toISOString();
    for (const id of packetIds) {
     const p = getPacket(s, id); const j = getJob(s, p.jobId); requireApplicationPolicy(s, j); requireEligible(j, now(), s.profile, s.settings); requireAttachments(s, p, j);
     if (protectedStatuses.has(p.status)) throw new AgentError('Cannot approve a submitted or unresolved packet');
     const problems = [...new Set([...p.unresolved, ...unresolved(s, p, j, now())])];
     if (problems.length) throw new AgentError(`Packet needs input: ${problems.join('; ')}`);
     if (p.resumeHash !== s.profile.resume.sha256) throw new AgentError('Packet résumé version is stale');
     if (!isFresh(j.formInspectedAt, now(), 24)) throw new AgentError('Reinspect the application form before approval; last inspection is older than 24 hours');
     revoke(s, p, approvedAt); p.contentHash = packetHash(s, p, j);
     const approval = { id: randomUUID(), batchId, packetId: id, packetHash: p.contentHash, resumeHash: p.resumeHash, formVersion: j.formVersion!, approvedAt, revokedAt: null };
     s.approvals.push(approval); p.approvalId = approval.id; p.status = 'approved'; p.updatedAt = approvedAt;
    }
    return { batchId, packetIds, prompt: `Use the job-application-agent skill to submit approved batch ${batchId}. Recheck each live form and posting, submit only the exact approved packets, record attempts before clicking Submit, and retain confirmation evidence. Hand off login, CAPTCHA, changed questions, and unsupported forms.` };
   });
  },
  async beginSubmission(packetId: string): Promise<SubmissionAttempt> {
   return store.update(s => {
    const p = getPacket(s, packetId); const j = getJob(s, p.jobId); requireApplicationPolicy(s, j); requireResume(s); requireEligible(j, now(), s.profile, s.settings); requireAttachments(s, p, j);
    if (!isFresh(j.fetchedAt, now(), 24) || !isFresh(j.formInspectedAt, now(), 24)) throw new AgentError('Recheck the open posting and live application form within 24 hours before submitting');
    if (s.attempts.some(a => a.outcome === 'in_progress')) throw new AgentError('Another submission is in progress; reconcile it before starting another');
    if (s.attempts.some(a => sameJob(getJob(s, a.jobId), j) && ['submitted', 'unknown'].includes(a.outcome))) throw new AgentError('Existing submitted or unknown outcome must be reconciled; do not retry');
    const preferences = s.settings.applicationPreferences;
    if (preferences?.submission === 'self') throw new AgentError('The candidate chose to submit applications themselves');
    const automatic = preferences?.submission === 'automatic' && preferences.automaticRiskAccepted && preferences.formFilling === 'agent' && preferences.writtenAnswers !== 'self';
    const approval = s.approvals.find(a => a.id === p.approvalId && !a.revokedAt);
    const exactApproval = p.status === 'approved' && approval && approval.packetHash === packetHash(s, p, j) && approval.resumeHash === s.profile.resume.sha256 && approval.formVersion === j.formVersion;
    const exactAutomatic = automatic && p.status === 'ready' && p.contentHash === packetHash(s, p, j) && !p.approvalId;
    if (!(automatic ? exactAutomatic : exactApproval) || p.formVersion !== j.formVersion || p.unresolved.length || unresolved(s, p, j, now()).length) throw new AgentError(automatic ? 'A current, complete, unchanged packet and inspected form are required for automatic submission' : 'A current approval for the exact packet, profile, résumé, and form is required');
    const attempt: SubmissionAttempt = { id: randomUUID(), packetId, jobId: j.id, batchId: automatic ? `automatic:${now().toISOString().slice(0, 10)}` : approval!.batchId, startedAt: now().toISOString(), finishedAt: null, outcome: 'in_progress', evidence: '', confirmationUrl: null };
    s.attempts.push(attempt); p.status = 'submitting'; return attempt;
   });
  },
  async finishSubmission(attemptId: string, outcome: Exclude<SubmissionAttempt['outcome'], 'in_progress'>, evidence: string, confirmationUrl: string | null = null): Promise<SubmissionAttempt> {
   return store.update(s => {
    const attempt = s.attempts.find(a => a.id === attemptId); if (!attempt) throw new AgentError('Attempt not found', 404);
    if (attempt.outcome !== 'in_progress') throw new AgentError('Attempt is already finished; unknown outcomes require reconciliation');
    if (!['submitted', 'failed', 'unknown', 'handoff'].includes(outcome)) throw new AgentError('Invalid attempt outcome', 400);
    if (evidence.trim().length < (outcome === 'submitted' ? 15 : 5)) throw new AgentError('Record specific confirmation or failure evidence', 400);
    if (confirmationUrl && !httpUrl(confirmationUrl)) throw new AgentError('Confirmation URL must be HTTP(S)', 400);
    attempt.outcome = outcome; attempt.evidence = evidence; attempt.confirmationUrl = confirmationUrl; attempt.finishedAt = now().toISOString();
    const p = getPacket(s, attempt.packetId); p.status = outcome; p.updatedAt = attempt.finishedAt; revoke(s, p, attempt.finishedAt); return attempt;
   });
  },
  async recoverInterrupted(attemptId: string, evidence: string): Promise<SubmissionAttempt> {
   return store.update(s => {
    const a = s.attempts.find(a => a.id === attemptId); if (!a || a.outcome !== 'in_progress') throw new AgentError('Only an in-progress attempt can be recovered');
    if (evidence.trim().length < 5) throw new AgentError('Describe why the interrupted outcome is uncertain', 400);
    a.outcome = 'unknown'; a.evidence = evidence; a.finishedAt = now().toISOString(); const p = getPacket(s, a.packetId); p.status = 'unknown'; revoke(s, p, a.finishedAt); return a;
   });
  },
  async recordHandoff(packetId: string, evidence: string): Promise<SubmissionAttempt> {
   return store.update(s => {
    const p = getPacket(s, packetId);
    if (protectedStatuses.has(p.status) || s.attempts.some(a => a.packetId === packetId && ['in_progress', 'submitted', 'unknown'].includes(a.outcome))) throw new AgentError('Cannot hand off a submitted or unresolved submission; record or reconcile its actual outcome first');
    if (evidence.trim().length < 5) throw new AgentError('Describe the required manual action', 400);
    const previous = [...s.attempts].reverse().find(a => a.packetId === packetId);
    if (p.status === 'handoff' && previous?.outcome === 'handoff' && previous.evidence === evidence) return previous;
    const timestamp = now().toISOString();
    const approval = s.approvals.find(a => a.id === p.approvalId && !a.revokedAt);
    const attempt: SubmissionAttempt = { id: randomUUID(), packetId, jobId: p.jobId, batchId: approval?.batchId ?? 'manual-handoff', startedAt: timestamp, finishedAt: timestamp, outcome: 'handoff', evidence, confirmationUrl: null };
    s.attempts.push(attempt); p.status = 'handoff'; p.updatedAt = timestamp; revoke(s, p, timestamp); return attempt;
   });
  },
  async reconcile(attemptId: string, outcome: 'submitted' | 'failed', evidence: string, confirmationUrl: string | null = null): Promise<SubmissionAttempt> {
   return store.update(s => {
    const a = s.attempts.find(a => a.id === attemptId); if (!a || a.outcome !== 'unknown') throw new AgentError('Only an unknown outcome may be reconciled');
    if (!['submitted', 'failed'].includes(outcome) || evidence.trim().length < 15) throw new AgentError('Reconciliation requires specific evidence of submission or non-submission', 400);
    if (confirmationUrl && !httpUrl(confirmationUrl)) throw new AgentError('Confirmation URL must be HTTP(S)', 400);
    a.outcome = outcome; a.evidence += `\nReconciled ${now().toISOString()}: ${evidence}`; a.confirmationUrl = confirmationUrl; a.finishedAt = now().toISOString();
    const p = getPacket(s, a.packetId); p.status = outcome; p.updatedAt = a.finishedAt; revoke(s, p, a.finishedAt); return a;
   });
  },
  async replaceResume(resume: CandidateProfile['resume'], expectedPreviousHash: string) {
   return store.update(s => {
    if (s.attempts.some(a => ['in_progress', 'unknown'].includes(a.outcome)) || s.packets.some(p => ['submitting', 'unknown'].includes(p.status))) throw new AgentError('Finish or reconcile unresolved submissions before replacing the résumé');
    if (s.profile.resume.sha256 !== expectedPreviousHash) throw new AgentError('The active résumé changed during replacement. Review the current résumé before retrying.');
    try { verifiedResumeBytes(resume); } catch { throw new AgentError('The new résumé must be an unchanged, complete PDF matching its SHA256'); }
    const previousResume = structuredClone(s.profile.resume);
    if (resume.sha256 === previousResume.sha256 && resumeValid(s.profile)) return { changed: false, resume: previousResume, previousResume, updatedPacketIds: [] as string[] };
    s.profile.resume = structuredClone(resume);
    const current = now(); const updatedPacketIds: string[] = [];
    for (const p of s.packets.filter(p => !protectedStatuses.has(p.status))) {
     revoke(s, p, current.toISOString()); p.resumeHash = resume.sha256; p.version++;
     refreshPacket(s, p, current); updatedPacketIds.push(p.id);
    }
    return { changed: true, resume: structuredClone(resume), previousResume, updatedPacketIds };
   });
  },
  async updateProfile(patch: Partial<CandidateProfile>): Promise<CandidateProfile> {
   return store.update(s => {
    validateProfilePatch(s, patch); applyProfilePatch(s, patch); refreshPendingPackets(s, now(), true);
    return s.profile;
   });
  },
  async addDocument(document: CandidateDocument): Promise<CandidateDocument> {
   return store.update(s => {
    const existing = s.profile.documents?.find(item => item.kind === document.kind && item.sha256 === document.sha256);
    if (existing) {
     if (!documentValid(existing)) throw new AgentError('The saved document copy is missing or changed');
     return existing;
    }
    const patch = { documents: [...(s.profile.documents || []), document] };
    validateProfilePatch(s, patch); applyProfilePatch(s, patch); refreshPendingPackets(s, now(), true);
    return document;
   });
  },
  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
   return store.update(s => {
    validateSettingsPatch(s, patch); const changedPolicy = settingsPolicyChanged(s, patch) || patch.applicationPreferences !== undefined;
    s.settings = { ...s.settings, ...structuredClone(patch) };
    if (changedPolicy) refreshPendingPackets(s, now());
    return s.settings;
   });
  },
  async updateOnboarding(input: { profile: Partial<CandidateProfile>; settings: Partial<Settings> }): Promise<{ profile: CandidateProfile; settings: Settings }> {
   return store.update(s => {
    validateProfilePatch(s, input.profile); validateSettingsPatch(s, input.settings);
    applyProfilePatch(s, input.profile); s.settings = { ...s.settings, ...structuredClone(input.settings) };
    refreshPendingPackets(s, now(), true);
    return { profile: s.profile, settings: s.settings };
   });
  },
  async markAlreadyApplied(jobId: string): Promise<PriorApplication> {
   const state = await store.read(); const job = getJob(state, jobId);
   return this.recordPriorApplication({
    id: `dashboard-applied:${job.id}`, company: job.company, title: job.title,
    jobUrl: job.applyUrl || job.sourceUrl || null, postingId: job.postingId || null,
    source: 'user', sourceRef: `dashboard:already-applied:${job.id}`,
    evidence: 'User marked this exact role as already applied in the dashboard.',
    appliedAt: null, checkedAt: now().toISOString(), matchScope: 'exact_role',
   });
  },
  async recordPriorApplication(input: PriorApplication): Promise<PriorApplication> {
   return store.update(s => {
    if (!input.id?.trim() || !input.company?.trim() || !input.title?.trim() || !input.sourceRef?.trim() || !input.evidence?.trim()) throw new AgentError('Prior application requires an ID, employer, exact role title, source reference, and evidence', 400);
    if ((input.jobUrl && !httpUrl(input.jobUrl)) || !Number.isFinite(Date.parse(input.checkedAt)) || (input.appliedAt && !Number.isFinite(Date.parse(input.appliedAt)))) throw new AgentError('Prior application URL or dates are invalid', 400);
    const history = s.priorApplications ?? (s.priorApplications = []);
    const { checkedAt: _checkedAt, ...identity } = input;
    const identical = history.find(record => { const { checkedAt: _oldCheckedAt, ...old } = record; return digest(old) === digest(identity); });
    if (identical) return identical;
    if (history.some(record => record.id === input.id)) throw new AgentError('Prior-application evidence is append-only. Use a new record ID for additional or corrected evidence.');
    const original = input.supersedesId ? history.find(record => record.id === input.supersedesId) : undefined;
    const record = structuredClone(input); history.push(record); validatePriorApplications(history);
    for (const job of s.jobs.filter(job => priorApplicationCandidateMatchesJob(record, job) || (original && priorApplicationCandidateMatchesJob(original, job)))) {
     Object.assign(job, applyPriorApplicationPolicy(s, job));
     for (const p of s.packets.filter(packet => packet.jobId === job.id)) { revoke(s, p, now().toISOString()); if (!protectedStatuses.has(p.status)) { p.version++; refreshPacket(s, p, now()); } }
    }
    return record;
   });
  },
  async upsertBoard(board: Board): Promise<Board> { return store.update(s => { const i = s.boards.findIndex(b => b.id === board.id); if (i < 0) s.boards.push(board); else s.boards[i] = board; return board; }); },
  async updateRun(run: DailyRun): Promise<DailyRun> { return store.update(s => { const i = s.runs.findIndex(r => r.id === run.id); if (i < 0) s.runs.push(run); else s.runs[i] = run; return run; }); },
 };
}
export type Engine = ReturnType<typeof createEngine>;
