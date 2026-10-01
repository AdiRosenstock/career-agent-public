import test from 'node:test';
import assert from 'node:assert/strict';
import { annualPay, jobDate, matchesJobFilters, matchesJobSearch, sponsorshipCategory } from '../shared/jobFilters';
import type { AppSnapshot, Job, SponsorshipEvidence } from '../shared/types';
const now = Date.parse('2026-10-01');
const evidence = (changes: Partial<SponsorshipEvidence> = {}): SponsorshipEvidence => ({ id:'e', status:'explicit_yes', sourceUrl:'https://example.test/jobs/1', excerpt:'Sponsorship is available for this role.', checkedAt:'2026-09-30', employerName:'Example', scope:'role', entityMatch:true, ...changes });
const job = (entries: SponsorshipEvidence[] = []): Job => ({ id:'j', company:'Example', location:'Chicago, IL', sponsorship:entries } as Job);
const filters = { company:'all', location:'all', sponsorship:'all', pay:'all' };
const state = {settings:{minimumAnnualCompensation:100000},meta:{salaryAssessments:{j:{min:110000,max:130000,currency:'USD',period:'year',basis:'base',status:'meets'}}}} as unknown as AppSnapshot;
test('search combines terms across fields in any order and normalizes accents and spacing', () => {
 const role = {...job(), company:'Société Example', title:'Investment Banking Analyst', roleFamily:'finance'} as Job;
 for (const query of ['', '   ', 'Chicago analyst', 'ANALYST   societe', 'finance chicago']) assert.equal(matchesJobSearch(role,query),true);
 for (const query of ['Chicago engineer', 'analyst remote']) assert.equal(matchesJobSearch(role,query),false);
});
test('search preserves phrases and excludes individual terms or phrases', () => {
 const role = {...job(),title:'Investment Banking Analyst',roleFamily:'finance'} as Job;
 for (const query of ['"investment banking" Chicago', '“investment banking” -senior', 'analyst -"New York"']) assert.equal(matchesJobSearch(role,query),true);
 for (const query of ['"banking investment"','analyst -Chicago','-"investment banking"']) assert.equal(matchesJobSearch(role,query),false);
 assert.equal(matchesJobSearch({...role,company:'Investment',title:'Banking Analyst'},'"investment banking"'),false);
});
test('newest sorting uses posting date before discovery date and handles missing dates', () => {
 assert.equal(jobDate({...job(),postedAt:'2026-09-01',fetchedAt:'2026-10-01'}),Date.parse('2026-09-01'));
 assert.equal(jobDate({...job(),postedAt:null,fetchedAt:'2026-10-01'}),Date.parse('2026-10-01'));
 assert.equal(jobDate({...job(),postedAt:null,fetchedAt:''}),0);
});
test('sponsorship filters distinguish role support from employer history', () => {
 assert.equal(sponsorshipCategory(job([evidence()]), now),'explicit_yes');
 assert.equal(sponsorshipCategory(job([evidence({status:'history_only',scope:'employer'})]),now),'history_only');
 assert.equal(sponsorshipCategory(job([evidence({scope:'employer'})]),now),'unknown');
 assert.equal(sponsorshipCategory(job([evidence({status:'explicit_no'})]),now),'explicit_no');
});
test('unmatched, stale, unsourced and future evidence stays unknown', () => {
 for(const change of [{entityMatch:false},{employerName:'Other'},{checkedAt:'2020-01-01'},{sourceUrl:'javascript:alert(1)'},{excerpt:''},{checkedAt:'2028-01-01'}]) assert.equal(sponsorshipCategory(job([evidence(change)]),now),'unknown');
});
test('company, location and compensation filters combine without mutating records', () => {
 const before=JSON.stringify(state);
 assert.equal(matchesJobFilters(job(),state,{...filters,company:'Example',location:'Chicago, IL',pay:'meets'}),true);
 assert.equal(matchesJobFilters(job(),state,{...filters,company:'Other'}),false);
 assert.equal(matchesJobFilters(job(),state,{...filters,location:'Remote'}),false);
 assert.equal(matchesJobFilters(job(),state,{...filters,pay:'unknown'}),false);
 assert.equal(JSON.stringify(state),before);
 const noFloor={...state,settings:{...state.settings,minimumAnnualCompensation:0}};
 assert.equal(matchesJobFilters(job(),noFloor,{...filters,pay:'meets'}),false);
});
test('missing pay stays unknown and hourly or non-USD ranges cannot rank as annual USD', () => {
 const missing={...state,meta:{...state.meta,salaryAssessments:{}}};
 assert.equal(matchesJobFilters(job(),missing,{...filters,pay:'unknown'}),true);
 assert.equal(annualPay(job(),state),110000);
 for(const change of [{period:'hour'},{currency:'EUR'},{basis:'unknown'}]) {
  const modified={...state,meta:{...state.meta,salaryAssessments:{j:{...state.meta.salaryAssessments!.j,...change}}}} as AppSnapshot;
  assert.equal(annualPay(job(),modified),-1);
  assert.equal(matchesJobFilters(job(),modified,{...filters,pay:'verified'}),false);
 }
});
