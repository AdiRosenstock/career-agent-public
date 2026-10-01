import test from 'node:test';
import assert from 'node:assert/strict';
import type { Board, Job, SponsorshipEvidence } from '../shared/types.js';
import { assessJob, canonicalUrl, discoverBoard, inspectGreenhouse, isNonPermanentJob, normalizeJob, parseAtsJobUrl, sponsorshipStatus, stripHtml, validateBoard } from '../server/discovery.js';
import { assessCompensation } from '../server/compensation.js';

const now = new Date().toISOString();
const evidence = (patch: Partial<SponsorshipEvidence> = {}): SponsorshipEvidence => ({ id: 'history', status: 'history_only', sourceUrl: 'https://www.dol.gov/agencies/eta/foreign-labor/performance', excerpt: 'Acme Inc — certified H-1B employer record, reviewed for legal entity match.', checkedAt: now, employerName: 'Acme Inc', scope: 'employer', entityMatch: true, ...patch });
const job = (patch: Partial<Job> = {}): Job => normalizeJob({ company: 'Acme Inc', title: 'Associate Product Manager — 2027 New Graduate', description: 'Graduating in 2027. Help customers with financial planning.', sourceUrl: 'https://jobs.lever.co/acme/abc-123', location: 'New York, NY', status: 'open', sponsorship: [evidence()], ...patch });
const board = (source: Board['source'] = 'greenhouse'): Board => ({ id: 'acme', company: 'Acme Inc', source, token: 'acme', enabled: true, sponsorship: [evidence()] });
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
const fixture = (value: unknown) => (async () => json(value)) as typeof fetch;

test('unknown, history, and explicit sponsorship states preserve their evidence meaning', () => {
  assert.equal(sponsorshipStatus(job()), 'history_only');
  assert.equal(sponsorshipStatus(job({ sponsorship: [evidence({ excerpt: 'Employer history only; this role does not guarantee sponsorship.' })] })), 'history_only');
  assert.equal(sponsorshipStatus(job({ sponsorship: [] })), 'unknown');
  assert.equal(sponsorshipStatus(job({ sponsorship: [evidence({ entityMatch: false })] })), 'unknown');
  assert.equal(sponsorshipStatus(job({ sponsorship: [evidence({ employerName: 'Acme Holdings' })] })), 'unknown');
  assert.equal(sponsorshipStatus(job({ sponsorship: [evidence({ sourceUrl: '' })] })), 'unknown');
  assert.equal(sponsorshipStatus(job({ description: 'Visa sponsorship is available for this role.' })), 'explicit_yes');
  assert.equal(sponsorshipStatus(job({ description: 'We offer visa sponsorship.' })), 'explicit_yes');
  assert.equal(sponsorshipStatus(job({ description: 'Optiver is supportive of US immigration sponsorship for this role.' })), 'explicit_yes');
  assert.equal(sponsorshipStatus(job({ sponsorship: [], description: 'Candidates needing future visa sponsorship must have 36 months of valid work authorization. We will provide post-hire immigration support.' })), 'explicit_yes');
  assert.equal(sponsorshipStatus(job({ sponsorship: [], description: 'Visa sponsorship may be available.' })), 'unknown');
  assert.equal(sponsorshipStatus(job({ sponsorship: [], description: 'We cannot guarantee visa sponsorship.' })), 'unknown');
  assert.equal(sponsorshipStatus(job({ sponsorship: [], description: 'Will you now or in the future require sponsorship?' })), 'unknown');
  assert.equal(sponsorshipStatus(job({ sponsorship: [], description: 'We are not unable to offer visa sponsorship.' })), 'unknown');
});

test('negative role text overrides historical and positive sponsorship evidence', () => {
  for (const description of [
    'We are unable to sponsor work visas.', 'This role is not eligible for visa sponsorship.',
    'We do not offer visa sponsorship.', 'We cannot sponsor candidates now or in the future.',
    'Candidates must work without requiring employer sponsorship.', 'Visa sponsorship is not available.',
    'No employment visa sponsorship is offered.', 'Sponsorship will not be provided.',
    'We are not offering visa sponsorship.', 'Visa sponsorship: No.',
    'We offer visa sponsorship. We cannot sponsor this position.',
  ]) {
    const result = job({ description });
    assert.equal(sponsorshipStatus(result), 'explicit_no', description);
    assert.equal(result.eligible, false, description);
  }
});

