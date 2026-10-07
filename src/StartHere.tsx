import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Check, CheckCircle2, CircleHelp, FileText, LoaderCircle, Search, ShieldCheck } from 'lucide-react';
import { careerPathNames, careerStageNames } from '../shared/candidatePolicy';
import { setupChecklist, setupComplete } from '../shared/workflow';
import type { AppSnapshot, ApplicationPreferences, CandidateProfile, CareerStage, RoleFamily, Settings } from '../shared/types';

type Choice = '' | 'true' | 'false';
const relocationQuestion = 'Are you open to relocation?';
const onsiteQuestion = 'Are you willing to work on site?';
const travelQuestion = 'Are you willing to travel for work?';
const commonFields = [
 ['Legal First Name', 'Legal first name'], ['Legal Last Name', 'Legal last name'],
 ['City', 'Current city'], ['State', 'State or province'], ['Postal Code', 'Postal code'],
 ['School or University', 'School or university'], ['Degree', 'Degree earned or pursuing'],
 ['Discipline', 'Major or field of study'], ['GPA:', 'GPA (optional)'],
] as const;
const additionalFields = [
 ['Preferred First Name', 'Preferred first name'], ['Website', 'Personal website'], ['Portfolio', 'Portfolio URL'],
 ['Street Address', 'Street address'], ['Address Line 2', 'Apartment or suite'], ['Country', 'Country of residence'],
 ['What time zone are you located in?', 'Time zone'],
 ['What are your salary requirements?', 'Salary requirements (include currency and period)'],
 ['What is your current notice period?', 'Current notice period'],
 ['Do you have preferred pronouns you\'d like to share?', 'Pronouns you choose to share'],
] as const;
const selfIdFields = [
 { question: 'Gender', label: 'Gender', options: ['Female', 'Male', 'Non-Binary', 'Transgender', 'Other/Not Listed', "I don't wish to answer"] },
 { question: 'Gender Identity', label: 'Gender identity', options: ['Man', 'Woman', 'Non-Binary, Non-Conforming', "I don't wish to answer"] },
 { question: 'Are you Hispanic/Latino?', label: 'Hispanic or Latino', options: ['Yes', 'No', "I don't wish to answer"] },
 { question: 'Race', label: 'Race (single-choice survey)', options: ['Asian', 'Black or African American', 'Latinx or Hispanic', 'Native American or Alaska Native', 'Native Hawaiian or Pacific Islander', 'Two or more races', 'White', "I don't wish to answer"] },
 { question: 'Sexual Orientation', label: 'Sexual orientation', options: ['Heterosexual', 'Member of the LGBTQ+ Community', 'Other / Not listed', "I don't wish to answer"] },
 { question: 'Do you identify as transgender?', label: 'Transgender identity', options: ['Yes', 'No', "I don't wish to answer"] },
 { question: 'Veteran Status', label: 'Protected veteran status', options: ['I am not a protected veteran', 'I am one or more of the classifications of protected veterans', "I don't wish to answer"] },
 { question: 'Are you a veteran or active member of the United States Armed Forces?', label: 'Veteran or active service member', options: ['Yes, I am a veteran or active member', 'No, I am not a veteran or active member', "I don't wish to answer"] },
 { question: 'Disability Status', label: 'Disability status', options: ['Yes, I have (or have previously had) a disability', "No, I don't have a disability", "I don't wish to answer"] },
] as const;
const selfIdContextFields = [
 ['My race/ethnicity (application context only)', 'Race or ethnicity, in your own words'],
 ['My gender identity (application context only)', 'Gender identity, in your own words'],
 ['My sexual orientation (application context only)', 'Sexual orientation, in your own words'],
 ['My age range (application context only)', 'Age range, if you choose to share'],
] as const;
const intakeAnswerQuestions = [...commonFields, ...additionalFields, ...selfIdFields.map(field => [field.question, field.label] as const), ...selfIdContextFields];
const savedText = (profile: CandidateProfile, question: string) => profile.savedAnswers.find(answer => answer.question === question && Number.isFinite(Date.parse(answer.confirmedAt)))?.answer || '';
const preferenceAliases = (question: string) => question === relocationQuestion ? [question, 'Are you willing to relocate?'] : [question, 'Are you willing to work onsite?'];
const choice = (value: boolean | null): Choice => value == null ? '' : value ? 'true' : 'false';
const answerChoice = (profile: CandidateProfile, question: string): Choice => {
 const answers = profile.savedAnswers.filter(item => preferenceAliases(question).includes(item.question) && Number.isFinite(Date.parse(item.confirmedAt))).map(item => item.answer.trim().toLowerCase());
 return answers.length && answers.every(answer => answer === 'yes') ? 'true' : answers.length && answers.every(answer => answer === 'no') ? 'false' : '';
};
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
 return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function YesNo({ value, onChange, required = false }: { value: Choice; onChange: (value: Choice) => void; required?: boolean }) {
 return <select value={value} onChange={event => onChange(event.target.value as Choice)} required={required}><option value="">Choose your answer</option><option value="true">Yes</option><option value="false">No</option></select>;
}

