import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/types.js';
import { assessCompensation, compensationEligibilityReasons } from '../server/compensation.js';

function job(description: string, patch: Partial<Job> = {}): Job {
  return { id: 'pay-test', source: 'greenhouse', board: 'example', postingId: '123', company: 'Example', title: 'Associate Product Manager, New Grad 2027', location: 'Chicago, IL, United States', description, sourceUrl: 'https://job-boards.greenhouse.io/example/jobs/123', applyUrl: 'https://job-boards.greenhouse.io/example/jobs/123', fetchedAt: '2026-09-28T12:00:00.000Z', postedAt: null, deadline: null, status: 'open', roleFamily: 'product', sponsorship: [], score: 0, fitReasons: [], concerns: [], eligible: true, eligibilityReasons: [], questions: [], formInspectedAt: null, formVersion: null, dismissed: false, ...patch };
}
const assess = (description: string, basis: 'base' | 'total' = 'base') => assessCompensation(job(description), 100_000, basis);

test('annual USD base range compares its floor rather than its ceiling', () => {
  for (const text of ['Annual base salary: $100,000 – $150,000 USD.', 'Base salary is USD 100000 to USD 150000 per year.', 'The annual salary range is $100k-$150k.', 'Base Salary Range\n$100,000 — $150,000 USD']) {
    const result = assess(text);
    assert.equal(result.status, 'meets', text);
    assert.equal(result.min, 100_000, text);
    assert.equal(result.max, 150_000, text);
    assert.equal(result.currency, 'USD');
    assert.equal(result.basis, 'base');
    assert.equal(result.period, 'year');
  }
  assert.equal(assess('Annual base salary $80,000–$110,000 USD.').status, 'overlap');
  assert.equal(assess('Annual base salary $80,000–$99,999 USD.').status, 'below');
  assert.equal(assess('Annual base salary $100,000 USD.').status, 'meets');
});

test('open-ended ranges do not invent a minimum or maximum', () => {
  const upper = assess('Annual base salary up to $150,000 USD.');
  assert.equal(upper.min, null); assert.equal(upper.max, 150_000); assert.equal(upper.status, 'overlap');
  const lower = assess('Annual base salary starting at $110,000 USD.');
  assert.equal(lower.min, 110_000); assert.equal(lower.max, null); assert.equal(lower.status, 'meets');
});

test('unrelated work schedules do not change the salary period while pay headings retain their units', () => {
  const listing = 'Employees work in the office 3 days a week.\nThe base salary range for this role is $120,000–$150,000.';
  assert.equal(assess(listing).status, 'meets');
  assert.equal(assess(listing).period, 'year');
  assert.equal(assess('Monthly team outings.\nBase salary: USD 100,000 - USD 180,000 per year.').status, 'meets');
  assert.equal(assess('Hourly base salary\nUSD 60 - USD 80').period, 'hour');
  assert.equal(assess('Monthly base salary\nUSD 120,000 - USD 150,000').status, 'unknown');
  assert.equal(assess('In office 3 days a week.\nBase salary: USD 60 - USD 80 per hour.').status, 'unknown');
});

test('hourly, monthly, foreign-currency, and missing salaries cannot meet annual USD policy', () => {
  for (const description of ['Base pay is $60–$80 per hour.', 'Annual compensation is competitive.', 'Base salary is $12,000 per month.', 'Annual base salary CAD 150,000–180,000.', 'Annual base salary €150,000.', 'Annual base salary £150,000.']) {
    assert.equal(assess(description).status, 'unknown', description);
  }
  assert.equal(assess('Base pay is $60–$80 per hour.').period, 'hour');
  assert.equal(assess('Annual base salary CAD 150,000–180,000.').currency, 'CAD');
  assert.equal(assessCompensation(job('Base salary $150,000 per year.', { location: 'Toronto, ON, Canada' }), 100_000, 'base').status, 'unknown');
});

test('bonus, equity, benefits and OTE never masquerade as base salary', () => {
  for (const description of ['Annual bonus $150,000 USD.', 'Equity grant $200,000 USD.', '401(k) match of 50% up to $150,000.', 'The company raised $150,000,000. Competitive salary.', 'OTE is $150,000–$200,000 annually.', 'Annual salary / OTE: $150,000–$200,000 USD.', 'Base salary $80,000 plus a $40,000 bonus.', 'Salary is competitive. Insurance coverage of $200,000.']) {
    assert.notEqual(assess(description).status, 'meets', description);
  }
  assert.equal(assess('Base salary $80,000 plus a $40,000 bonus.').max, 80_000);
  assert.equal(assess('Annual base salary $110,000 USD plus a discretionary bonus.').status, 'meets');
});