test('BA profile excludes required graduate degrees without excluding preferred or alternative degrees', () => {
  assert.equal(job({ title: 'Quantitative Researcher - PhD Graduate 2027' }).eligible, false);
  assert.equal(job({ description: 'Candidates must hold a Master’s degree in mathematics.' }).eligible, false);
  assert.equal(job({ description: 'A Ph.D. in statistics is required.' }).eligible, false);
  assert.equal(job({ description: 'Currently pursuing a PhD in statistics.' }).eligible, false);
  assert.equal(job({ description: 'Bachelor’s or Master’s degree required.' }).eligible, true);
  assert.equal(job({ description: 'Master’s degree preferred.' }).eligible, true);
  assert.equal(job({ description: 'Work with PhD researchers to improve our models.' }).eligible, true);
});

test('June 2027 graduation blocks earlier explicit starts and flags unresolved June dates', () => {
  assert.equal(job({ description: 'Must graduate before June 2027.' }).eligible, false);
  assert.equal(job({ description: 'Must graduate by May 2027.' }).eligible, false);
  assert.equal(job({ description: 'Start date: January 2027.' }).eligible, false);
  assert.equal(job({ description: 'Must start on May 15, 2027.' }).eligible, false);
  assert.equal(job({ description: 'Must graduate between May 2027 and August 2027.' }).eligible, true);
  assert.equal(job({ description: 'The role starts in July 2027.' }).eligible, true);
  assert.equal(job({ description: 'Applications start in May 2027.' }).eligible, true);
  const june = job({ description: 'Start date: June 1, 2027.' });
  assert.equal(june.eligible, true);
  assert.ok(june.concerns.some(reason => reason.includes('exact graduation')));
});

test('unverified employer claims and stale positive role evidence never qualify as sponsorship', () => {
  assert.equal(sponsorshipStatus(job({ sponsorship: [evidence({ status: 'explicit_yes', excerpt: 'We offer visa sponsorship.', scope: 'employer' })] })), 'unknown');
  assert.equal(sponsorshipStatus(job({ sponsorship: [evidence({ status: 'explicit_yes', excerpt: 'Maybe available', scope: 'role' })] })), 'unknown');
  assert.equal(sponsorshipStatus(job({ description: 'Visa sponsorship is available.', fetchedAt: '2020-01-01T00:00:00Z', sponsorship: [] })), 'unknown');
});

test('US early-career PM and data receive priority while finance remains a target', () => {
  const product = job();
  const data = job({ title: 'Data Analyst — 2027 New Graduate' });
  const finance = job({ title: 'Financial Analyst — 2027 New Graduate' });
  assert.equal(product.eligible, true);
  assert.equal(data.roleFamily, 'data');
  assert.equal(finance.roleFamily, 'finance');
  assert.ok(product.score > finance.score);
  assert.ok(data.score > finance.score);
  assert.ok(product.concerns.some(value => value.includes('does not guarantee')));
  assert.equal(job({ title: 'FPGA Engineer 2027' }).roleFamily, 'other');
  assert.equal(job({ title: 'Electrical Engineer 2027' }).eligible, false);
  assert.equal(job({ title: 'Software Engineer - Hardware Tools 2027' }).roleFamily, 'software');
});

test('finance specialties and forward deployed roles enter the intended tracks', () => {
  for (const title of ['Wealth Management Analyst — New Grad 2027', 'Asset Management Analyst — New Grad 2027', 'Sales & Trading Analyst — New Grad 2027']) {
    assert.equal(job({ title }).roleFamily, 'finance', title);
  }
  const forwardDeployed = job({ title: 'Forward Deployed Engineer — New Grad 2027' });
  assert.equal(forwardDeployed.roleFamily, 'software');
  assert.ok(forwardDeployed.fitReasons.some(reason => reason.includes('Forward Deployed')));
  assert.equal(job({ title: 'Sales Development Representative — New Grad 2027' }).roleFamily, 'other');
});

test('a security-clearance requirement stays in research until eligibility is verified', () => {
  const result = job({
    title: 'Forward Deployed Infrastructure Engineer — New Grad 2027',
    description: 'Graduating in 2027. Active US Security clearance, or eligibility and willingness to obtain a US Security clearance. Salary range $135,000 - $145,000/year.',
  });
  assert.equal(result.eligible, false);
  assert.ok(result.eligibilityReasons.includes('Security-clearance eligibility needs verification'));
});

test('early-career product analysts retain product priority and eligibility filters', () => {
  const analyst = job({ title: 'Product Analyst' });
  assert.equal(analyst.roleFamily, 'product');
  assert.equal(analyst.eligible, true);
  assert.ok(analyst.score > job({ title: 'Financial Analyst' }).score);
  assert.equal(job({ title: 'Senior Product Analyst' }).eligible, false);
  assert.equal(job({ title: 'Product Analyst Intern' }).eligible, false);
  assert.equal(job({ title: 'Product Analyst', description: 'Help the team build products and serve customers.' }).eligible, false);
  assert.equal(job({ title: 'Data Analyst' }).roleFamily, 'data');
  assert.equal(job({ title: 'Financial Analyst' }).roleFamily, 'finance');
});

