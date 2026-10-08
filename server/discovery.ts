import { createHash } from 'node:crypto';
import type { Board, FormQuestion, Job, Settings, RoleFamily, SponsorshipEvidence, SponsorshipStatus } from '../shared/types.js';
import { compensationEligibilityReasons } from './compensation.js';

type Row = Record<string, unknown>;
export interface FetchOptions { fetch?: typeof fetch; sleep?: (milliseconds: number) => Promise<void> }
const object = (value: unknown): Row => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
const hash = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 24);
const date = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const MAX_BYTES = 32 * 1024 * 1024;

/** No arbitrary URL is ever fetched: adapters construct fixed public ATS endpoints. */
export function validateBoard(board: Board): Board {
  if (!['greenhouse', 'lever', 'ashby'].includes(board.source)) throw new Error('Unsupported board source');
  if (!TOKEN.test(board.token)) throw new Error('Board token must contain only letters, numbers, underscores, or hyphens');
  if (!board.company?.trim() || board.company.length > 200) throw new Error('A company name is required');
  return board;
}

function webUrl(value: string): URL {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Expected an HTTP(S) URL without credentials');
  return url;
}

export function canonicalUrl(value: string): string {
  const url = webUrl(value);
  url.hash = '';
  if (url.hostname === 'boards.greenhouse.io') url.hostname = 'job-boards.greenhouse.io';
  if (['job-boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com'].includes(url.hostname)) url.protocol = 'https:';
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || /^(ref|source|referrer|gh_src|lever-source|lever-origin|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

export function parseAtsJobUrl(value: string): { source: Board['source']; token: string; postingId: string } | null {
  let url: URL;
  try { url = webUrl(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.port) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(url.hostname)) {
    const token = parts[0] === 'embed' ? url.searchParams.get('for') || '' : parts[0] || '';
    const postingId = parts[0] === 'embed' ? url.searchParams.get('token') || '' : parts[1] === 'jobs' ? parts[2] || '' : '';
    if (TOKEN.test(token) && /^\d+$/.test(postingId)) return { source: 'greenhouse', token, postingId };
  }
  if (url.hostname === 'jobs.lever.co' || url.hostname === 'jobs.ashbyhq.com') {
    if (TOKEN.test(parts[0] || '') && /^[a-zA-Z0-9-]{1,100}$/.test(parts[1] || '') && !['apply', 'jobs'].includes(parts[1])) {
      return { source: url.hostname === 'jobs.lever.co' ? 'lever' : 'ashby', token: parts[0], postingId: parts[1] };
    }
  }
  return null;
}

/** Plain-text extraction only, never an HTML renderer. Decode before removing scripts. */
export function stripHtml(value: string): string {
  let text = value;
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
  for (let n = 0; n < 3; n++) {
    text = text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? whole;
      const code = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
    });
  }
  return text.replace(/<!--[^]*?(?:-->|$)/g, ' ')
    .replace(/<(script|style|template|noscript)\b[^>]*>[^]*?(?:<\/\1\s*>|$)/gi, ' ')
    .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|br|section|article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/[\t\r ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function publicJson(url: string, options: FetchOptions = {}): Promise<unknown> {
  const fetcher = options.fetch ?? fetch;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetcher(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } });
      if (response.status === 429 && attempt === 0) {
        const retry = response.headers.get('retry-after');
        const delay = !retry ? 1000 : /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now());
        await response.body?.cancel();
        if (!Number.isFinite(delay) || delay > 3000) throw new Error('ATS rate limited this request; try again later');
        await (options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(delay);
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`ATS request failed (HTTP ${response.status})`); }
      if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('ATS response exceeds 32 MB limit'); }
      if (!response.body) throw new Error('Empty ATS response');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('ATS response exceeds 32 MB limit'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } finally { clearTimeout(timeout); }
  }
  throw new Error('ATS rate limited this request; try again later');
}

