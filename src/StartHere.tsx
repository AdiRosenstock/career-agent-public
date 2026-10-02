import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Check, CheckCircle2, CircleHelp, FileText, LoaderCircle, Search, ShieldCheck } from 'lucide-react';
import { careerPathNames, careerStageNames } from '../shared/candidatePolicy';
import { setupChecklist, setupComplete } from '../shared/workflow';
import type { AppSnapshot, CandidateProfile, CareerStage, RoleFamily, Settings } from '../shared/types';

type Choice = '' | 'true' | 'false';
const relocationQuestion = 'Are you open to relocation?';
const onsiteQuestion = 'Are you willing to work on site?';
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

export default function StartHere({ state, busy, save, prepare, submit, review, profile }: {
 state: AppSnapshot; busy: boolean; save: (body: { profile: Partial<CandidateProfile>; settings: Partial<Settings> }) => Promise<boolean>;
 prepare: () => void; submit: (batchId: string) => void; review: () => void; profile: () => void;
}) {
 const complete = setupComplete(state);
 const [editing, setEditing] = useState(false);
 const [name, setName] = useState(state.profile.name);
 const [email, setEmail] = useState(state.profile.email);
 const [phone, setPhone] = useState(state.profile.phone);
 const [stage, setStage] = useState<CareerStage | ''>(state.settings.careerStage || '');
 const [graduation, setGraduation] = useState(state.profile.graduation);
 const [years, setYears] = useState(state.settings.yearsExperience == null ? '' : String(state.settings.yearsExperience));
 const [tracks, setTracks] = useState<RoleFamily[]>(state.settings.careerTargetsConfirmed ? state.settings.rolePriority : []);
 const [keywords, setKeywords] = useState((state.settings.roleKeywords || []).join(', '));
 const [locations, setLocations] = useState((state.settings.preferredLocations || []).join('; '));
 const [workplace, setWorkplace] = useState<NonNullable<Settings['workplacePreference']> | ''>(state.settings.workplacePreference || '');
 const [minimum, setMinimum] = useState(String(state.settings.minimumAnnualCompensation ?? 0));
 const [basis, setBasis] = useState<'base' | 'total'>(state.settings.compensationBasis || 'base');
 const [start, setStart] = useState(state.profile.earliestStart || '');
 const [authNow, setAuthNow] = useState<Choice>(choice(state.profile.authorizationNow));
 const [authStart, setAuthStart] = useState<Choice>(choice(state.profile.authorizationAtStart));
 const [sponsorship, setSponsorship] = useState<Choice>(choice(state.profile.futureSponsorship));
 const [relocation, setRelocation] = useState<Choice>(answerChoice(state.profile, relocationQuestion));
 const [onsite, setOnsite] = useState<Choice>(answerChoice(state.profile, onsiteQuestion));
 const [attempted, setAttempted] = useState(false);
 const [dirty, setDirty] = useState(false);
 useEffect(() => {
  if (dirty) return;
  setName(state.profile.name); setEmail(state.profile.email); setPhone(state.profile.phone);
  setStage(state.settings.careerStage || ''); setGraduation(state.profile.graduation);
  setYears(state.settings.yearsExperience == null ? '' : String(state.settings.yearsExperience));
  setTracks(state.settings.careerTargetsConfirmed ? state.settings.rolePriority : []);
  setKeywords((state.settings.roleKeywords || []).join(', '));
  setLocations((state.settings.preferredLocations || []).join('; '));
  setWorkplace(state.settings.workplacePreference || ''); setMinimum(String(state.settings.minimumAnnualCompensation ?? 0)); setBasis(state.settings.compensationBasis || 'base');
  setStart(state.profile.earliestStart || ''); setAuthNow(choice(state.profile.authorizationNow)); setAuthStart(choice(state.profile.authorizationAtStart)); setSponsorship(choice(state.profile.futureSponsorship));
  setRelocation(answerChoice(state.profile, relocationQuestion)); setOnsite(answerChoice(state.profile, onsiteQuestion));
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
 ];
 const checklist = setupChecklist(state);
 const outstanding = state.packets.filter(packet => ['draft', 'needs_input', 'handoff'].includes(packet.status) && state.jobs.some(job => job.id === packet.jobId && !job.dismissed));
 const batches = [...new Set([...state.approvals].sort((a, b) => b.approvedAt.localeCompare(a.approvedAt)).filter(approval => !approval.revokedAt && state.packets.some(packet => packet.id === approval.packetId && packet.status === 'approved' && packet.approvalId === approval.id && packet.contentHash === approval.packetHash)).map(approval => approval.batchId))].slice(0, 3);

 async function saveSetup(event: FormEvent) {
  event.preventDefault(); setAttempted(true);
  if (missing.length || !stage) return;
  const confirmedAt = new Date().toISOString();
  const savedAnswers = state.profile.savedAnswers.filter(item => !preferenceAliases(relocationQuestion).includes(item.question) && !preferenceAliases(onsiteQuestion).includes(item.question));
  for (const [question, value] of [[relocationQuestion, relocation], [onsiteQuestion, onsite]] as const) {
   if (value) savedAnswers.push({ id: state.profile.savedAnswers.find(item => item.question === question)?.id || crypto.randomUUID(), question, answer: value === 'true' ? 'Yes' : 'No', confirmedAt });
  }
  const saved = await save({
   profile: { name: name.trim(), email: email.trim(), phone: phone.trim(), graduation, earliestStart: start || null, authorizationNow: authNow === 'true', authorizationAtStart: authStart === 'true', futureSponsorship: sponsorship === 'true', authorizationConfirmedAt: confirmedAt, savedAnswers },
   settings: { careerStage: stage, yearsExperience: stage === 'experienced' ? Number(years) : null, careerTargetsConfirmed: true, rolePriority: tracks, roleKeywords: keywords.split(',').map(term => term.trim()).filter(Boolean), preferredLocations: locations.split(';').map(term => term.trim()).filter(Boolean), workplacePreference: workplace || 'any', minimumAnnualCompensation: Number(minimum), compensationBasis: basis },
  });
  if (saved) { setEditing(false); setAttempted(false); setDirty(false); }
 }

 return <div className="start-workspace">
  {complete && <section className="start-actions" aria-labelledby="start-actions-title"><div className="start-ready"><CheckCircle2 size={22} /><div><h2 id="start-actions-title">Your preferences are saved. Put your agent to work.</h2><p>Choose an action, copy the instruction, and paste it into {state.meta.workspace ? 'your Codex or Claude Code chat for this project' : 'your agent chat'}. Copying an instruction does not launch the agent.</p></div></div><div className="start-action-row"><button className="button primary" onClick={prepare}><Search size={17} /> Find jobs and prepare</button>{batches.map((batchId, index) => <button key={batchId} className="button secondary" onClick={() => submit(batchId)}><ArrowRight size={16} />{index ? 'Continue another approved batch' : 'Continue approved batch'}</button>)}<button className="button secondary" onClick={review}>Review applications{outstanding.length ? ` · ${outstanding.length} need answers` : ''}</button></div><p className="start-action-help">Your agent searches, checks fit, and completes applications using your saved answers. Review and approve the exact applications here, then use the approved batch instruction to have your agent submit them.</p><button className="button text" onClick={() => setEditing(value => !value)}>{editing ? 'Close saved preferences' : 'Edit my saved preferences'}</button></section>}
  {(!complete || editing) && <div className="start-intake-layout"><form className="start-intake" onChangeCapture={() => setDirty(true)} onSubmit={event => void saveSetup(event)}>
   <div className="start-intake-heading"><h2>{complete ? 'Your saved preferences' : 'Tell us what you want once.'}</h2><p>Answer here so your agent can start searching without an interview in chat. These details stay in your private workspace.</p></div>
   <fieldset><legend>Your contact details</legend><div className="form-grid"><Field label="Full name"><input autoComplete="name" required value={name} onChange={event => setName(event.target.value)} /></Field><Field label="Email address"><input autoComplete="email" type="email" required value={email} onChange={event => setEmail(event.target.value)} /></Field><Field label="Phone number"><input autoComplete="tel" type="tel" required value={phone} onChange={event => setPhone(event.target.value)} /></Field></div></fieldset>
   <fieldset><legend>What jobs do you want?</legend><div className="form-grid"><Field label="Experience level"><select required value={stage} onChange={event => setStage(event.target.value as CareerStage)}><option value="">Choose your level</option>{Object.entries(careerStageNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>{stage === 'new_grad' && <Field label="Graduation month"><input type="month" required value={graduation} onChange={event => setGraduation(event.target.value)} /></Field>}{stage === 'experienced' && <Field label="Years of professional experience"><input type="number" min={0} max={60} step={0.5} required value={years} onChange={event => setYears(event.target.value)} /></Field>}</div><div className="start-role-choices" role="group" aria-label="Career paths">{Object.entries(careerPathNames).map(([id, label]) => <label key={id} className={tracks.includes(id as RoleFamily) ? 'chosen' : ''}><input type="checkbox" checked={tracks.includes(id as RoleFamily)} onChange={event => setTracks(list => event.target.checked ? [...list, id as RoleFamily] : list.filter(track => track !== id))} />{label}</label>)}</div><Field label="Specific job titles (optional)" hint="Separate titles with commas. You can enter a title instead of selecting a career path."><input value={keywords} onChange={event => setKeywords(event.target.value)} placeholder="e.g. data analyst, mechanical engineer" /></Field>{tracks.length > 1 && <p className="start-field-note">Paths are searched in the order you select them. You can change the order in Settings.</p>}</fieldset>
   <fieldset><legend>Work authorization for US jobs</legend><p className="start-field-note">Choose each answer yourself. Your agent reuses these confirmed answers when the employer asks the same question.</p><Field label="Are you currently authorized to work in the United States?"><YesNo required value={authNow} onChange={setAuthNow} /></Field><Field label="Will you be authorized to work in the United States at your proposed start date?"><YesNo required value={authStart} onChange={setAuthStart} /></Field><Field label="Will you require employment visa sponsorship now or in the future?"><YesNo required value={sponsorship} onChange={setSponsorship} /></Field></fieldset>
   <details className="start-optional"><summary>Location, pay, and other preferences <span>Optional</span></summary><div className="start-optional-body"><div className="form-grid"><Field label="Preferred locations" hint="Separate locations with semicolons. Leave blank to search across the US."><input value={locations} onChange={event => setLocations(event.target.value)} placeholder="e.g. Chicago, IL; New York, NY" /></Field><Field label="Workplace preference"><select value={workplace} onChange={event => setWorkplace(event.target.value as typeof workplace)}><option value="">Choose a preference (optional)</option><option value="any">Any workplace</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On site</option></select></Field><Field label="Minimum annual pay (USD)" hint="Use 0 if you do not want a minimum."><input type="number" min={0} max={10000000} step={1000} required value={minimum} onChange={event => setMinimum(event.target.value)} /></Field><Field label="Pay basis"><select value={basis} onChange={event => setBasis(event.target.value as 'base' | 'total')}><option value="base">Base salary</option><option value="total">Total compensation</option></select></Field><Field label="Earliest start date"><input type="date" value={start} onChange={event => setStart(event.target.value)} /></Field></div><Field label={relocationQuestion}><YesNo value={relocation} onChange={setRelocation} /></Field><Field label={onsiteQuestion}><YesNo value={onsite} onChange={setOnsite} /></Field><p className="start-field-note">Unanswered preferences stay unanswered. Employer-specific declarations are reviewed with each application.</p></div></details>
   {attempted && missing.length > 0 && <div className="start-missing" role="alert"><strong>Complete these answers:</strong><ul>{missing.map(item => <li key={item}>{item}</li>)}</ul></div>}
   <div className="start-save"><p><ShieldCheck size={16} /> Save once. Update whenever your plans change.</p><button type="submit" className="button primary" disabled={busy} onClick={() => setAttempted(true)}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Save my preferences</button></div>
  </form><aside className="start-checklist" aria-label="Setup checklist"><h2>Ready to start?</h2><p className="start-field-note"><FileText size={16} /> {state.profile.resume.filename}</p><ul>{checklist.map(item => <li key={item.id} className={item.complete ? 'complete' : ''}>{item.complete ? <CheckCircle2 size={17} /> : <CircleHelp size={17} />}<span>{item.label}<small>{item.complete ? 'Saved' : item.id === 'resume' ? 'Original PDF needed' : 'Answer in this form'}</small></span></li>)}</ul>{!state.meta.resumeValid && <div className="start-resume-help"><FileText size={19} /><p>Add your original résumé PDF during project setup. If you already added it, ask your agent to register the unchanged file.</p><button className="button text" onClick={profile}>Check my résumé</button></div>}<p className="start-field-note">You do not need to write a plan. After saving, use the job search instruction and let your agent complete the work.</p></aside></div>}
 </div>;
}