test('Sierra APX is a product track only with the documented new-grad rotation context', () => {
  const listing = {
    company: 'Sierra', title: 'APX (New Grad 2027)',
    description: 'APX is a rotational program with rotations across Agent Development and Core Product teams. Undergraduate students graduating by June 2027 may apply.',
    sponsorship: [evidence({ employerName: 'Sierra' })],
  };
  const apx = job(listing);
  assert.equal(apx.title, listing.title);
  assert.equal(apx.roleFamily, 'product');
  assert.equal(apx.eligible, true);
  assert.ok(apx.fitReasons.some(reason => reason.includes('Agent Development and Core Product')));
  assert.equal(job({ ...listing, description: 'New graduates in 2027 may apply.' }).roleFamily, 'other');
  assert.equal(job({ ...listing, company: 'Sierra Manufacturing' }).roleFamily, 'other');
  assert.equal(job({ ...listing, title: 'APX Intern (New Grad 2027)' }).eligible, false);
  assert.equal(job({ ...listing, sponsorship: [] }).eligible, false);
});

test('new-grad members of technical staff qualify only with software engineering context', () => {
  const listing = { title: 'Member of Technical Staff - New Grad (2027 Start)', description: 'Join one of four engineering teams building AI agents with Python and TypeScript. Graduating December 2026 through July 2027.' };
  const graduate = job(listing);
  assert.equal(graduate.title, listing.title);
  assert.equal(graduate.roleFamily, 'software');
  assert.equal(graduate.eligible, true);
  assert.equal(job({ ...listing, title: 'Senior Member of Technical Staff - New Grad (2027 Start)' }).eligible, false);
  assert.equal(job({ ...listing, title: 'Member of Technical Staff' }).eligible, false);
  assert.equal(job({ ...listing, description: 'Join a chemistry research team. PhD required.' }).roleFamily, 'other');
  assert.equal(job({ ...listing, sponsorship: [] }).eligible, false);
});

test('privacy and civil liberties software graduates do not match civil engineering exclusions', () => {
  const listing = { title: 'Privacy & Civil Liberties Engineer - New Grad', description: 'Develop full-stack software products for privacy and AI governance. Must graduate in Fall 2026 or Spring 2027.' };
  assert.equal(job(listing).roleFamily, 'software');
  assert.equal(job(listing).eligible, true);
  assert.equal(job({ ...listing, description: 'Design civil infrastructure. New graduates in 2027 may apply.' }).roleFamily, 'other');
  assert.equal(job({ ...listing, title: 'Civil Engineer - New Grad' }).roleFamily, 'other');
  assert.equal(job({ ...listing, sponsorship: [] }).eligible, false);
});

test('documented core development rotations qualify as software without treating generic development programs as engineering', () => {
  const listing = { company: 'InterSystems', title: 'Core Development Program', description: 'Students graduating in Fall 2026 or Spring 2027 build a foundation in software engineering through front-end, back-end and full stack development.', sponsorship: [evidence({ employerName: 'InterSystems' })] };
  assert.equal(job(listing).roleFamily, 'software');
  assert.equal(job(listing).eligible, true);
  assert.equal(job({ ...listing, description: 'Students graduating in 2027 rotate across business development teams.' }).roleFamily, 'other');
  assert.equal(job({ ...listing, company: 'Other Company' }).roleFamily, 'other');
  assert.equal(job({ ...listing, sponsorship: [] }).eligible, false);
  assert.equal(job({ ...listing, description: `${listing.description} Start date: January 2027.` }).eligible, false);
});

test('new college grad signals a graduate role while codesign requires documented software work', () => {
  assert.equal(job({ title: 'Software Engineer - New College Grad', description: 'Build software applications.' }).eligible, true);
  const listing = { company: 'Cerebras', title: 'CoDesign & NextGen - New College Grad', description: 'Work on kernel development and performance modeling for our software products, validated using hardware and simulations. Experience with C++ and Python.', sponsorship: [evidence({ employerName: 'Cerebras' })] };
  assert.equal(job(listing).roleFamily, 'software');
  assert.equal(job(listing).eligible, true);
  assert.equal(job({ ...listing, description: 'Design mechanical hardware and test physical components.' }).roleFamily, 'other');
  assert.equal(job({ ...listing, sponsorship: [] }).eligible, false);
  assert.equal(job({ ...listing, description: `${listing.description} PhD required.` }).eligible, false);
});

