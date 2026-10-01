import type { CandidateProfile, Job, Settings } from './types.js';

export const roleFamilies = ['product', 'data', 'finance', 'consulting', 'software', 'engineering', 'mechanical', 'marketing', 'sales', 'design', 'operations', 'other'] as const;
export const careerStageNames = { new_grad: 'New graduate', early_career: 'Early career (0–2 years)', experienced: 'Experienced' } as const;
export const careerPathNames = { product:'Product', data:'Data & analytics', finance:'Finance', consulting:'Consulting', software:'Software engineering (SWE)', engineering:'Other engineering', mechanical:'Mechanical engineering', marketing:'Marketing', sales:'Sales & business development', design:'Design', operations:'Operations', other:'Other careers' } as const;
export function sponsorshipNotRequired(profile?: CandidateProfile): boolean {
 return !!profile?.authorizationConfirmedAt && profile.authorizationAtStart === true && profile.futureSponsorship === false;
}
export function candidateRestrictions(job: Job, profile?: CandidateProfile): string[] {
 const reasons: string[] = [];
 if (profile?.authorizationConfirmedAt && profile.authorizationAtStart === false) reasons.push('Work authorization at the proposed start date needs resolution');
 const text = job.description;
 if (/(?:must|need to|requires?|only|limited to)\s+(?:be\s+)?(?:a\s+|an\s+)?(?:U\.?S\.?|United States)\s+citizen|(?:U\.?S\.?|United States)\s+citizenship\s+(?:is\s+)?required/i.test(text)
   && !(profile?.authorizationConfirmedAt && profile.usCitizen === true)) reasons.push('US citizenship requirement needs verification');
 if (/\bITAR\b|\bexport[ -]control(?:led)?\b|\bU\.?S\.? person\b/i.test(text)
   && !(profile?.authorizationConfirmedAt && profile.exportControlEligible === true)) reasons.push('Export-control eligibility needs verification');
 if (/\b(?:security clearance|secret clearance|top secret|TS\/SCI)\b/i.test(text)
   && !(profile?.authorizationConfirmedAt && profile.clearanceEligible === true)) reasons.push('Security-clearance eligibility needs verification');
 return reasons;
}
export function matchesTargets(job: Job, settings: Settings): boolean {
 return settings.rolePriority.includes(job.roleFamily)
  || (job.roleFamily === 'mechanical' && settings.rolePriority.includes('engineering'))
  || (settings.roleKeywords || []).some(term => job.title.toLowerCase().includes(term.toLowerCase()));
}
export function priorityRank(job: Job, settings: Settings): number {
 const rank = settings.rolePriority.indexOf(job.roleFamily);
 return rank < 0 ? settings.rolePriority.length : rank;
}
