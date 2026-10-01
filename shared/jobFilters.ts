import type { AppSnapshot, Job, SponsorshipStatus } from './types';

const normalizeSearch = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Terms may appear in any order. Quotes keep phrases together; a leading minus excludes a term. */
export function matchesJobSearch(job: Job, query: string) {
 const fields = [job.company, job.title, job.location, job.roleFamily].map(normalizeSearch);
 const terms = query.replace(/[“”]/g, '"').match(/-?"[^"]+"|-?[^\s"]+/g) || [];
 return terms.every(raw => {
  const excluded = raw.startsWith('-') && raw.length > 1;
  const term = normalizeSearch((excluded ? raw.slice(1) : raw).replace(/^"|"$/g, ''));
  if (!term) return true;
  const found = fields.some(field => field.includes(term));
  return excluded ? !found : found;
 });
}

export function jobDate(job: Job) {
 const value = Date.parse(job.postedAt || job.fetchedAt);
 return Number.isFinite(value) ? value : 0;
}

/** Employer history is evidence for research, never a role-level promise. */
export function sponsorshipCategory(job: Job, now = Date.now()): SponsorshipStatus {
 const entity = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
 const evidence = job.sponsorship.filter(e => {
  let validUrl = false;
  try { validUrl = ['http:', 'https:'].includes(new URL(e.sourceUrl).protocol); } catch {}
  const age = now - Date.parse(e.checkedAt);
  return e.entityMatch && entity(e.employerName) === entity(job.company) && validUrl && e.excerpt.trim() && age >= 0 && age <= (e.scope === 'role' ? 180 : 730) * 86400000;
 });
 if (evidence.some(e => e.status === 'explicit_no')) return 'explicit_no';
 if (evidence.some(e => e.status === 'explicit_yes' && e.scope === 'role')) return 'explicit_yes';
 if (evidence.some(e => e.status === 'history_only' && e.scope === 'employer')) return 'history_only';
 return 'unknown';
}
export interface JobFilters { company: string; location: string; sponsorship: string; pay: string }
export function matchesJobFilters(job: Job, state: AppSnapshot, filters: JobFilters) {
 const pay = state.meta.salaryAssessments?.[job.id];
 let payMatches = true;
 if (filters.pay === 'verified') payMatches = pay?.period === 'year' && pay.currency === 'USD' && pay.min != null && pay.basis !== 'unknown';
 else if (filters.pay !== 'all') payMatches = (pay?.status || 'unknown') === filters.pay && (filters.pay !== 'meets' || (state.settings.minimumAnnualCompensation ?? 0) > 0);
 return (filters.company === 'all' || job.company === filters.company)
  && (filters.location === 'all' || job.location === filters.location)
  && (filters.sponsorship === 'all' || sponsorshipCategory(job) === filters.sponsorship)
  && payMatches;
}
export function annualPay(job: Job, state: AppSnapshot) {
 const pay = state.meta.salaryAssessments?.[job.id];
 return pay?.period === 'year' && pay.currency === 'USD' && pay.basis !== 'unknown' ? pay.min ?? -1 : -1;
}