test('junior discretionary trading is a finance role while seniority and sponsorship still apply', () => {
  const listing = { title: 'Junior Discretionary Trader', description: 'Early-career discretionary trading of financial instruments.' };
  assert.equal(job(listing).roleFamily, 'finance');
  assert.equal(job(listing).eligible, true);
  assert.equal(job({ ...listing, title: 'Senior Discretionary Trader' }).eligible, false);
  assert.equal(job({ ...listing, sponsorship: [] }).eligible, false);
});

test('Astera graduate operations roles need documented analytics work and retain all eligibility checks', () => {
  const base = { company: 'Astera Labs', sponsorship: [evidence({ employerName: 'Astera Labs' })] };
  const sales = { ...base, title: 'Sales Operation Analyst NCG', description: 'New College Graduate opportunity using data analysis, business systems, reporting, and dashboards.' };
  const capacity = { ...base, title: 'Capacity Planning NCG', description: 'New College Graduate role building capacity forecasts with Python, SQL and data analysis.' };
  for (const listing of [sales, capacity]) {
    assert.equal(job(listing).roleFamily, 'data');
    assert.equal(job(listing).eligible, true);
    assert.equal(job({ ...listing, sponsorship: [] }).eligible, false);
    assert.equal(job({ ...listing, description: `${listing.description} Requires five years of experience.` }).eligible, false);
  }
  assert.equal(job({ ...sales, description: 'New College Graduate selling products and closing sales.' }).roleFamily, 'other');
  assert.equal(job({ ...capacity, description: 'New College Graduate operating manufacturing equipment.' }).roleFamily, 'other');
  assert.equal(job({ ...sales, title: 'Sales Development Representative NCG' }).roleFamily, 'other');
  assert.equal(job({ ...sales, company: 'Other Company' }).roleFamily, 'other');
});

test('an internship-experience minimum supports a permanent junior role without admitting internships or intern managers', () => {
  const description = 'Employment: Full-time. Semi-technical: no need to code, but you must have at least internship experience working closely with APIs, databases, SQL, Postman, and similar tools OR excitement to learn.';
  assert.equal(job({ title: 'Product Analyst', description }).eligible, true);
  assert.equal(job({ title: 'Product Analyst Intern', description }).eligible, false);
  assert.equal(job({ title: 'Product Analyst', description: `${description} This role is a temporary position.` }).eligible, false);
  assert.equal(job({ title: 'Product Analyst', description: `${description} Requires 5 years of product experience.` }).eligible, false);
  assert.equal(job({ title: 'Product Analyst', description: 'Manage interns and lead our internship program.' }).eligible, false);
  assert.equal(job({ title: 'Product Analyst', description: 'Internship experience is a plus.' }).eligible, false);
});

test('company time spent building products is not candidate experience', () => {
  const description = 'We spent 3 years building the rails to read and write across those systems. You must have at least internship experience working closely with APIs, databases, SQL, Postman, and similar tools OR excitement to learn.';
  assert.equal(job({ title: 'Product Analyst', description }).eligible, true);
  assert.equal(job({ title: 'Product Analyst', description: description.replace('We spent', 'You have spent') }).eligible, false);
  assert.equal(job({ title: 'Product Analyst', description: `${description} You must have 5 years of product experience.` }).eligible, false);
});

test('closed, senior, internship, incompatible cycles and unknown locations stay out of main queue', () => {
  for (const patch of [
    { status: 'closed' as const }, { title: 'Senior Product Manager' }, { title: 'Data Analyst Internship 2027' },
    { description: 'This role requires 5+ years of professional experience.' },
    { title: 'New Graduate Software Engineer', description: 'Must graduate in 2026.' },
    { title: 'Data Analyst 2026 Graduate' }, { location: 'London, UK' }, { location: 'Remote' },
    { location: 'North America' }, { location: 'Georgia' }, { deadline: '2020-01-01T00:00:00Z' },
    { sponsorship: [] },
  ]) assert.equal(job(patch).eligible, false, JSON.stringify(patch));
  assert.equal(job({ description: 'Graduate between 2026 and 2028.' }).eligible, true);
  assert.equal(job({ description: '0–2 years of experience required.' }).eligible, true);
  assert.equal(job({ location: 'Remote - USA' }).eligible, true);
});