export default function StartHere({ state, busy, save, search, prepare, applyAutomatically, submit, review, uploadResume, uploadDocument }: {
 state: AppSnapshot; busy: boolean; save: (body: { profile: Partial<CandidateProfile>; settings: Partial<Settings> }) => Promise<boolean>;
 search: () => void; prepare: () => void; applyAutomatically: () => void; submit: (batchId: string) => void; review: () => void; uploadResume: (file: File) => Promise<boolean>;
 uploadDocument: (file: File, kind: 'transcript' | 'base_cover_letter', documentDate: string | null) => Promise<boolean>;
}) {
 const complete = setupComplete(state);
 const [editing, setEditing] = useState(false);
 const [name, setName] = useState(state.profile.name);
 const [email, setEmail] = useState(state.profile.email);
 const [phone, setPhone] = useState(state.profile.phone);
 const [linkedin, setLinkedin] = useState(state.profile.linkedin || '');
 const [github, setGithub] = useState(state.profile.github || '');
 const [highlights, setHighlights] = useState(state.profile.facts?.find(fact => fact.id === 'candidate-highlights')?.value || '');
 const [stage, setStage] = useState<CareerStage | ''>(state.settings.careerStage || '');
 const [graduation, setGraduation] = useState(state.profile.graduation);
 const [years, setYears] = useState(state.settings.yearsExperience == null ? '' : String(state.settings.yearsExperience));
 const [tracks, setTracks] = useState<RoleFamily[]>(state.settings.careerTargetsConfirmed ? state.settings.rolePriority : []);
 const [keywords, setKeywords] = useState((state.settings.roleKeywords || []).join(', '));
 const [locations, setLocations] = useState((state.settings.preferredLocations || []).join('; '));
 const [employers, setEmployers] = useState((state.settings.targetEmployers || []).join('; '));
 const [careerSites, setCareerSites] = useState((state.settings.preferredCareerSites || []).join('; '));
 const [workplace, setWorkplace] = useState<NonNullable<Settings['workplacePreference']> | ''>(state.settings.workplacePreference || '');
 const [minimum, setMinimum] = useState(String(state.settings.minimumAnnualCompensation ?? 0));
 const [basis, setBasis] = useState<'base' | 'total'>(state.settings.compensationBasis || 'base');
 const [start, setStart] = useState(state.profile.earliestStart || '');
 const [authNow, setAuthNow] = useState<Choice>(choice(state.profile.authorizationNow));
 const [authStart, setAuthStart] = useState<Choice>(choice(state.profile.authorizationAtStart));
 const [sponsorship, setSponsorship] = useState<Choice>(choice(state.profile.futureSponsorship));
 const [relocation, setRelocation] = useState<Choice>(answerChoice(state.profile, relocationQuestion));
 const [onsite, setOnsite] = useState<Choice>(answerChoice(state.profile, onsiteQuestion));
 const [travel, setTravel] = useState<Choice>(answerChoice(state.profile, travelQuestion));
 const [common, setCommon] = useState<Record<string, string>>(() => Object.fromEntries(intakeAnswerQuestions.map(([question]) => [question, savedText(state.profile, question)])));
 const [writtenAnswers, setWrittenAnswers] = useState<ApplicationPreferences['writtenAnswers'] | ''>(state.settings.applicationPreferences?.writtenAnswers || '');
 const [formFilling, setFormFilling] = useState<ApplicationPreferences['formFilling'] | ''>(state.settings.applicationPreferences?.formFilling || '');
 const [submission, setSubmission] = useState<ApplicationPreferences['submission'] | ''>(state.settings.applicationPreferences?.submission || '');
 const [automaticRiskAccepted, setAutomaticRiskAccepted] = useState(state.settings.applicationPreferences?.automaticRiskAccepted || false);
 const [transcriptDate, setTranscriptDate] = useState('');
 const [attempted, setAttempted] = useState(false);
 const [dirty, setDirty] = useState(false);
 useEffect(() => {
  if (dirty) return;
  setName(state.profile.name); setEmail(state.profile.email); setPhone(state.profile.phone);
  setLinkedin(state.profile.linkedin || ''); setGithub(state.profile.github || ''); setHighlights(state.profile.facts?.find(fact => fact.id === 'candidate-highlights')?.value || '');
  setStage(state.settings.careerStage || ''); setGraduation(state.profile.graduation);
  setYears(state.settings.yearsExperience == null ? '' : String(state.settings.yearsExperience));
  setTracks(state.settings.careerTargetsConfirmed ? state.settings.rolePriority : []);
  setKeywords((state.settings.roleKeywords || []).join(', '));
  setLocations((state.settings.preferredLocations || []).join('; ')); setEmployers((state.settings.targetEmployers || []).join('; ')); setCareerSites((state.settings.preferredCareerSites || []).join('; '));
  setWorkplace(state.settings.workplacePreference || ''); setMinimum(String(state.settings.minimumAnnualCompensation ?? 0)); setBasis(state.settings.compensationBasis || 'base');
  setStart(state.profile.earliestStart || ''); setAuthNow(choice(state.profile.authorizationNow)); setAuthStart(choice(state.profile.authorizationAtStart)); setSponsorship(choice(state.profile.futureSponsorship));
  setRelocation(answerChoice(state.profile, relocationQuestion)); setOnsite(answerChoice(state.profile, onsiteQuestion));
  setTravel(answerChoice(state.profile, travelQuestion)); setCommon(Object.fromEntries(intakeAnswerQuestions.map(([question]) => [question, savedText(state.profile, question)])));
  setWrittenAnswers(state.settings.applicationPreferences?.writtenAnswers || ''); setFormFilling(state.settings.applicationPreferences?.formFilling || ''); setSubmission(state.settings.applicationPreferences?.submission || ''); setAutomaticRiskAccepted(state.settings.applicationPreferences?.automaticRiskAccepted || false);
 }, [state.profile, state.settings, dirty]);
 const missing = [
  ...(!name.trim() ? ['Full name'] : []),
  ...(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? ['Email address'] : []),
  ...(!phone.trim() ? ['Phone number'] : []),
  ...(!stage ? ['Experience level'] : []),
  ...(stage === 'new_grad' && !graduation ? ['Graduation month'] : []),
  ...(stage === 'experienced' && (years === '' || !Number.isFinite(Number(years)) || Number(years) < 0 || Number(years) > 60) ? ['Years of experience'] : []),
  ...(!tracks.length && !keywords.split(',').some(term => term.trim()) ? ['A career path or job title'] : []),
  ...(!authNow || !authStart || !sponsorship ? ['All three work authorization answers'] : []),
  ...(!writtenAnswers || !formFilling || !submission ? ['How your agent may write, fill, and submit'] : []),
  ...(submission === 'automatic' && !automaticRiskAccepted ? ['Accept the automatic submission risk'] : []),
  ...(submission === 'automatic' && (writtenAnswers === 'self' || formFilling === 'self') ? ['Choose agent-prepared answers and agent form filling for automatic submission'] : []),
  ...(careerSites.split(';').map(site => site.trim()).filter(Boolean).some(site => { try { const url = new URL(site); return url.protocol !== 'https:' || !!url.username || !!url.password || !!url.hash; } catch { return true; } }) ? ['Use HTTPS career page links without credentials or fragments'] : []),
 ];
 const checklist = setupChecklist(state);
 const outstanding = state.packets.filter(packet => ['draft', 'needs_input', 'handoff'].includes(packet.status) && state.jobs.some(job => job.id === packet.jobId && !job.dismissed));
 const batches = [...new Set([...state.approvals].sort((a, b) => b.approvedAt.localeCompare(a.approvedAt)).filter(approval => !approval.revokedAt && state.packets.some(packet => packet.id === approval.packetId && packet.status === 'approved' && packet.approvalId === approval.id && packet.contentHash === approval.packetHash)).map(approval => approval.batchId))].slice(0, 3);
 const latestDocument = (kind: 'transcript' | 'base_cover_letter') => [...(state.profile.documents || [])].filter(document => document.kind === kind).sort((a, b) => b.addedAt.localeCompare(a.addedAt))[0];
 const transcript = latestDocument('transcript');
 const baseCoverLetter = latestDocument('base_cover_letter');

 async function saveSetup(event: FormEvent) {
  event.preventDefault(); setAttempted(true);
  if (missing.length || !stage) return;
  const confirmedAt = new Date().toISOString();
  const reusableQuestions = new Set<string>([...intakeAnswerQuestions.map(([question]) => question), travelQuestion]);
  const savedAnswers = state.profile.savedAnswers.filter(item => !preferenceAliases(relocationQuestion).includes(item.question) && !preferenceAliases(onsiteQuestion).includes(item.question) && !reusableQuestions.has(item.question));
  const facts = (state.profile.facts || []).filter(fact => fact.id !== 'candidate-highlights');
  if (highlights.trim()) facts.push({ id: 'candidate-highlights', label: 'Skills and experience highlights', value: highlights.trim(), source: 'user:confirmed-dashboard', confirmed: true });
  for (const [question, value] of [[relocationQuestion, relocation], [onsiteQuestion, onsite]] as const) {
   if (value) savedAnswers.push({ id: state.profile.savedAnswers.find(item => item.question === question)?.id || crypto.randomUUID(), question, answer: value === 'true' ? 'Yes' : 'No', confirmedAt });
  }
  for (const [question, value] of [...intakeAnswerQuestions.map(([question]) => [question, common[question] || ''] as const), [travelQuestion, travel === 'true' ? 'Yes' : travel === 'false' ? 'No' : ''] as const]) {
   if (value.trim()) savedAnswers.push({ id: state.profile.savedAnswers.find(item => item.question === question)?.id || crypto.randomUUID(), question, answer: value.trim(), confirmedAt });
  }
  const saved = await save({
   profile: { name: name.trim(), email: email.trim(), phone: phone.trim(), linkedin: linkedin.trim(), github: github.trim(), facts, graduation, earliestStart: start || null, authorizationNow: authNow === 'true', authorizationAtStart: authStart === 'true', futureSponsorship: sponsorship === 'true', authorizationConfirmedAt: confirmedAt, savedAnswers },
   settings: { careerStage: stage, yearsExperience: stage === 'experienced' ? Number(years) : null, careerTargetsConfirmed: true, rolePriority: tracks, roleKeywords: keywords.split(',').map(term => term.trim()).filter(Boolean), preferredLocations: locations.split(';').map(term => term.trim()).filter(Boolean), targetEmployers: employers.split(';').map(name => name.trim()).filter(Boolean), preferredCareerSites: careerSites.split(';').map(site => site.trim()).filter(Boolean), workplacePreference: workplace || 'any', minimumAnnualCompensation: Number(minimum), compensationBasis: basis, applicationPreferences: { writtenAnswers: writtenAnswers as ApplicationPreferences['writtenAnswers'], formFilling: formFilling as ApplicationPreferences['formFilling'], submission: submission as ApplicationPreferences['submission'], confirmedAt, automaticRiskAccepted: submission === 'automatic' && automaticRiskAccepted } },
  });
  if (saved) { setEditing(false); setAttempted(false); setDirty(false); }
 }

 return <div className="start-workspace">
  <section className="start-documents" id="start-documents" aria-labelledby="start-documents-title">
   <div className="start-documents-heading"><span className="eyebrow">FIRST, YOUR FILES</span><h2 id="start-documents-title">Add your application documents</h2><p>Saved as private, unchanged PDF copies. Add the résumé to prepare applications; the cover letter and transcript are optional until a job needs them.</p></div>
   <div className="start-document-grid">
    <div className="start-document-card"><span className="start-document-number">01</span><h3>Résumé <span>Required</span></h3><p>Your original PDF is used for applications.</p><strong>{state.profile.resume.filename && state.meta.resumeValid ? state.profile.resume.filename : 'No verified résumé yet'}</strong><input aria-label={state.profile.resume.filename ? 'Replace original résumé PDF' : 'Original résumé PDF'} type="file" accept="application/pdf,.pdf" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadResume(file); event.currentTarget.value = ''; }} />{state.meta.resumeValid && <a href="/api/resume" target="_blank" rel="noreferrer">Open saved résumé</a>}</div>
    <div className="start-document-card"><span className="start-document-number">02</span><h3>Base cover letter <span>Optional</span></h3><p>A reference for tailored letters. It will not be attached automatically.</p><strong>{baseCoverLetter?.filename || 'No base cover letter yet'}</strong><input aria-label="Base cover letter PDF" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadDocument(file, 'base_cover_letter', null); event.currentTarget.value = ''; }} />{baseCoverLetter && <a href={`/api/documents/${encodeURIComponent(baseCoverLetter.id)}`} target="_blank" rel="noreferrer">Open saved base letter</a>}</div>
    <div className="start-document-card"><span className="start-document-number">03</span><h3>Transcript <span>Optional</span></h3><p>Stored privately; selected only for a matching employer upload field.</p><strong>{transcript?.filename || 'No transcript yet'}</strong><label className="start-document-date">Document date (if known)<input type="date" value={transcriptDate} disabled={busy} onChange={event => setTranscriptDate(event.target.value)} /></label><input aria-label="Academic transcript PDF" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadDocument(file, 'transcript', transcriptDate || null); event.currentTarget.value = ''; }} />{transcript && <a href={`/api/documents/${encodeURIComponent(transcript.id)}`} target="_blank" rel="noreferrer">Open saved transcript</a>}</div>
   </div>
  </section>
  {complete && <section className="start-actions" aria-labelledby="start-actions-title"><div className="start-ready"><CheckCircle2 size={22} /><div><h2 id="start-actions-title">Your preferences are saved. Start finding jobs.</h2><p>Search your selected public employer feeds here, or ask {state.meta.workspace ? 'Codex or Claude Code' : 'your agent'} to research more employers and complete live forms.</p></div></div><div className="start-action-row"><button className="button primary" disabled={busy} onClick={search}><Search size={17} /> Search employer feeds now</button><button className="button secondary" onClick={prepare}>Ask my agent to search more</button>{state.settings.applicationPreferences?.submission === 'automatic' && <button className="button primary" onClick={applyAutomatically}>Ask my agent to find jobs and apply</button>}{batches.map((batchId, index) => <button key={batchId} className="button secondary" onClick={() => submit(batchId)}><ArrowRight size={16} />{index ? 'Continue another approved batch' : 'Continue approved batch'}</button>)}<button className="button secondary" onClick={review}>Review applications{outstanding.length ? ` · ${outstanding.length} need answers` : ''}</button></div><p className="start-action-help">Feed search checks open postings and prepares eligible drafts within your daily limit. Your agent can inspect full employer forms, research beyond these feeds, and use saved answers. {state.settings.applicationPreferences?.submission === 'automatic' ? 'With your saved automatic choice, your agent may submit complete applications after fresh live checks. AI may make mistakes; review your saved risk choice anytime.' : state.settings.applicationPreferences?.submission === 'self' ? 'Your agent prepares applications for you to fill and submit.' : 'Review and approve exact applications here before your agent submits them.'}</p><button className="button text" onClick={() => setEditing(value => !value)}>{editing ? 'Close saved preferences' : 'Edit my saved preferences'}</button></section>}
  {(!complete || editing) && <div className="start-intake-layout"><form className="start-intake" onChangeCapture={() => setDirty(true)} onSubmit={event => void saveSetup(event)}>
   <div className="start-intake-heading"><h2>{complete ? 'Your saved preferences' : 'Tell us what you want once.'}</h2><p>Answer here so your agent can start searching without an interview in chat. These details stay in your private workspace.</p></div>
   <fieldset><legend>Your contact details</legend><div className="form-grid"><Field label="Full name"><input autoComplete="name" required value={name} onChange={event => setName(event.target.value)} /></Field><Field label="Email address"><input autoComplete="email" type="email" required value={email} onChange={event => setEmail(event.target.value)} /></Field><Field label="Phone number"><input autoComplete="tel" type="tel" required value={phone} onChange={event => setPhone(event.target.value)} /></Field></div></fieldset>
   <fieldset><legend>What jobs do you want?</legend><div className="form-grid"><Field label="Experience level"><select required value={stage} onChange={event => setStage(event.target.value as CareerStage)}><option value="">Choose your level</option>{Object.entries(careerStageNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>{stage === 'new_grad' && <Field label="Graduation month"><input type="month" required value={graduation} onChange={event => setGraduation(event.target.value)} /></Field>}{stage === 'experienced' && <Field label="Years of professional experience"><input type="number" min={0} max={60} step={0.5} required value={years} onChange={event => setYears(event.target.value)} /></Field>}</div><div className="start-role-choices" role="group" aria-label="Career paths">{Object.entries(careerPathNames).map(([id, label]) => <label key={id} className={tracks.includes(id as RoleFamily) ? 'chosen' : ''}><input type="checkbox" checked={tracks.includes(id as RoleFamily)} onChange={event => setTracks(list => event.target.checked ? [...list, id as RoleFamily] : list.filter(track => track !== id))} />{label}</label>)}</div><Field label="Specific job titles (optional)" hint="Separate titles with commas. You can enter a title instead of selecting a career path."><input value={keywords} onChange={event => setKeywords(event.target.value)} placeholder="e.g. data analyst, mechanical engineer" /></Field>{tracks.length > 1 && <p className="start-field-note">Paths are searched in the order you select them. You can change the order in Settings.</p>}</fieldset>
   <fieldset><legend>What should applications highlight?</legend><Field label="Skills and experience highlights (optional)" hint="Use your own words. Include only facts you can support with your résumé or other records."><textarea rows={4} maxLength={5000} value={highlights} onChange={event => setHighlights(event.target.value)} placeholder="e.g. SQL and Python projects, customer research, licensed engineering work" /></Field><div className="form-grid"><Field label="LinkedIn URL (optional)"><input type="url" value={linkedin} onChange={event => setLinkedin(event.target.value)} placeholder="https://linkedin.com/in/…" /></Field><Field label="GitHub URL (optional)"><input type="url" value={github} onChange={event => setGithub(event.target.value)} placeholder="https://github.com/…" /></Field></div></fieldset>
   <fieldset><legend>Work authorization for US jobs</legend><p className="start-field-note">Choose each answer yourself. Your agent reuses these confirmed answers when the employer asks the same question.</p><Field label="Are you currently authorized to work in the United States?"><YesNo required value={authNow} onChange={setAuthNow} /></Field><Field label="Will you be authorized to work in the United States at your proposed start date?"><YesNo required value={authStart} onChange={setAuthStart} /></Field><Field label="Will you require employment visa sponsorship now or in the future?"><YesNo required value={sponsorship} onChange={setSponsorship} /></Field></fieldset>
   <fieldset><legend>How should your agent handle applications?</legend><p className="start-field-note">Choose each step. You can change these choices later. Scheduled searches and preparation do not submit applications.</p><div className="form-grid"><Field label="May AI write answers to employer questions?"><select required value={writtenAnswers} onChange={event => setWrittenAnswers(event.target.value as typeof writtenAnswers)}><option value="">Choose an option</option><option value="draft">Draft tailored answers from my confirmed facts</option><option value="saved_only">Use only my saved exact answers</option><option value="self">I will write new answers myself</option></select></Field><Field label="Who fills in the application form?"><select required value={formFilling} onChange={event => setFormFilling(event.target.value as typeof formFilling)}><option value="">Choose an option</option><option value="agent">My agent fills the form</option><option value="self">I fill the form myself</option></select></Field><Field label="Who clicks Submit?"><select required value={submission} onChange={event => { setSubmission(event.target.value as typeof submission); setAutomaticRiskAccepted(false); }}><option value="">Choose an option</option><option value="self">I submit each application myself</option><option value="review">I approve exact applications, then my agent submits</option><option value="automatic">My agent may submit complete applications automatically</option></select></Field></div>{submission === 'automatic' && <label className="check-label start-risk"><input type="checkbox" checked={automaticRiskAccepted} onChange={event => setAutomaticRiskAccepted(event.target.checked)} /> I understand AI may make mistakes in applications and automatic submissions are at my own risk. My agent may submit eligible, complete applications without my review of each one.</label>}<p className="start-field-note">Unknown personal answers, declarations, assessments, CAPTCHA and logins still come back to you. Automatic submission requires agent form filling and agent-prepared answers.</p></fieldset>
   <fieldset><legend>Answers employers often ask</legend><p className="start-field-note">Optional. Confirm only answers you know are accurate. These go into your private local profile and can be reused on matching forms.</p><div className="form-grid">{commonFields.map(([question, label]) => <Field key={question} label={label}><input value={common[question] || ''} onChange={event => setCommon(current => ({ ...current, [question]: event.target.value }))} /></Field>)}</div><Field label={travelQuestion}><YesNo value={travel} onChange={setTravel} /></Field><div className="form-grid">{additionalFields.map(([question, label]) => <Field key={question} label={label}><input value={common[question] || ''} onChange={event => setCommon(current => ({ ...current, [question]: event.target.value }))} /></Field>)}</div><p className="start-field-note">A salary answer should say whether it is annual, hourly, or another basis. Employer-specific referrals, prior employment, eligibility declarations, consents, and written prompts are reviewed with each application.</p></fieldset>
   <fieldset><legend>Optional self-identification</legend><p className="start-field-note">These answers are your choice. Leave any blank to answer on the employer form. Saved answers go to your configured private storage and local candidate skill. They are reused automatically only when a single-choice form has the same question and exact option. Multi-select surveys, different wording, and consent requests need your review.</p><div className="form-grid">{selfIdFields.map(({ question, label, options }) => <Field key={question} label={label}><select value={common[question] || ''} onChange={event => setCommon(current => ({ ...current, [question]: event.target.value }))}><option value="">Ask me on each application</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></Field>)}</div><p className="start-field-note">The options above mirror questions observed on employer forms; a different employer may use different categories. Protected veteran status differs from general military service.</p><div className="form-grid">{selfIdContextFields.map(([question, label]) => <Field key={question} label={label} hint="Context for your agent only; this wording never auto-fills a form."><input value={common[question] || ''} onChange={event => setCommon(current => ({ ...current, [question]: event.target.value }))} /></Field>)}</div></fieldset>
   <details className="start-optional"><summary>Location, employers, pay, and other preferences <span>Optional</span></summary><div className="start-optional-body"><div className="form-grid"><Field label="Preferred locations" hint="Separate locations with semicolons. Leave blank to search across the US."><input value={locations} onChange={event => setLocations(event.target.value)} placeholder="e.g. Chicago, IL; New York, NY" /></Field><Field label="Workplace preference"><select value={workplace} onChange={event => setWorkplace(event.target.value as typeof workplace)}><option value="">Choose a preference (optional)</option><option value="any">Any workplace</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On site</option></select></Field><Field label="Employers to prioritize" hint="Separate company names with semicolons. Your agent searches these first, while other matches stay visible."><input value={employers} onChange={event => setEmployers(event.target.value)} placeholder="e.g. Acme Health; Northstar Labs" /></Field><Field label="Career pages to search first" hint="Optional official HTTPS career URLs, separated by semicolons. Your agent checks these before broad search."><input type="text" value={careerSites} onChange={event => setCareerSites(event.target.value)} placeholder="https://company.example/careers; https://jobs.example/board" /></Field><Field label="Minimum annual pay (USD)" hint="Use 0 if you do not want a minimum."><input type="number" min={0} max={10000000} step={1000} required value={minimum} onChange={event => setMinimum(event.target.value)} /></Field><Field label="Pay basis"><select value={basis} onChange={event => setBasis(event.target.value as 'base' | 'total')}><option value="base">Base salary</option><option value="total">Total compensation</option></select></Field><Field label="Earliest start date"><input type="date" value={start} onChange={event => setStart(event.target.value)} /></Field></div><Field label={relocationQuestion}><YesNo value={relocation} onChange={setRelocation} /></Field><Field label={onsiteQuestion}><YesNo value={onsite} onChange={setOnsite} /></Field><p className="start-field-note">Unanswered preferences stay unanswered. Employer-specific declarations are reviewed with each application.</p></div></details>
   {attempted && missing.length > 0 && <div className="start-missing" role="alert"><strong>Complete these answers:</strong><ul>{missing.map(item => <li key={item}>{item}</li>)}</ul></div>}
   <div className="start-save"><p><ShieldCheck size={16} /> Save once. Update whenever your plans change.</p><button type="submit" className="button primary" disabled={busy} onClick={() => setAttempted(true)}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Save my preferences</button></div>
  </form><aside className="start-checklist" aria-label="Setup checklist"><h2>Ready to start?</h2><p className="start-field-note"><FileText size={16} /> {state.profile.resume.filename || 'No résumé added yet'}</p><ul>{checklist.map(item => <li key={item.id} className={item.complete ? 'complete' : ''}>{item.complete ? <CheckCircle2 size={17} /> : <CircleHelp size={17} />}<span>{item.label}<small>{item.complete ? 'Saved' : item.id === 'resume' ? 'Original PDF needed' : 'Answer in this form'}</small></span></li>)}</ul>{!state.meta.resumeValid && <div className="start-resume-help"><FileText size={19} /><p>Add your original résumé in the document section above.</p><a href="#start-documents">Go to document uploads</a></div>}<p className="start-field-note">You do not need to write a plan. After saving, use the job search instruction and let your agent complete the work.</p></aside></div>}
 </div>;
}