function sponsorshipClauses(text: string): string[] {
  return text.split(/(?:[.!?](?:\s|$)|\n)/).map(s => s.trim()).filter(s => /sponsor|visa|immigration/i.test(s));
}
function isNegativeSponsorship(clause: string): boolean {
  const text = clause.replace(/[’‘]/g, "'").toLowerCase().replace(/\b(?:cannot|can't|do not|don't)\s+guarantee\b[^;.!?\n]{0,80}\bsponsorship\b/g, 'uncertain sponsorship');
  if (/\bnot\s+(?:unable|ineligible)\b/.test(text)) return false;
  return [
    /\b(?:cannot|can't|unable|ineligible|not eligible|will not|won't|do not|does not|don't|doesn't|not able|are not able|is not able)\b[^.!?\n]{0,100}\b(?:sponsor|sponsorship)\b/,
    /\bno\s+(?:(?:visa|immigration|employment|work|employer|h-?1b)\s+){0,3}sponsorship\b/,
    /\bwithout\s+(?:the\s+need\s+for\s+|requiring\s+|needing\s+|any\s+)?(?:(?:visa|immigration|employment|work|employer|h-?1b|future)\s+){0,3}sponsorship\b/,
    /\bsponsorship\b[^.!?\n]{0,60}\b(?:not (?:available|provided|offered|supported|possible)|unavailable|cannot be|will not be|won't be)\b/,
    /\b(?:not|never)\s+(?:currently\s+)?(?:offer(?:ing)?|provid(?:e|ing)|support(?:ing)?|consider(?:ing)?)\b[^.!?\n]{0,40}\bsponsorship\b/,
    /\b(?:must not|cannot|can't)\s+(?:now or in the future\s+)?require\b[^.!?\n]{0,40}\bsponsorship\b/,
    /\bsponsorship\s*:\s*no\b/,
  ].some(pattern => pattern.test(text));
}
function isPositiveSponsorship(clause: string): boolean {
  if (isNegativeSponsorship(clause) || /\b(?:may|might|possibly|potentially|case.by.case|if eligible|not all|subject to|cannot guarantee|not guaranteed|not unable)\b/i.test(clause)) return false;
  return /\b(?:visa|immigration|h-?1b|work permit)\s+sponsorship\s+(?:is\s+|will be\s+)?(?:available|provided|offered|supported)\b/i.test(clause)
    || /^\s*(?:(?:visa|immigration|employment|work|h-?1b)\s+)?sponsorship\s*:\s*yes\s*[.!]?\s*$/i.test(clause)
    || /\b(?:we|company|employer)\s+(?:(?:can|will|do)\s+)?(?:offer|offers|provide|provides|support|supports)\s+(?:employment\s+|work\s+|visa\s+|immigration\s+|h-?1b\s+)?sponsorship\b/i.test(clause)
    || /\bwill\s+provide\s+(?:post-hire\s+)?immigration\s+support\b/i.test(clause)
    || /\b(?:is|are)\s+supportive\s+of\s+(?:US\s+|U\.S\.\s+)?(?:visa\s+|immigration\s+|employment\s+)?sponsorship\s+for\s+this\s+(?:role|position)\b/i.test(clause)
    || /\b(?:we|company|employer)\s+(?:(?:can|will)\s+)?sponsor\s+(?:work\s+|employment\s+|h-?1b\s+)?visas?\b/i.test(clause);
}
function descriptionEvidence(job: Job): SponsorshipEvidence[] {
  return sponsorshipClauses(job.description).flatMap(excerpt => {
    const status: SponsorshipStatus = isNegativeSponsorship(excerpt) ? 'explicit_no' : isPositiveSponsorship(excerpt) ? 'explicit_yes' : 'unknown';
    return status === 'unknown' ? [] : [{ id: `text-${hash(`${job.id}:${excerpt}`)}`, status, sourceUrl: job.sourceUrl, excerpt, checkedAt: job.fetchedAt, employerName: job.company, scope: 'role', entityMatch: true }];
  });
}
const entity = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');
function evidenceValid(evidence: SponsorshipEvidence, job: Job, now = Date.now()): boolean {
  if (!evidence.entityMatch || entity(evidence.employerName) !== entity(job.company) || !evidence.excerpt.trim() || !date(evidence.checkedAt)) return false;
  try { webUrl(evidence.sourceUrl); } catch { return false; }
  return Date.parse(evidence.checkedAt) <= now + 86_400_000;
}
export function sponsorshipStatus(job: Job, now = Date.now()): SponsorshipStatus {
  const evidence = [...job.sponsorship, ...descriptionEvidence(job)].filter(e => evidenceValid(e, job, now));
  if (evidence.some(e => e.status === 'explicit_no' || (e.scope === 'role' && isNegativeSponsorship(e.excerpt)))) return 'explicit_no';
  if (evidence.some(e => e.status === 'explicit_yes' && e.scope === 'role' && isPositiveSponsorship(e.excerpt) && now - Date.parse(e.checkedAt) <= 180 * 86_400_000)) return 'explicit_yes';
  if (evidence.some(e => e.status === 'history_only' && e.scope === 'employer' && now - Date.parse(e.checkedAt) <= 730 * 86_400_000)) return 'history_only';
  return 'unknown';
}

export function roleFamily(title: string): RoleFamily {
  if (/\b(?:sales\s*(?:&|and)\s*trading|wealth\s+management|asset\s+management|private\s+bank|real estate acquisitions)\b/i.test(title)) return 'finance';
  if (/\b(?:marketing|marketer|seo|content strategist|brand manager|growth manager|social media)\b/i.test(title)) return 'marketing';
  if (/\b(?:mechanical|mechatronics|thermal|propulsion)\b/i.test(title) && !/\b(?:software|swe|developer)\b/i.test(title)) return 'mechanical';
  if (/\b(?:ux|ui|product designer|graphic design|visual design|design researcher)\b/i.test(title)) return 'design';
  if (/\b(?:operations|supply chain|logistics|procurement)\b/i.test(title)) return 'operations';
  if (/\b(?:account executive|sales|business development)\b/i.test(title)) return 'sales';
  if (/\b(?:account\s+executive|account\s+manager|sales|business\s+development|recruiter|talent\s+acquisition)\b/i.test(title)) return 'other';
  if (/\b(?:product\s+(?:manager|management|analyst)|apm)\b/i.test(title)) return 'product';
  if (/\b(?:data|analytics|business intelligence|machine learning|statistical|bi analyst)\b/i.test(title)) return 'data';
  if (/\b(?:financ\w*|investment|banking|quantitative|quant|treasury|risk|valuation|equity|portfolio|accounting|fp&a|credit|fundamental research analyst|discretionary trader)\b/i.test(title)) return 'finance';
  if (/\b(?:consult\w*|strategy|strategic|business analyst)\b/i.test(title)) return 'consulting';
  if (/\b(?:hardware|fpga|electrical|mechanical|civil|manufacturing|chemical|aerospace|firmware|propulsion|thermal|structural|robotics|industrial|materials|avionics|mechatronics)\b/i.test(title) && !/\b(?:software|swe|developer|frontend|backend|full.stack)\b/i.test(title)) return 'engineering';
  if (/\b(?:software|swe|developer|programmer|forward deployed|systems? engineer|test engineer|devops|site reliability)\b/i.test(title)) return 'software';
  return 'other';
}
const US_STATES = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming';
function usLocation(location: string): boolean {
  return /\b(?:United States|USA|U\.S\.(?:A\.)?|US|New York City|NYC|San Francisco|Seattle|Chicago|Boston|Los Angeles|Washington,? DC)\b/i.test(location)
    || new RegExp(`\\b(?:${US_STATES})\\b`, 'i').test(location)
    || /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:\b|$)/.test(location);
}

/** This profile is a BA candidate expecting June 2027 graduation. */
function advancedDegreeRequired(title: string, description: string): boolean {
  const normalize = (text: string) => text.replace(/[’‘]/g, "'").replace(/ph\.d\.?/gi, 'PhD');
  const degree = /\b(?:phd|doctorate|doctoral|master'?s?(?:\s+degree)?)\b/i;
  const bachelors = /\b(?:bachelor'?s?|undergraduate|ba|bs|bsc|b\.a|b\.s)\b/i;
  if (degree.test(normalize(title)) && !bachelors.test(normalize(title))) return true;
  return normalize(description).split(/[.!?\n;]/).some(clause => degree.test(clause) && !bachelors.test(clause)
    && !/\b(?:preferred|optional|nice.to.have|not required)\b/i.test(clause)
    && (/\b(?:require[ds]?|must|minimum|qualification|you have|hold|pursuing|completed|earned|possess)\b[^]*\b(?:phd|doctorate|doctoral|master'?s?)\b/i.test(clause)
      || /\b(?:phd|doctorate|doctoral|master'?s?)\b[^]*\b(?:required|requirement|mandatory)\b/i.test(clause)));
}

function dateCompatibility(text: string, year = 2027, graduationMonth = 6): { conflict: boolean; juneStart: boolean } {
  const months = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
  const monthIndex: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  let conflict = false;
  let juneStart = false;
  for (const clause of text.split(/[\n.!?]/)) {
    const graduation = /\bgraduat\w*\b/i.test(clause);
    const employmentStart = !/\b(?:applications?|recruiting|recruitment|interviews?)\b/i.test(clause) && /\b(?:start(?:s|ing)?|commenc\w*|join(?:s|ing)?)\b/i.test(clause);
    if (!graduation && !employmentStart) continue;
    const dates = [...clause.matchAll(new RegExp(`\\b${months}\\s+(?:\\d{1,2}(?:st|nd|rd|th)?[, ]+)?${year}\\b`, 'gi'))];
    if (!dates.length) continue;
    const values = dates.map(match => monthIndex[match[1].slice(0, 3).toLowerCase()]);
    const range = dates.length >= 2 && /\b(?:between|through|to|and)\b|[-–]/i.test(clause);
    if (range && Math.min(...values) <= graduationMonth && Math.max(...values) >= graduationMonth) continue;
    if (values.every(month => month < graduationMonth)) conflict = true;
    if (graduation && values.includes(graduationMonth) && /\b(?:prior to|before)\s+/i.test(clause)) conflict = true;
    if (employmentStart && values.includes(graduationMonth)) juneStart = true;
  }
  return { conflict, juneStart };
}

function experienceRequirements(description: string): { minimum: number; preferred: boolean }[] {
  const requirements: { minimum: number; preferred: boolean }[] = [];
  const numberWords: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  for (const clause of description.split(/[.!?\n;]/)) {
    // Some boards publish structured experience as "Min Yr = 1Max Yr = 3+".
    // The maximum is a range endpoint, not a three-year minimum.
    for (const match of clause.matchAll(/\bmin(?:imum)?\s*(?:years?|yrs?|yr)\s*[:=]\s*(\d{1,2})(?=\s*max\b|\b)/gi)) {
      const preferred = /\b(?:preferred|nice.to.have|optional|not required)\b/i.test(clause);
      requirements.push({ minimum: Number(match[1]), preferred });
    }
    // Match the qualification, including "8+ years in ...", not only the narrow
    // "years of experience" phrase. Company tenure and program duration are not qualifications.
    for (const match of clause.matchAll(/\b(\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\+|(?:[-–—]|to)\s*\d{1,2})?\s*(?:years?|yrs?)\b['’]?(?=([^]{0,180}))/gi)) {
      const after = match[2];
      const before = clause.slice(Math.max(0, match.index! - 90), match.index);
      if (/\b(?:our company|our firm|our team|founded|established|in business|serving customers)\b/i.test(before)) continue;
      if (/\bwe(?:'ve| have)?\s+spent\s*$/i.test(before)) continue;
      const experience = /\bexperience\b/i.test(after) || /^\s+(?:in|with|working|building|developing|leading|managing|designing|delivering|supporting|implementing)\b/i.test(after);
      if (!experience || /^\s+(?:program|degree|course|ago|old|since|anniversary)\b/i.test(after)) continue;
      const preferred = /\b(?:preferred|nice.to.have|a plus|an advantage|optional|not required)\b/i.test(`${before} ${after}`);
      requirements.push({ minimum: numberWords[match[1].toLowerCase()] ?? Number(match[1]), preferred });
    }
  }
  return requirements;
}

function earlyCareerEvidence(title: string, description: string, experience: ReturnType<typeof experienceRequirements>): { title: boolean; description: boolean; excluded: boolean } {
  const titleSignal = /\b(?:new[ -]?(?:college[ -]+)?grad\w*|recent[ -]?grad\w*|university grad\w*|graduate|entry[ -]level|early[ -]career|associate|junior|apm)\b|\b(?:analyst|engineer|scientist|consultant)\s+(?:i|1)\b|\bfull[ -]?time analyst\b[^]*\b20\d{2}\b|\b20\d{2}\b[^]*\bfull[ -]?time analyst\b/i.test(title);
  const clauses = description.split(/[.!?\n;]/);
  const earlyWords = /\b(?:(?:new|recent|college|university)[ -]+grad\w*|entry[ -]level|early[ -]career)\b/i;
  const excluded = clauses.some(clause => earlyWords.test(clause) && /\b(?:not intended|not suitable|not open|not eligible|not for|do not consider|do not accept|exclude[sd]?)\b/i.test(clause));
  const descriptionSignal = clauses.some(clause => {
    if (/\b(?:mentor|coach|supervise|manage|lead)\b[^]{0,70}\b(?:(?:new|recent)[ -]+grad\w*|entry[ -]level|early[ -]career)\b/i.test(clause)) return false;
    return earlyWords.test(clause)
      || /\bno\s+(?:(?:prior|previous|professional|work|industry|full.time)\s+)*experience\s+(?:is\s+)?(?:required|necessary|needed)\b/i.test(clause)
      || /\b(?:you\s+must\s+have|candidates?\s+must\s+have|requires?)\s+(?:at\s+least\s+)?internship\s+experience\b/i.test(clause)
      || /\b(?:20\d{2}\s+graduates?|graduates?\s+(?:in\s+)?20\d{2})\b/i.test(clause)
      || /\b(?:you\s+(?:will|must|should)\s+graduate|graduating\s+(?:in|between|by)|expected\s+graduation|graduation\s+date)\b[^]{0,120}\b20\d{2}\b/i.test(clause);
  });
  return { title: titleSignal, description: descriptionSignal || experience.some(requirement => !requirement.preferred && requirement.minimum <= 2), excluded };
}

export function isNonPermanentJob(job: Pick<Job, 'title' | 'description'>): boolean {
  if (/\b(?:interns?|internships?|co[ -]?ops?|part[ -]?time|temporary|temp|seasonal|fixed[ -]term|contract(?:or|ual)?)\b/i.test(job.title)) return true;
  if (/\bplacements?\b/i.test(job.title) && !/\bprivate placements?\b/i.test(job.title)) return true;
  const nonPermanent = '(?:internship|intern|co[ -]?op|placement|seasonal|temporary|part[ -]?time|fixed[ -]term|contract(?:or)?)';
  const typeLine = new RegExp(`^(?:Employment|Job|Position|Work|Contract)\\s*(?:type|term|duration)?\\s*:\\s*(?:Full[ -]?Time\\s+)?${nonPermanent}\\b`, 'im');
  if (typeLine.test(job.description)) return true;
  // Only descriptions of the offered role count. Prior internships, student
  // projects, or optional internship experience do not change employment type.
  for (const clause of job.description.split(/[.!?\n;]/)) {
    const normalized = clause.replace(/[‐‑–—]/g, '-');
    const label = '(?:(?:this|the|our)\\s+(?:(?:current|open|available|offered|2027|summer)\\s+)*(?:role|position|opportunity|job|program))';
    if (new RegExp(`\\b${label}\\s+(?:is|will be|is offered as|will run as)\\s+(?:(?:a|an|paid|unpaid|full[ -]?time|summer|[a-z0-9-]+[ -](?:week|month))\\s+){0,5}${nonPermanent}\\b`, 'i').test(normalized)) return true;
    if (new RegExp(`\\bthis\\s+is\\s+(?:(?:a|an|paid|unpaid|full[ -]?time|summer)\\s+){0,4}${nonPermanent}\\b`, 'i').test(normalized)) return true;
    if (new RegExp(`\\bthis\\s+(?:(?:paid|unpaid|full[ -]?time|summer|\\d+[ -](?:week|month))\\s+){0,3}(?:internship|co[ -]?op|placement)\\b`, 'i').test(normalized)) return true;
    if (/\b(?:we are|we're)\s+(?:hiring|seeking|looking for)\s+(?:a|an)\s+(?:(?:summer|paid|unpaid|graduate|data|software|engineering)\s+){0,3}intern\b/i.test(normalized)) return true;
    if (/\bas\s+(?:a|an)\s+(?:intern|co[ -]?op)\s*,?\s+you\b/i.test(normalized)) return true;
  }
  return false;
}

export interface JobAssessmentPolicy extends Pick<Settings, 'minimumAnnualCompensation' | 'compensationBasis' | 'careerStage' | 'yearsExperience'> { graduation?: string }

export function isGraduateSoftwareStaffRole(job: Pick<Job, 'title' | 'description'>): boolean {
  return /\bMember of Technical Staff\b[^]*\bNew Grad(?:uate)?\b/i.test(job.title)
    && /\bengineering teams?\b/i.test(job.description)
    && /\b(?:software|Python|TypeScript)\b/i.test(job.description);
}

/** Transparent heuristics prioritize review; they are never an eligibility assertion. */
export function assessJob(input: Job, policy: JobAssessmentPolicy = {}): Job {
  const job: Job = { ...input, roleFamily: roleFamily(input.title), fitReasons: [], concerns: [], eligibilityReasons: [] };
  if (job.roleFamily === 'other' && /\banalysts?\b/i.test(input.title)
    && /\beconomic consulting\b/i.test(input.description)) job.roleFamily = 'consulting';
  if (job.roleFamily === 'other' && /\banalysts?\b/i.test(input.title)
    && /\b(?:venture capital|private equity|investment banking|restructuring|private placements?|capital advisory|governance advisory|financial modeling)\b/i.test(input.description)) job.roleFamily = 'finance';
  const graduateSoftwareStaff = isGraduateSoftwareStaffRole(input);
  if (job.roleFamily === 'other' && graduateSoftwareStaff) job.roleFamily = 'software';
  const privacySoftwareGraduate = /\bPrivacy (?:&|and) Civil Liberties Engineer\b[^]*\bNew Grad(?:uate)?\b/i.test(input.title)
    && /\bfull[ -]stack software products\b/i.test(input.description);
  if (privacySoftwareGraduate) job.roleFamily = 'software';
  const coreDevelopment = /^InterSystems(?: Corporation)?$/i.test(input.company.trim())
    && /^Core Development Program$/i.test(input.title.trim())
    && /\bsoftware engineering\b/i.test(input.description)
    && /\b(?:front.end|back.end|full.stack) development\b/i.test(input.description);
  const cerebrasCodesign = /^Cerebras(?: Systems(?:,? Inc\.?)?)?$/i.test(input.company.trim())
    && /^CoDesign\s*&\s*NextGen\s*[-–—]\s*New College Grad(?:uate)?$/i.test(input.title.trim())
    && /\bkernel development\b/i.test(input.description)
    && /\bsoftware products\b/i.test(input.description)
    && /\bsimulat(?:ions|ors)\b/i.test(input.description);
  if (job.roleFamily === 'other' && (coreDevelopment || cerebrasCodesign)) job.roleFamily = 'software';
  const asteraOperations = /^Astera Labs(?:,? Inc\.?)?$/i.test(input.company.trim())
    && /\bdata analysis\b/i.test(input.description)
    && ((/^Sales Operation Analyst NCG$/i.test(input.title.trim())
      && /\bbusiness systems\b/i.test(input.description) && /\b(?:reports|reporting|dashboards)\b/i.test(input.description))
      || (/^Capacity Planning NCG$/i.test(input.title.trim())
        && /\bcapacity forecasts\b/i.test(input.description) && /\b(?:Python|SQL)\b/i.test(input.description)));
  if (['other','sales','operations'].includes(job.roleFamily) && asteraOperations) job.roleFamily = 'data';
  // Sierra's APX title omits the product/engineering tracks named in its program description.
  const sierraApx = /^Sierra(?: Technologies)?(?:,? Inc\.?)?$/i.test(input.company.trim())
    && /^APX\b[^]*\bNew Grad(?:uate)?\b/i.test(input.title)
    && /\brotational program\b/i.test(input.description)
    && /\bAgent Development and Core Product\b/i.test(input.description);
  if (job.roleFamily === 'other' && sierraApx) {
    job.roleFamily = 'product';
    job.fitReasons.push('Sierra APX combines Agent Development and Core Product rotations');
  }
  const block = (reason: string) => job.eligibilityReasons.push(reason);
  let score = ({ product: 40, data: 38, finance: 35, consulting: 30, software: 27, engineering: 27, mechanical: 27, marketing: 30, sales: 30, design: 30, operations: 30, other: 0 })[job.roleFamily];
  if (job.roleFamily !== 'other') job.fitReasons.push(`${job.roleFamily} role matches a target career track`);
  else block('Role is outside the selected career tracks');
  if (job.status !== 'open') block(job.status === 'closed' ? 'Posting is closed' : 'Posting availability needs verification');
  if (!usLocation(job.location)) block('United States location not confirmed');
  else { score += 15; job.fitReasons.push('United States location listed'); }
  const stage = policy.careerStage || 'new_grad';
  const experienced = stage === 'experienced';
  const graduation = policy.graduation || (policy.careerStage ? '' : '2027-06');
  const targetYear = Number(graduation.slice(0,4));
  const targetMonth = Number(graduation.slice(5,7));
  const seniorityTitle = graduateSoftwareStaff ? job.title.replace(/\bMember of Technical Staff\b/i, '') : job.title;
  if (!experienced && /\b(?:senior|sr\.?|staff|principal|director|head|vp|vice president|lead)\b|\b(?:engineer|scientist|manager)\s+(?:ii|iii|iv)\b/i.test(seniorityTitle)) block('Title indicates a senior role');
  if (!experienced && /\bmanager\b/i.test(job.title) && job.roleFamily !== 'product') block('Management role is outside the graduate/entry-level target');
  if (/\b(?:active\s+(?:U\.?S\.?\s+)?security\s+clearance|eligibility\s+and\s+willingness\s+to\s+obtain\s+(?:a\s+)?(?:U\.?S\.?\s+)?security\s+clearance|must\s+be\s+eligible\s+to\s+obtain\s+(?:a\s+)?(?:U\.?S\.?\s+)?security\s+clearance)\b/i.test(job.description)) block('Security-clearance eligibility needs verification');
  if (advancedDegreeRequired(job.title, job.description)) block(policy.careerStage ? 'Required advanced degree needs profile verification' : 'Requires a graduate degree beyond the current BA profile');
  if (isNonPermanentJob(job)) block('Not a full-time permanent position');
  const text = `${job.title}\n${job.description}`;
  const experience = experienceRequirements(job.description);
  if (!experienced && experience.some(requirement => requirement.minimum >= 3 && !requirement.preferred)) block('Requires at least three years of experience');
  if (stage === 'early_career' && experience.some(requirement => requirement.minimum > 0 && !requirement.preferred)
    && policy.yearsExperience == null) block('Career target: confirm years of professional experience for this posting');
  if (stage === 'early_career' && policy.yearsExperience != null
    && experience.some(requirement => !requirement.preferred && requirement.minimum > policy.yearsExperience!)) block('Career target: required experience exceeds your saved years of experience');
  if (experienced && policy.yearsExperience == null) block('Career target: confirm years of professional experience');
  if (experienced && policy.yearsExperience != null && experience.some(requirement => !requirement.preferred && requirement.minimum > policy.yearsExperience!)) block('Career target: required experience exceeds your saved years of experience');
  const earlyCareer = earlyCareerEvidence(job.title, job.description, experience);
  if (!experienced && earlyCareer.excluded) block('Posting explicitly excludes graduate or entry-level applicants');
  if (!experienced && !earlyCareer.title && !earlyCareer.description) block('Graduate/entry-level suitability is not established by the posting');
  if (stage === 'early_career') {
    const cohortClauses = [job.title, ...job.description.split(/[\n.!?]/).filter(clause =>
      /\b(?:graduat\w*|class of|cohort)\b/i.test(clause)
      && !(/\bclass of\b/i.test(clause) && !/\b(?:you|candidate|applicant|student|graduat\w*|cohort|new[ -]?grad)\b/i.test(clause)))];
    const cohortYears = cohortClauses.flatMap(clause => [...clause.matchAll(/\b20(?:2\d|3[0-5])\b/g)].map(match => Number(match[0])));
    if (cohortYears.length && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(graduation)) {
      block('Career target: confirm graduation month for this cohort-restricted posting');
    } else if (cohortYears.length && !cohortYears.includes(targetYear)
      && !(cohortYears.length >= 2 && Math.min(...cohortYears) <= targetYear && Math.max(...cohortYears) >= targetYear)) {
      block(`Career target: posting graduation cohort does not include ${targetYear}`);
    }
  }
  if (stage === 'new_grad') {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(graduation)) block('Career target: confirm your graduation month in Profile');
    else {
      const cycleClauses = text.split(/[\n.!?]/).filter(clause => {
        if (!/\b(?:graduat\w*|class of|start(?:ing)?\s+(?:date|in|by)|commenc\w*)\b/i.test(clause)) return false;
        // Company accolades can be a "Class of 2026"; only a candidate class is
        // relevant to graduation compatibility.
        if (/\bclass of\b/i.test(clause) && !/\b(?:you|candidate|applicant|student|graduat\w*|cohort|new[ -]?grad)\b/i.test(clause) && !/\bclass of\b/i.test(job.title)) return false;
        return true;
      });
      const incompatibleCycle = cycleClauses.some((clause, index) => {
        const values = [...clause.matchAll(/\b20(\d{2})\b/g)].map(m => Number(m[0]));
        if (values.length === 0 || values.includes(targetYear)) return false;
        // Some graduate postings offer a separate, older recent-graduate cohort
        // after an explicitly compatible student cohort. An OR alternative is not
        // an additional requirement; unrelated start-date restrictions still apply.
        if (/^\s*\*?\s*or\b/i.test(clause) && /\bgraduat\w*\b/i.test(clause)
          && !/\b(?:start|commenc)\w*\b/i.test(clause)
          && cycleClauses[index - 1]?.includes(String(targetYear))) return false;
        if (values.length >= 2 && Math.min(...values) <= targetYear && Math.max(...values) >= targetYear) return false;
        return values.some(year => year >= 2024 && year <= 2035);
      });
      if (incompatibleCycle) block(`Explicit graduation or start cycle does not include ${targetYear}`);
      const timing = dateCompatibility(text, targetYear, targetMonth);
      if (timing.conflict) block(policy.careerStage ? `Career target: posting dates conflict with your ${graduation} graduation` : 'Explicit graduation or start date is before expected June 2027 graduation');
      if (timing.juneStart) job.concerns.push('Start month requires checking the exact graduation and work-authorization dates');
      if (targetYear && text.includes(String(targetYear))) { score += 20; job.fitReasons.push(`Posting mentions the ${targetYear} cycle; inspect exact start requirements`); }
      else job.concerns.push(`${targetYear || 'Graduation'} start date is not explicit; verify before approval`);
    }
  }
  if (earlyCareer.title) { score += 10; job.fitReasons.push('Title signals an early-career opportunity'); }
  else if (earlyCareer.description && !earlyCareer.excluded) { score += 8; job.fitReasons.push('Description explicitly supports graduate or 0–2 years experience candidates'); }
  if (/\bforward\s+deployed\b/i.test(job.title) && job.roleFamily === 'software') { score += 8; job.fitReasons.push('Forward Deployed Engineer software role'); }
  if (job.deadline && Date.parse(job.deadline) < Date.now()) block('Application deadline has passed');
  const sponsor = sponsorshipStatus(job);
  if (sponsor === 'explicit_no') block('Posting explicitly excludes required sponsorship');
  else if (sponsor === 'unknown') block('Sponsorship evidence needs research');
  else if (sponsor === 'history_only') { score += 5; job.concerns.push('Employer sponsorship history does not guarantee sponsorship for this role'); }
  else { score += 10; job.fitReasons.push('Current role text explicitly offers sponsorship'); }
  if (job.postedAt && Date.now() - Date.parse(job.postedAt) < 14 * 86_400_000 && Date.parse(job.postedAt) <= Date.now()) { score += 5; job.fitReasons.push('Published within the past two weeks'); }
  if (/\b(?:financial|finance|valuation|financial model(?:ing)?|capital markets|investment|portfolio|accounting)\b/i.test(text)) { score += 5; job.fitReasons.push('Posting describes a finance domain'); }
  job.eligibilityReasons.push(...compensationEligibilityReasons(job, policy.minimumAnnualCompensation ?? null, policy.compensationBasis ?? 'base'));
  job.eligible = job.eligibilityReasons.length === 0;
  job.score = Math.max(0, Math.min(100, score));
  return job;
}

export function normalizeJob(input: Partial<Job> & { company: string; title: string; description: string; sourceUrl: string }): Job {
  const sourceUrl = canonicalUrl(input.sourceUrl);
  const source = input.source ?? 'manual';
  const company = stripHtml(input.company).trim();
  const title = stripHtml(input.title).trim();
  if (!company || !title) throw new Error('Job company and title are required');
  const job: Job = {
    id: input.id || `job-${hash(source !== 'manual' && input.board && input.postingId ? `${source}:${input.board.toLowerCase()}:${input.postingId}` : sourceUrl)}`,
    source, board: input.board ?? '', postingId: input.postingId ?? '', company, title,
    description: stripHtml(input.description), sourceUrl, applyUrl: canonicalUrl(input.applyUrl || input.sourceUrl),
    location: stripHtml(input.location ?? ''), fetchedAt: date(input.fetchedAt) ?? new Date().toISOString(),
    postedAt: date(input.postedAt), deadline: date(input.deadline), status: input.status ?? 'unknown',
    roleFamily: 'other', sponsorship: input.sponsorship ?? [], score: 0, fitReasons: [], concerns: [], eligible: false, eligibilityReasons: [],
    questions: input.questions ?? [], formInspectedAt: input.formInspectedAt ?? null, formVersion: input.formVersion ?? null, dismissed: input.dismissed ?? false,
  };
  const supplied = job.sponsorship.filter(e => !e.id.startsWith('text-'));
  job.sponsorship = [...supplied, ...descriptionEvidence(job)];
  return assessJob(job);
}

/** Render only identified salary components; never turn bonus/equity summaries into salary. */
function salaryText(currency: unknown, interval: unknown, minimum: unknown, maximum: unknown): string {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return '';
  const periods: Record<string, string> = {
    '1 YEAR': 'year', '1 MONTH': 'month', '1 WEEK': 'week', '1 DAY': 'day', '1 HOUR': 'hour',
    'per-year-salary': 'year', 'per-month-salary': 'month', 'per-week-salary': 'week',
    'per-day-wage': 'day', 'per-hour-wage': 'hour',
  };
  const period = typeof interval === 'string' ? periods[interval] : undefined;
  if (!period) return '';
  const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER;
  if (!valid(minimum) || !valid(maximum) || maximum < minimum) return '';
  const amount = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `Published salary component (ATS)\nBase salary: ${currency} ${amount(minimum)} - ${currency} ${amount(maximum)} per ${period}.`;
}

function ashbySalaryText(value: unknown): string {
  const compensation = object(value);
  const components = [...list(compensation.summaryComponents), ...list(compensation.compensationTiers).flatMap(tier => list(object(tier).components))];
  return [...new Set(components.map(object).filter(component => component.compensationType === 'Salary')
    .map(component => salaryText(component.currencyCode, component.interval, component.minValue, component.maxValue)).filter(Boolean))].join('\n');
}

export async function discoverBoard(board: Board, options: FetchOptions = {}): Promise<Job[]> {
  validateBoard(board);
  if (!board.enabled) return [];
  const token = encodeURIComponent(board.token);
  const endpoint = board.source === 'greenhouse' ? `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`
    : board.source === 'lever' ? `https://api.lever.co/v0/postings/${token}?mode=json` : `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`;
  const data = await publicJson(endpoint, options);
  const raw = board.source === 'lever' ? data : object(data).jobs;
  if (!Array.isArray(raw)) throw new Error('ATS returned an unexpected jobs response');
  const jobs = raw.map(object).filter(row => row.isListed !== false).map(row => {
    const postingId = str(row.id) || (parseAtsJobUrl(str(row.jobUrl))?.postingId ?? '');
    if (!postingId) throw new Error('ATS posting is missing its identifier');
    const base: Partial<Job> = { source: board.source, board: board.token, postingId, company: board.company, status: 'open', sponsorship: board.sponsorship };
    if (board.source === 'greenhouse') {
      const hosted = `https://job-boards.greenhouse.io/${token}/jobs/${encodeURIComponent(postingId)}`;
      return normalizeJob({ ...base, company: board.company, title: str(row.title), description: str(row.content), location: str(object(row.location).name), sourceUrl: str(row.absolute_url) || hosted, applyUrl: hosted, postedAt: date(row.first_published), deadline: date(row.application_deadline) });
    }
    if (board.source === 'lever') {
      const categories = object(row.categories);
      const mainDescription = stripHtml(str(row.descriptionPlain) || str(row.description));
      const bodyDescription = stripHtml(str(row.descriptionBodyPlain) || str(row.descriptionBody));
      const salary = object(row.salaryRange);
      const salaryDescription = str(row.salaryDescriptionPlain) || str(row.salaryDescription);
      const uncertainBasis = /\b(?:OTE|on[ -]target earnings|total compensation|commission)\b/i.test(salaryDescription)
        && !/\bbase (?:salary|pay|compensation)\b/i.test(salaryDescription);
      const structuredSalary = uncertainBasis ? '' : salaryText(salary.currency, salary.interval, salary.min, salary.max);
      const description = [mainDescription, bodyDescription && !mainDescription.includes(bodyDescription) ? bodyDescription : '', ...list(row.lists).map(item => `${str(object(item).text)}\n${str(object(item).content)}`), str(row.additionalPlain) || str(row.additional), salaryDescription, structuredSalary, `Employment type: ${str(categories.commitment)}`].filter(Boolean).join('\n\n');
      const hosted = `https://jobs.lever.co/${token}/${encodeURIComponent(postingId)}`;
      const allLocations = list(categories.allLocations).map(str).filter(Boolean);
      const location = allLocations.length ? allLocations.join('; ') : str(categories.location);
      return normalizeJob({ ...base, company: board.company, title: str(row.text), description, location, sourceUrl: str(row.hostedUrl) || hosted, applyUrl: str(row.applyUrl) || `${hosted}/apply`, postedAt: typeof row.createdAt === 'number' ? new Date(row.createdAt).toISOString() : date(row.createdAt) });
    }
    const address = object(object(row.address).postalAddress);
    const locations = [str(row.location), str(address.addressCountry), ...list(row.secondaryLocations).map(item => `${str(object(item).location)} ${str(object(object(item).address).addressCountry)}`)].filter(Boolean).join('; ');
    const hosted = `https://jobs.ashbyhq.com/${token}/${encodeURIComponent(postingId)}`;
    return normalizeJob({ ...base, company: board.company, title: str(row.title), description: [str(row.descriptionPlain) || str(row.descriptionHtml), ashbySalaryText(row.compensation), `Employment type: ${str(row.employmentType)}`].filter(Boolean).join('\n\n'), location: locations, sourceUrl: str(row.jobUrl) || hosted, applyUrl: str(row.applyUrl) || `${hosted}/application`, postedAt: date(row.publishedAt) });
  });
  return [...new Map(jobs.map(job => [job.id, job])).values()];
}

export async function inspectGreenhouse(job: Job, options: FetchOptions = {}): Promise<Partial<Job>> {
  if (job.source !== 'greenhouse' || !TOKEN.test(job.board) || !/^\d+$/.test(job.postingId)) throw new Error('Expected a valid Greenhouse job identifier');
  const row = object(await publicJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(job.board)}/jobs/${job.postingId}?questions=true`, options));
  if (str(row.id) !== job.postingId) throw new Error('ATS returned a different posting');
  const questions: FormQuestion[] = [];
  for (const value of [...list(row.questions), ...list(row.location_questions), ...list(row.compliance)]) {
    const question = object(value);
    const fields = list(question.fields).map(object).filter(field => str(field.type) !== 'input_hidden');
    // Multiple fields can be alternatives (resume upload OR text); expose as one question.
    if (!fields.length) continue;
    questions.push({ id: fields.map(field => str(field.name)).join('|'), label: stripHtml(str(question.label)), required: question.required === true, type: fields.map(field => str(field.type)).join('|'), options: fields.flatMap(field => list(field.values).map(value => stripHtml(str(object(value).label)))) });
  }
  for (const value of list(object(row.demographic_questions).questions)) {
    const question = object(value);
    questions.push({ id: `demographic_${str(question.id)}`, label: stripHtml(str(question.label)), required: question.required === true, type: str(question.type), options: list(question.answer_options).map(value => stripHtml(str(object(value).label))) });
  }
  const updated = normalizeJob({ ...job, title: str(row.title) || job.title, description: str(row.content) || job.description, location: str(object(row.location).name) || job.location, questions, fetchedAt: new Date().toISOString(), postedAt: date(row.first_published) ?? job.postedAt, deadline: date(row.application_deadline), status: 'open', formInspectedAt: null, formVersion: null });
  updated.concerns.push('API questions are partial; hosted form, consent, and declarations still require inspection');
  return updated;
}