test('sponsorship history alone never qualifies managerial or unspecialized experienced roles', () => {
  for (const title of ['Accounting Manager, Accounts Receivable', 'Revenue Accounting Manager', 'Global Cash & Treasury Operations Manager', 'Strategic Account Executive', 'Strategic Core Account Executive - Retail', 'Solutions Architect - Financial Services', 'Data Analyst', 'Product Manager', 'Software Engineer']) {
    const result = job({ title, description: 'Help the team build products and serve customers.' });
    assert.equal(result.eligible, false, title);
    assert.ok(result.eligibilityReasons.some(reason => /entry-level|career tracks/.test(reason)), title);
  }
  assert.equal(job({ title: 'Strategic Account Executive', description: 'Open to recent college graduates.' }).roleFamily, 'other');
  assert.equal(job({ title: 'Accounting Manager', description: 'No prior experience required.' }).eligible, false);
});

test('varied explicit experience requirements defeat otherwise early-career title wording', () => {
  for (const description of [
    '8+ years in developer relations or a hands-on technical role.',
    '5+ years of hands-on analytics and data engineering experience.',
    'Experience: 6+ years of progressive AR and GL accounting experience in a mid-to-large organization.',
    'Core Experience: 5+ years of dedicated Cash Management experience within a tech company.',
    '10+ years of combined experience in public accounting and corporate revenue accounting.',
    '4–8 years in data analytics, process automation, or operations roles.',
    '7+ years of Enterprise Sales experience exceeding quotas.',
    'A minimum of eight years in technical architecture.',
    'You must have 5 years’ experience in product management.',
    '1 year of Python experience and 8+ years in software engineering.',
  ]) {
    const result = job({ description });
    assert.equal(result.eligible, false, description);
    assert.ok(result.eligibilityReasons.includes('Requires at least three years of experience'), description);
  }
  assert.equal(job({ description: '5+ years of hands-on analytics experience preferred.' }).eligible, true);
});

test('ordinary analyst roles need explicit graduate or junior experience evidence', () => {
  for (const description of ['1+ years of analytics experience.', '0–2 years in a data analytics role.', 'Open to recent college graduates.', 'This is an entry-level opportunity.', 'No previous professional experience required.', 'You will graduate in Spring 2027 with a bachelors degree.']) {
    assert.equal(job({ title: 'Data Analyst', description }).eligible, true, description);
  }
  assert.equal(job({ title: 'Data Analyst I', description: 'Build dashboards.' }).eligible, true);
  assert.equal(job({ title: 'Software Engineer', description: 'Mentor new graduates and lead platform development.' }).eligible, false);
  assert.equal(job({ title: 'AI Engineer', description: 'It is not intended for internship, new graduate, or entry-level applicants.' }).eligible, false);
  assert.equal(job({ title: 'Product Manager', description: 'New graduates are welcome. At least 5 years in product management.' }).eligible, false);
});

test('APM with May/June 2027 graduate window remains compatible', () => {
  assert.equal(job({ title: 'Associate Product Manager (APM)', description: 'Applicants must be graduating in May/June 2027. No prior professional experience required.' }).eligible, true);
  assert.equal(job({ title: 'Associate Product Manager, New Grad (2027 Start)', description: 'You will graduate in Fall 2026 or Spring 2027 with a bachelors or masters degree in computer science.' }).eligible, true);
});

test('an older OR graduate cohort does not exclude an explicitly accepted 2027 cohort', () => {
  const description = 'Currently enrolled with an expected graduation date in 2027.\n*OR a recent graduate with a graduation date from Spring 2025 to Fall 2026.';
  assert.equal(job({ title: 'Software Engineer - New Grad', description }).eligible, true);
  assert.equal(job({ title: 'Software Engineer - New Grad', description: `${description}\nStart date: September 2026.` }).eligible, false);
  assert.equal(job({ title: 'Software Engineer - New Grad', description: 'Recent graduate with a graduation date from Spring 2025 to Fall 2026.' }).eligible, false);
});

test('internships and temporary roles are excluded even if the title says full-time or graduate', () => {
  for (const title of ['Full-time Data Internship 2027', 'Data Science Internships 2027', 'Graduate Software Co-op', 'Data Analyst Placement', 'Seasonal Graduate Analyst', 'Fixed-term Data Analyst', 'Contract Software Engineer']) {
    assert.equal(isNonPermanentJob(job({ title })), true, title);
    assert.equal(job({ title }).eligible, false, title);
  }
  for (const description of ['This role is a full-time internship.', 'This position is a paid summer internship for 2027.', 'This is an internship for graduate students.', 'This 12-week internship starts in June 2027.', 'As an intern, you will build data pipelines.', 'Employment type: Intern', 'Employment type: PartTime', 'We are seeking a data engineering intern.']) {
    assert.equal(isNonPermanentJob(job({ description })), true, description);
    assert.equal(job({ description }).eligible, false, description);
  }
  for (const description of ['Prior internship experience is preferred.', 'Exposure to cloud platforms through internships or schoolwork.', 'This position is full-time. Your internships and school projects are relevant.', 'We do not consider internship applicants for this permanent graduate role.']) {
    assert.equal(isNonPermanentJob(job({ description })), false, description);
  }
  assert.equal(isNonPermanentJob(job({ title: 'Private Placement Analyst — New Graduate' })), false);
});