test('explicit total compensation stays distinct, while high base alone proves a total floor', () => {
  assert.equal(assess('Annual total compensation is $130,000–$170,000 USD.').status, 'unknown');
  assert.equal(assess('Annual total compensation is $130,000–$170,000 USD.', 'total').status, 'meets');
  const baseFloor = assess('Annual base salary $120,000 USD.', 'total');
  assert.equal(baseFloor.status, 'meets'); assert.equal(baseFloor.basis, 'base'); assert.equal(baseFloor.min, 120_000);
  assert.equal(assess('Annual base salary $80,000 USD plus a discretionary bonus.', 'total').status, 'unknown');
  const separate = 'Annual base salary $80,000 USD. Annual total compensation $150,000 USD.';
  assert.equal(assess(separate).status, 'below');
  assert.equal(assess(separate, 'total').status, 'meets');
  const combined = 'Annual base salary $80,000 USD, annual total compensation $150,000 USD.';
  assert.equal(assess(combined).status, 'below');
  assert.equal(assess(combined, 'total').status, 'meets');
});

test('multiple geographic ranges require every disclosed floor to meet the target', () => {
  const text = 'Annual base salary excludes bonus and equity.\nU.S. Pay Range\n$118,000 — $140,000 USD\nMountain View, CA Pay Range\n$130,000 — $150,000 USD';
  const result = assess(text);
  assert.equal(result.status, 'meets'); assert.equal(result.min, 118_000); assert.equal(result.max, 150_000);
  const overlap = assess(text.replace('$118,000', '$90,000'));
  assert.equal(overlap.status, 'overlap'); assert.equal(overlap.min, 90_000);
});

test('a California-only disclosure does not qualify a New York opening', () => {
  const text = 'For California Based Applicants\nThe standard base salary range for this position is $100,000 - $160,000 annually.';
  assert.equal(assessCompensation(job(text, { location: 'New York, NY' }), 100_000, 'base').status, 'unknown');
  assert.equal(assessCompensation(job(text, { location: 'San Francisco, CA' }), 100_000, 'base').status, 'meets');
});

test('actual pilot disclosure formats parse conservatively', () => {
  const idme = 'The annual base salary listed does not include a company bonus, incentive for sales roles, equity and benefits which will be determined based on experience, skills, education, relevant training, geographic location and role.\n\nID.me offers comprehensive medical, dental, vision, 401(k) with company match, and referral bonus policy.\n\nU.S. Pay Range\n\n$118,000 — $140,000 USD\n\nMountain View, CA Pay Range\n\n$130,000 — $150,000 USD';
  assert.equal(assess(idme).status, 'meets'); assert.equal(assess(idme).min, 118_000);
  const databricks = 'Pay Range Transparency\n\nThe pay range(s) for this role is listed below and represents the expected salary range for non-commissionable roles or on-target earnings for commissionable roles. Actual compensation packages depend on job-related skills. The total compensation package for this position may also include eligibility for annual performance bonus, equity, and benefits.\n\nLocal Pay Range\n\n$133,000 — $150,000 USD';
  assert.equal(assess(databricks).status, 'meets'); assert.equal(assess(databricks).min, 133_000); assert.equal(assess(databricks).basis, 'base');
  assert.equal(assessCompensation(job(databricks, { title: 'Account Executive', roleFamily: 'other' }), 100_000, 'base').status, 'unknown');
  const optiver = 'Below is the expected base salary for this position. This position will also be eligible for a discretionary bonus.\n\nBase Salary Range\n\n$200,000 — $200,000 USD';
  assert.equal(assess(optiver).status, 'meets'); assert.equal(assess(optiver).min, 200_000);
  assert.equal(assess('ID.me offers comprehensive benefits and competitive compensation.').status, 'unknown');
});

test('source evidence remains attributable, and a disabled policy never blocks', () => {
  const listing = job('Annual base salary $110,000 USD.');
  const result = assessCompensation(listing, 100_000, 'base');
  assert.equal(result.sourceUrl, listing.sourceUrl); assert.equal(result.checkedAt, listing.fetchedAt);
  assert.match(result.excerpt, /110,000/);
  assert.deepEqual(compensationEligibilityReasons(job('No pay disclosure.'), null, 'base'), []);
  assert.deepEqual(compensationEligibilityReasons(job('No pay disclosure.'), 0, 'base'), [], 'A zero floor means no minimum, including when pay is undisclosed');
  assert.equal(assessCompensation(listing, null, 'base').min, 110_000);
  assert.equal(assessCompensation(listing, null, 'base').status, 'unknown');
  assert.match(compensationEligibilityReasons(job('No pay disclosure.'), 100_000, 'base')[0], /^Compensation: /);
});
