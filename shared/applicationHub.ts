import type { AppSnapshot, CandidateProfile, Job } from './types';

export function financeRole(job: Job) {
 const employer = /\b(?:goldman|morgan stanley|blackrock|blackstone|apollo|ares|blue owl|oaktree|citi|citigroup|bank of america|jpmorgan|kkr|td securities|wells fargo|ubs|deutsche bank|barclays|evercore|lazard|jefferies|centerview|pjt|moelis|rothschild|capital one|bny|pimco|fidelity|vanguard|state street|brookfield|carlyle|bain capital|bessemer|neuberger|point72|millennium|bridgewater|cornerstone research|analysis group|nera|brattle|compass lexecon|charles river|bates white|oliver wyman|kearney|mckinsey|bain|bcg|deloitte|brg|mufg|optiver|old mission|squarepoint)\b/i;
 const role = /\b(?:investment|banking|wealth|private bank|asset management|economic consulting|governance)\b/i;
 return ((employer.test(job.company) && ['finance','consulting'].includes(job.roleFamily)) || role.test(job.title))
  && !/\b(?:quant(?:itative)?|software|developer|architect|data scien|machine learning|senior|vice president|director|manager|lead|MBA|intern(?:ship)?|co[ -]?op|contract|temporary)\b/i.test(job.title);
}
export function applicationGroup(job: Job, state: AppSnapshot): 'active' | 'research' | 'archived' | 'applied' {
 const prior = state.meta.appliedJobIds?.includes(job.id) ?? (state.priorApplications || []).some(a => a.matchScope !== 'needs_review' && a.company.toLowerCase() === job.company.toLowerCase() && (a.postingId && job.postingId ? a.postingId === job.postingId : a.title.toLowerCase() === job.title.toLowerCase()));
 if (prior || state.attempts.some(a => a.jobId === job.id && a.outcome === 'submitted')) return 'applied';
 if (job.dismissed || job.status === 'closed' || job.sponsorship.some(e => e.status === 'explicit_no')) return 'archived';
 // Eligible here means the tracker has passed its checks; history is still not a role-level guarantee.
 const pay = (state.meta as AppSnapshot['meta'] & { salaryAssessments?: Record<string, {status: string}> }).salaryAssessments?.[job.id]?.status;
 if ((state.settings.minimumAnnualCompensation || 0) > 0 && pay === 'below') return 'archived';
 const payVerified = !(state.settings.minimumAnnualCompensation || 0) || pay === 'meets';
 return job.eligible && job.status === 'open' && /2027/.test(job.title + ' ' + job.description) && payVerified ? 'active' : 'research';
}
export function helperProfile(profile: CandidateProfile) {
 const answer = (...questions: string[]) => profile.savedAnswers.find(a => a.confirmedAt && questions.includes(a.question))?.answer || '';
 return { version: 1, fields: {
  fullName: profile.name, firstName: answer('Legal First Name'), lastName: answer('Legal Last Name'),
  email: profile.email, phone: profile.phone, linkedin: profile.linkedin, github: profile.github,
  address: answer('Address Line 1', 'Street Address'), city: answer('City'), state: answer('State'), postalCode: answer('Postal Code'),
  school: answer('School or University'), degree: answer('Degree'), major: answer('Discipline'), gpa: answer('GPA:', 'Overall Result (GPA)'),
  sat: answer('What was your SAT score?'),
 } };
}