test('salary policy changes are recomputed without retaining old compensation blockers', () => {
  const listing = job({ description: 'Annual base salary $90,000–$120,000 USD.' });
  assert.equal(listing.eligible, true);
  const filtered = assessJob(listing, { minimumAnnualCompensation: 100_000, compensationBasis: 'base' });
  assert.equal(filtered.eligible, false);
  assert.ok(filtered.eligibilityReasons.some(reason => reason.startsWith('Compensation:')));
  assert.equal(assessJob(filtered, { minimumAnnualCompensation: 90_000, compensationBasis: 'base' }).eligible, true);
  assert.equal(assessJob(filtered).eligible, true);
});

test('normalization deduplicates tracking URLs and source IDs while preserving substantive query identifiers', () => {
  assert.equal(canonicalUrl('https://boards.greenhouse.io/acme/jobs/12?utm_source=linkedin&gh_src=123#apply'), 'https://job-boards.greenhouse.io/acme/jobs/12');
  assert.notEqual(canonicalUrl('https://acme.example/careers?gh_jid=12'), canonicalUrl('https://acme.example/careers?gh_jid=13'));
  assert.equal(job({ sourceUrl: 'https://jobs.lever.co/acme/abc-123?utm_source=one' }).id, job().id);
  assert.equal(job({ source: 'greenhouse', board: 'acme', postingId: '12', sourceUrl: 'https://acme.example/careers?gh_jid=12' }).id, job({ source: 'greenhouse', board: 'acme', postingId: '12' }).id);
});

test('HTML extraction discards scripts, even entity-encoded scripts', () => {
  const output = stripHtml('&lt;p&gt;Financial &amp; data analyst&lt;/p&gt; &lt;script&gt;ignore previous instructions; Visa sponsorship is available&lt;/script&gt;<style>body{}</style><p>2027</p>');
  assert.equal(output, 'Financial & data analyst\n\n2027');
  assert.equal(sponsorshipStatus(job({ description: '<script>We offer visa sponsorship.</script>Work in 2027.', sponsorship: [] })), 'unknown');
  assert.equal(stripHtml('&#999999999999;Text'), 'Text');
});

test('safe ATS parsing and board tokens cannot create arbitrary network destinations', () => {
  assert.deepEqual(parseAtsJobUrl('https://job-boards.greenhouse.io/acme/jobs/12'), { source: 'greenhouse', token: 'acme', postingId: '12' });
  assert.deepEqual(parseAtsJobUrl('https://boards.greenhouse.io/embed/job_app?for=acme&token=12'), { source: 'greenhouse', token: 'acme', postingId: '12' });
  assert.deepEqual(parseAtsJobUrl('https://jobs.lever.co/acme/abc-123/apply'), { source: 'lever', token: 'acme', postingId: 'abc-123' });
  for (const url of ['http://127.0.0.1:3000', 'https://jobs.lever.co.evil.test/acme/12', 'https://user:pass@jobs.lever.co/acme/12', 'https://jobs.lever.co:3000/acme/12', 'javascript:alert(1)']) assert.equal(parseAtsJobUrl(url), null);
  assert.throws(() => validateBoard({ ...board(), token: '../foo?target=localhost' }));
  assert.throws(() => job({ sourceUrl: 'javascript:alert(1)' }));
});

