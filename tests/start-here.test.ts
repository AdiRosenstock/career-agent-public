import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import type { AppSnapshot, CandidateProfile, Settings } from '../shared/types.js';
import StartHere from '../src/StartHere.js';

test('saved intake refreshes clean values, preserves dirty edits, and keeps city/state locations intact', async t => {
 const dom = new JSDOM('<div id="root"></div>', { url: 'http://127.0.0.1:4317' });
 const globals = globalThis as Record<string, any>;
 const previous = { window: globals.window, document: globals.document, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), IS_REACT_ACT_ENVIRONMENT: globals.IS_REACT_ACT_ENVIRONMENT };
 globals.window = dom.window; globals.document = dom.window.document; Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); globals.IS_REACT_ACT_ENVIRONMENT = true;
 const { createRoot } = await import('react-dom/client'); const root = createRoot(dom.window.document.getElementById('root')!);
 t.after(async () => { await act(async () => root.unmount()); dom.window.close(); globals.window = previous.window; globals.document = previous.document; globals.IS_REACT_ACT_ENVIRONMENT = previous.IS_REACT_ACT_ENVIRONMENT; if (previous.navigator) Object.defineProperty(globalThis, 'navigator', previous.navigator); else delete globals.navigator; });
 let state = {
  profile: { name: 'Alex Example', email: 'alex@example.test', phone: '+1 202-555-0100', graduation: '', authorizationNow: true, authorizationAtStart: true, futureSponsorship: false, authorizationConfirmedAt: '2026-10-02T12:00:00Z', earliestStart: null, savedAnswers: [{ id: 'legacy-relocation', question: 'Are you willing to relocate?', answer: 'Yes', confirmedAt: '2026-10-02T12:00:00Z' }], resume: { filename: 'original.pdf' } },
  settings: { careerStage: 'early_career', careerTargetsConfirmed: true, rolePriority: ['design'], roleKeywords: [], preferredLocations: ['Chicago, IL', 'Austin, TX'], targetEmployers: ['Northstar Labs', 'Acme Health'], workplacePreference: 'any', minimumAnnualCompensation: 0, applicationPreferences: { writtenAnswers: 'draft', formFilling: 'agent', submission: 'review', confirmedAt: '2026-10-02T12:00:00Z', automaticRiskAccepted: false } },
  packets: [], approvals: [], jobs: [], attempts: [], meta: { resumeValid: true, workspace: 'synthetic-workspace' },
 } as unknown as AppSnapshot;
 let saved: { profile: Partial<CandidateProfile>; settings: Partial<Settings> } | undefined;
 let searches = 0;
 const render = async () => { await act(async () => root.render(createElement(StartHere, { state, busy: false, save: async body => { saved = body; return true; }, search: () => { searches++; }, prepare: () => {}, applyAutomatically: () => {}, submit: () => {}, review: () => {}, uploadResume: async () => true, uploadDocument: async () => true }))); };
 await render();
 const documentSection = dom.window.document.querySelector('#start-documents')!;
 assert.ok(documentSection.compareDocumentPosition(dom.window.document.querySelector('.start-actions')!) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, 'Documents should be the first setup section');
 assert.deepEqual(Array.from(documentSection.querySelectorAll<HTMLInputElement>('input[type=file]')).map(input => input.getAttribute('aria-label')), ['Replace original résumé PDF', 'Base cover letter PDF', 'Academic transcript PDF']);
 await act(async () => Array.from(dom.window.document.querySelectorAll('button')).find(button => button.textContent?.includes('Search employer feeds now'))!.click());
 assert.equal(searches,1,'Start here must launch dashboard discovery directly');
 state = { ...state, profile: { ...state.profile, name: 'Updated Example' } }; await render();
 const buttons = () => Array.from(dom.window.document.querySelectorAll('button'));
 await act(async () => buttons().find(button => button.textContent === 'Edit my saved preferences')!.click());
 const name = dom.window.document.querySelector<HTMLInputElement>('input[autocomplete="name"]')!;
 assert.equal(name.value, 'Updated Example', 'Clean editor must read the newest profile');
 const locationInput = Array.from(dom.window.document.querySelectorAll<HTMLInputElement>('input')).find(input => input.placeholder.includes('Chicago'))!;
 assert.equal(locationInput.value, 'Chicago, IL; Austin, TX');
 const select = Array.from(dom.window.document.querySelectorAll<HTMLSelectElement>('select')).find(element => element.closest('label')?.textContent?.includes('Workplace preference'))!;
 await act(async () => { select.value = 'remote'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
 const selfId = (label: string) => Array.from(dom.window.document.querySelectorAll<HTMLSelectElement>('select')).find(element => element.closest('label')?.querySelector('span')?.textContent === label)!;
 assert.equal(selfId('Gender').value, '', 'Optional self-identification starts unanswered');
 await act(async () => { selfId('Gender').value = "I don't wish to answer"; selfId('Gender').dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
 await act(async () => { selfId('Hispanic or Latino').value = 'Yes'; selfId('Hispanic or Latino').dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
 state = { ...state, settings: { ...state.settings, workplacePreference: 'hybrid' } }; await render();
 assert.equal(select.value, 'remote', 'Refresh must preserve a current unsaved choice');
 await act(async () => dom.window.document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
 assert.equal(saved?.profile.name, 'Updated Example'); assert.deepEqual(saved?.settings.preferredLocations, ['Chicago, IL', 'Austin, TX']); assert.deepEqual(saved?.settings.targetEmployers, ['Northstar Labs', 'Acme Health']); assert.equal(saved?.settings.workplacePreference, 'remote');
 assert.equal(saved?.profile.savedAnswers?.find(answer => answer.question === 'Are you open to relocation?')?.answer, 'Yes');
 assert.equal(saved?.profile.savedAnswers?.some(answer => answer.question === 'Are you willing to relocate?'), false, 'Legacy aliases must not conflict with new preferences');
 assert.equal(saved?.profile.savedAnswers?.find(answer => answer.question === 'Gender')?.answer, "I don't wish to answer");
 assert.equal(saved?.profile.savedAnswers?.find(answer => answer.question === 'Are you Hispanic/Latino?')?.answer, 'Yes');
 assert.equal(saved?.profile.savedAnswers?.some(answer => answer.question === 'Sexual Orientation'), false, 'Unanswered sensitive questions are not saved');
});
