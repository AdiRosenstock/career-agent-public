import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { applicationGroup, financeRole, helperProfile } from '../shared/applicationHub';
import type { AppSnapshot, CandidateProfile, Job } from '../shared/types';

async function fixture(html: string) {
 const dom = new JSDOM(html, {runScripts:'outside-only',url:'https://example.test/apply'});
 dom.window.HTMLElement.prototype.getClientRects = function(){return (this.style.display==='none'?[]:[{}]) as unknown as DOMRectList;};
 dom.window.eval(await readFile('browser-extension/fields.js','utf8'));
 return {dom, helper: (dom.window as any).careerFormHelper};
}
test('helper previews recognized blank fields, never submits, and preserves existing and sensitive answers', async()=>{
 const {dom,helper}=await fixture(`<form><label>First Name<input id="first"></label><label>Email Address<input id="email" type="email" value="existing@example.test"></label><label>Phone Number<input id="phone" type="tel"></label><label>SAT score<input id="sat"></label><label>Electronic signature<input id="sig" autocomplete="name"></label><label>Work authorization<input id="auth"></label><label>First name of relative<input id="relative" autocomplete="given-name"></label><label>Last Name<input id="hidden" style="display:none"></label><select aria-label="Degree"><option>Choose</option></select><button>Submit</button></form>`);
 let submissions=0;dom.window.document.querySelector('form')!.addEventListener('submit',()=>submissions++);
 let changes=0;dom.window.document.getElementById('first')!.addEventListener('input',()=>changes++);
 const items=helper.scan({firstName:'Alex',email:'new@example.test',phone:'202-555-0100',sat:'1440',fullName:'Alex Example',lastName:'Example'});
 assert.deepEqual(Array.from(items,(x:any)=>x.label),['First Name','Phone Number','SAT score']);
 const result=helper.fill(items.map((x:any)=>x.id));assert.equal(result.filled,3);assert.equal(submissions,0);assert.equal(changes,1);
 assert.equal((dom.window.document.getElementById('email') as HTMLInputElement).value,'existing@example.test');
 assert.equal((dom.window.document.getElementById('sig') as HTMLInputElement).value,'');
 assert.equal(helper.fill(items.map((x:any)=>x.id)).filled,0);
});
test('helper rechecks fields after preview and honors the selected subset', async()=>{
 const {dom,helper}=await fixture('<label>First Name<input id="a"></label><label>Phone<input id="b"></label><label>Email<input id="c"></label>');
 const items=helper.scan({firstName:'Alex',phone:'123',email:'alex@example.test'});
 (dom.window.document.getElementById('a') as HTMLInputElement).value='Manual edit';
 dom.window.document.getElementById('b')!.parentElement!.firstChild!.textContent='Signature';
 const result=helper.fill(items.slice(0,2).map((x:any)=>x.id));assert.equal(result.filled,0);assert.equal(result.skipped,2);
 assert.equal((dom.window.document.getElementById('a') as HTMLInputElement).value,'Manual edit');
 assert.equal((dom.window.document.getElementById('c') as HTMLInputElement).value,'');
});
test('helper ignores conflicting labels, unsupported controls and detached nodes',async()=>{
 const {dom,helper}=await fixture('<label>First name<input aria-label="Signature"></label><label>Email<input type="password"></label><label>Phone<input id="gone"></label><label>City<input readonly></label>');
 const items=helper.scan({firstName:'Alex',email:'alex@example.test',phone:'123',city:'City'});assert.equal(items.length,1);dom.window.document.getElementById('gone')!.remove();assert.equal(helper.fill([items[0].id]).filled,0);
});
test('profile export excludes declarations, work authorization and other private state',()=>{
 const profile={name:'Alex Example',email:'alex@example.test',phone:'123',linkedin:'',github:'',savedAnswers:[{question:'Legal First Name',answer:'Alex',confirmedAt:'2026-09-30'}, {question:'SAT score',answer:'Guess',confirmedAt:''},{question:'I agree',answer:'Yes',confirmedAt:'2026-09-30'}],authorizationNow:true,documents:[{path:'private'}]} as CandidateProfile;
 const exported=helperProfile(profile);assert.equal(exported.fields.firstName,'Alex');assert.equal(exported.fields.sat,'');assert.equal(JSON.stringify(exported).includes('private'),false);assert.equal(JSON.stringify(exported).includes('authorization'),false);
});
test('application list keeps applied, no-sponsorship and closed roles out of active links and holds unverified cohort/pay',()=>{
 const job={id:'j',company:'Citi',title:'2027 Investment Banking Analyst',description:'Uses quantitative analysis',postingId:'123',roleFamily:'finance',eligible:true,status:'open',sponsorship:[]} as unknown as Job;
 const state={priorApplications:[],attempts:[],settings:{minimumAnnualCompensation:100000},meta:{salaryAssessments:{j:{status:'meets'}}}} as unknown as AppSnapshot;
 assert.equal(financeRole(job),true);assert.equal(financeRole({...job,title:'Quantitative Trader'}),false);
 assert.equal(applicationGroup(job,state),'active');assert.equal(applicationGroup({...job,status:'closed'},state),'archived');
 assert.equal(applicationGroup({...job,sponsorship:[{status:'explicit_no'} as any]},state),'archived');
 assert.equal(applicationGroup({...job,title:'Investment Banking Analyst'},state),'research');
 assert.equal(applicationGroup(job,{...state,meta:{} as any}),'research');
 assert.equal(applicationGroup(job,{...state,priorApplications:[{company:job.company,title:job.title,matchScope:'exact_role'} as any]}),'applied');
});