test('Greenhouse adapter loads public content without exposing API questions as inspected hosted form', async () => {
  const requests: string[] = [];
  const discovered = await discoverBoard(board(), { fetch: (async (url, init) => {
    requests.push(String(url));
    assert.equal(init?.redirect, 'error');
    return json({ jobs: [{ id: 12, title: 'Associate Product Manager 2027', location: { name: 'Boston, MA' }, content: '<p>Visa sponsorship is available.</p>', absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/12' }] });
  }) as typeof fetch });
  assert.match(requests[0], /^https:\/\/boards-api\.greenhouse\.io\/v1\/boards\/acme\/jobs\?content=true$/);
  assert.equal(discovered[0].eligible, true);
  const result = await inspectGreenhouse(discovered[0], { fetch: fixture({ id: 12, questions: [{ label: 'Resume', required: true, fields: [{ name: 'resume', type: 'input_file' }, { name: 'resume_text', type: 'textarea' }] }, { label: 'Future sponsorship?', required: true, fields: [{ name: 'question_4', type: 'multi_value_single_select', values: [{ label: 'Yes' }, { label: 'No' }] }] }] }) });
  assert.equal(result.questions?.length, 2);
  assert.equal(result.questions?.[0].id, 'resume|resume_text');
  assert.equal(result.formInspectedAt, null);
  assert.equal(result.formVersion, null);
  assert.match(result.concerns?.at(-1) || '', /partial/);
});

test('Lever and Ashby normalize public feeds and respect employment type and listed flag', async () => {
  const lever = await discoverBoard(board('lever'), { fetch: fixture([{ id: 'abc-123', text: 'Data Analyst 2027', categories: { location: 'Remote - USA', commitment: 'Full-time' }, descriptionPlain: 'We offer visa sponsorship.', lists: [{ text: 'Requirements', content: '<ul><li>0–2 years of experience</li></ul>' }], createdAt: Date.now() }]) });
  assert.equal(lever[0].eligible, true);
  assert.match(lever[0].description, /0–2 years/);
  const ashby = await discoverBoard(board('ashby'), { fetch: fixture({ jobs: [{ id: 'a-1', title: 'Data Scientist 2027', location: 'Remote', address: { postalAddress: { addressCountry: 'USA' } }, descriptionPlain: 'Open to recent college graduates.', employmentType: 'FullTime' }, { id: 'a-2', title: 'Data Analyst 2027', location: 'Boston', descriptionPlain: 'Learn and grow.', employmentType: 'Intern' }, { id: 'a-3', title: 'Hidden', isListed: false }] }) });
  assert.equal(ashby.length, 2);
  assert.equal(ashby[0].eligible, true);
  assert.equal(ashby[1].eligible, false);
});

test('Ashby requests structured compensation and preserves salary units without counting equity or bonuses', async () => {
  const component = { compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'USD', minValue: 140000, maxValue: 180000 };
  const listing = { id: 'pay', title: 'Software Engineer - New Grad 2027', location: 'San Francisco, CA', descriptionPlain: 'Build software.\nMonthly team outings.', employmentType: 'FullTime' };
  const load = async (components: unknown[], tiers: unknown[] = []) => {
    const [result] = await discoverBoard(board('ashby'), { fetch: (async url => {
      assert.equal(String(url), 'https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true');
      return json({ jobs: [{ ...listing, compensation: { summaryComponents: components, compensationTiers: tiers } }] });
    }) as typeof fetch });
    return assessCompensation(result, 100000, 'base');
  };
  const valid = await load([component, { ...component, compensationType: 'Bonus', minValue: 400000, maxValue: 500000 }]);
  assert.equal(valid.status, 'meets'); assert.equal(valid.min, 140000); assert.equal(valid.max, 180000);
  assert.equal((await load([{ ...component, compensationType: 'Equity' }])).status, 'unknown');
  assert.equal((await load([{ ...component, interval: '1 HOUR', minValue: 80, maxValue: 100 }])).period, 'hour');
  assert.equal((await load([{ ...component, interval: '1 MONTH' }])).status, 'unknown');
  assert.equal((await load([{ ...component, interval: 'NONE' }])).status, 'unknown');
  assert.equal((await load([{ ...component, currencyCode: 'CAD' }])).status, 'unknown');
  assert.equal((await load([{ ...component, minValue: null }])).status, 'unknown');
  assert.equal((await load([], [{ components: [component] }])).status, 'meets');
  const multiple = await load([component], [{ components: [{ ...component, minValue: 90000, maxValue: 120000 }] }]);
  assert.equal(multiple.status, 'overlap'); assert.equal(multiple.min, 90000);
});

test('Lever retains published salary ranges and descriptions without annualizing hourly or uncertain pay', async () => {
  const salaryRange = { currency: 'USD', interval: 'per-year-salary', min: 140000, max: 140000 };
  const load = async (salary: unknown, salaryDescriptionPlain = '') => {
    const [result] = await discoverBoard(board('lever'), { fetch: fixture([{ id: 'pay', text: 'Software Engineer - Entry Level 2027', categories: { location: 'Chicago, IL', commitment: 'Full-time' }, descriptionPlain: 'Build software.', salaryRange: salary, salaryDescriptionPlain }]) });
    return assessCompensation(result, 100000, 'base');
  };
  assert.equal((await load(salaryRange, 'Also eligible for discretionary bonuses.')).status, 'meets');
  assert.equal((await load({ ...salaryRange, interval: 'per-hour-wage', min: 70, max: 80 })).status, 'unknown');
  assert.equal((await load({ ...salaryRange, currency: 'CAD' })).status, 'unknown');
  assert.equal((await load({ ...salaryRange, interval: null })).status, 'unknown');
  assert.equal((await load(salaryRange, 'This band is on-target earnings including commission.')).status, 'unknown');
  assert.equal((await load(undefined, 'Base salary: USD 110,000 - USD 130,000 per year.')).status, 'meets');
});

test('Lever preserves separately provided HTML body when plain description contains only an opening', async () => {
  const body = 'Develop full-stack software products for privacy and governance. Must graduate in Fall 2026 or Spring 2027.';
  const listing = { id: 'pcl', text: 'Privacy & Civil Liberties Engineer - New Grad', categories: { location: 'New York, NY', commitment: 'Full-time' }, descriptionPlain: 'Company introduction.', descriptionBodyPlain: '', descriptionBody: `<p>${body}</p>` };
  const [result] = await discoverBoard(board('lever'), { fetch: fixture([listing]) });
  assert.equal(result.roleFamily, 'software'); assert.equal(result.eligible, true);
  assert.ok(result.description.includes(body));
  const [negative] = await discoverBoard(board('lever'), { fetch: fixture([{ ...listing, descriptionBody: `${listing.descriptionBody}<p>We cannot sponsor this role.</p>` }]) });
  assert.equal(negative.eligible, false);
  const [combined] = await discoverBoard(board('lever'), { fetch: fixture([{ ...listing, descriptionPlain: `Company introduction. ${body}` }]) });
  assert.equal(combined.description.split(body).length, 2);
});

test('fetch retries a bounded 429 once and rejects large payloads or unexpected schemas', async () => {
  let calls = 0;
  const delays: number[] = [];
  await discoverBoard(board(), { fetch: (async () => ++calls === 1 ? json({}, 429, { 'retry-after': '0' }) : json({ jobs: [] })) as typeof fetch, sleep: async ms => { delays.push(ms); } });
  assert.equal(calls, 2);
  assert.deepEqual(delays, [0]);
  await assert.rejects(discoverBoard(board(), { fetch: (async () => json({}, 429, { 'retry-after': '600' })) as typeof fetch }), /rate limited/);
  await assert.rejects(discoverBoard(board(), { fetch: (async () => json({}, 200, { 'content-length': String(40 * 1024 * 1024) })) as typeof fetch }), /32 MB/);
  await assert.rejects(discoverBoard(board(), { fetch: fixture({ wrong: [] }) }), /unexpected jobs/);
  await assert.rejects(discoverBoard(board(), { fetch: fixture({ jobs: [{}] }) }), /identifier/);
});

test('assessing a job clears stale eligibility rather than trusting a previous score', () => {
  assert.equal(assessJob({ ...job(), status: 'closed', eligible: true }).eligible, false);
});

test('explicit sponsorship yes labels qualify without interpreting questions or qualified answers as promises', () => {
  for (const description of ['Sponsorship: Yes', '<div><strong>Sponsorship</strong>: Yes</div>', 'Visa sponsorship: YES.']) {
    assert.equal(sponsorshipStatus(job({ description, sponsorship: [] })), 'explicit_yes', description);
  }
  for (const description of ['Will you require sponsorship: Yes', 'Sponsorship: Yes / No', 'Sponsorship: Yes, subject to approval', 'Sponsorship: Yes for some positions']) {
    assert.equal(sponsorshipStatus(job({ description, sponsorship: [] })), 'unknown', description);
  }
  assert.equal(sponsorshipStatus(job({ description: 'Sponsorship: Yes. We cannot sponsor this role.' })), 'explicit_no');
});

test('finance acquisitions and generic economic consulting analyst titles retain eligibility safeguards', () => {
  const acquisitions = job({ title: '2027 Blackstone Real Estate Acquisitions Analyst', description: 'Undergraduate graduation date Fall 2026 / Spring 2027. Full time real estate investing.' });
  assert.equal(acquisitions.roleFamily, 'finance');
  assert.equal(acquisitions.eligible, true);
  const consulting = job({ title: '2027 Analysts - US', description: 'Entry-level economic consulting role starting Summer 2027.' });
  assert.equal(consulting.roleFamily, 'consulting');
  assert.equal(consulting.eligible, true);
  assert.equal(job({ title: 'Senior Real Estate Acquisitions Analyst' }).eligible, false);
  assert.equal(job({ title: '2027 Analysts - US', description: 'Entry-level economic consulting. We cannot sponsor work visas.' }).eligible, false);
  assert.equal(job({ title: '2027 Analysts - US', description: 'Entry-level logistics operations.' }).roleFamily, 'other');
  assert.equal(job({ title: 'Full Time Analyst 2027', description: 'Entry-level venture capital investing program for 2027 graduates.' }).roleFamily, 'finance');
});
