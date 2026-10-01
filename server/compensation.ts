import type { Job, CompensationAssessment } from '../shared/types.js';
export type { CompensationAssessment } from '../shared/types.js';
type Candidate = Omit<CompensationAssessment, 'status' | 'sourceUrl' | 'checkedAt'>;
const currencyPattern = String.raw`(?:US\$|CA\$|C\$|AU\$|A\$|NZ\$|HK\$|SG\$|USD|CAD|AUD|NZD|HKD|SGD|EUR|GBP|\$|€|£)`;
const numberPattern = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?`;
const baseWords = /\b(?:base\s+(?:salary|pay|compensation)|annual\s+(?:base\s+)?salary|salary\s+range|salary)\b/i;
const totalWords = /\b(?:total\s+(?:annual\s+)?(?:compensation|cash\s+compensation|remuneration)|annual\s+total\s+compensation)\b/i;
const oteWords = /\b(?:OTE|on[ -]target\s+earnings|commission(?:s|able)?)\b/i;
const benefitWords = /\b(?:bonus|bonuses|equity|stock|RSUs?|401\s*\(?k\)?|retirement|match|stipend|allowance|relocation|sign[ -]on|signing|insurance|benefits?|reimbursement)\b/i;

function compensationAnchor(text: string): { basis: 'base' | 'total'; index: number } | undefined {
  const anchors = [...text.matchAll(new RegExp(`${totalWords.source}|${baseWords.source}`, 'gi'))];
  const last = anchors.at(-1);
  return last ? { basis: totalWords.test(last[0]) ? 'total' : 'base', index: last.index! } : undefined;
}

function isUSLocation(location: string): boolean {
  return /\b(?:United States|USA|U\.S\.|US|New York|Chicago|Boston|San Francisco|Seattle|Los Angeles|California|Texas|Illinois)\b/i.test(location)
    || /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/.test(location);
}
function currencyOf(marker: string, job: Job, context: string): string {
  const normalized = marker.toUpperCase();
  if (/^(?:USD|US\$)$/.test(normalized)) return 'USD';
  if (/^(?:CAD|CA\$|C\$)$/.test(normalized)) return 'CAD';
  if (/^(?:AUD|AU\$|A\$)$/.test(normalized)) return 'AUD';
  if (/^(?:NZD|NZ\$)$/.test(normalized)) return 'NZD';
  if (/^(?:HKD|HK\$)$/.test(normalized)) return 'HKD';
  if (/^(?:SGD|SG\$)$/.test(normalized)) return 'SGD';
  if (/^(?:EUR|€)$/.test(normalized)) return 'EUR';
  if (/^(?:GBP|£)$/.test(normalized)) return 'GBP';
  if (normalized === '$') {
    if (/\b(?:CAD|Canadian dollars?)\b/i.test(context)) return 'CAD';
    if (/\b(?:AUD|Australian dollars?)\b/i.test(context)) return 'AUD';
    if (/\b(?:USD|U\.?S\.? dollars?)\b/i.test(context) || isUSLocation(job.location)) return 'USD';
  }
  return 'unknown';
}
function monetaryCandidates(job: Job): Candidate[] {
  const description = job.description.replace(/\u00a0/g, ' ');
  const money = new RegExp(String.raw`(?<![\w])(?:(?<prefix>${currencyPattern})[ \t]*)?(?<low>${numberPattern})[ \t]*(?<scale>[kK])?(?:[ \t]*(?<suffix>USD|CAD|AUD|NZD|HKD|SGD|EUR|GBP))?(?:[ \t]*(?:[-–—]|to|and)[ \t]*(?:(?<prefix2>${currencyPattern})[ \t]*)?(?<high>${numberPattern})[ \t]*(?<scale2>[kK])?(?:[ \t]*(?<suffix2>USD|CAD|AUD|NZD|HKD|SGD|EUR|GBP))?)?(?![\w,])`, 'g');
  const result: Candidate[] = [];
  for (const match of description.matchAll(money)) {
    const groups = match.groups!;
    const marker = groups.suffix2 || groups.suffix || groups.prefix || groups.prefix2;
    if (!marker) continue;
    const start = match.index!;
    const end = start + match[0].length;
    const previousSentence = description.lastIndexOf('. ', start - 1);
    const previousSemicolon = description.lastIndexOf('; ', start - 1);
    const lineStart = Math.max(description.lastIndexOf('\n', start - 1) + 1, previousSentence < 0 ? 0 : previousSentence + 2, previousSemicolon < 0 ? 0 : previousSemicolon + 2);
    const nextLine = description.indexOf('\n', end);
    const nextSentence = description.indexOf('. ', end);
    const nextSemicolon = description.indexOf('; ', end);
    const lineEnd = Math.min(...[nextLine, nextSentence < 0 ? -1 : nextSentence + 1, nextSemicolon].filter(index => index >= 0), description.length);
    const line = description.slice(lineStart, lineEnd).trim();
    const before = description.slice(lineStart, start);
    const after = description.slice(end, lineEnd);
    const preceding = description.slice(Math.max(0, lineStart - 2400), lineStart);
    const heading = preceding.trim().split('\n').filter(Boolean).at(-1)?.trim() || '';
    // State-specific disclosures do not establish pay for a posting located in
    // another state. Keep them in research until pay for the actual office is known.
    const stateScope = heading.match(/^for\s+(California|New York|Washington|Colorado|Massachusetts|Connecticut|Maryland|Nevada|Rhode Island)\s+(?:based\s+)?applicants?\b/i)?.[1];
    const stateCode: Record<string,string> = {California:'CA','New York':'NY',Washington:'WA',Colorado:'CO',Massachusetts:'MA',Connecticut:'CT',Maryland:'MD',Nevada:'NV','Rhode Island':'RI'};
    if (stateScope && !new RegExp(`(?:\\b${stateScope}\\b|,\\s*${stateCode[stateScope]}\\b)`, 'i').test(job.location)) continue;
    const payHeading = heading.length < 180 && /\b(?:salary|pay\s+(?:range|scale)|compensation)\b/i.test(heading);
    // Direct salary statements or an immediately preceding pay heading are
    // required: a benefit, funding round, or arbitrary company metric is not pay.
    const local = `${before} ${after}`;
    const beforeAnchor = compensationAnchor(before);
    const directKind = beforeAnchor?.basis ?? compensationAnchor(after)?.basis;
    const directBase = directKind === 'base';
    const directTotal = directKind === 'total';
    if (!directBase && !directTotal && !payHeading && !/\b(?:hourly|annual)\s+(?:pay|rate)\b/i.test(local)) continue;
    if (!directBase && !directTotal && payHeading && before.trim() && !/^\s*(?:from|up to|starting at|at least|between)\s*$/i.test(before)) continue;

    let basis: Candidate['basis'] = 'unknown';
    const context = payHeading ? `${preceding}\n${line}` : line;
    if (directTotal) basis = 'total';
    else if (directBase) basis = 'base';
    else if (payHeading && totalWords.test(heading)) basis = 'total';
    else if (payHeading && baseWords.test(heading)) basis = 'base';
    else if (payHeading && /\bannual\s+base\s+salary\s+listed\s+does\s+not\s+include\b/i.test(preceding)) basis = 'base';
    else if (payHeading && /salary range for non[ -]commissionable roles/i.test(preceding)
      && ['product', 'data', 'software'].includes(job.roleFamily)
      && !/\b(?:sales|account\s+executive|business\s+development)\b/i.test(job.title)) basis = 'base';
    else if (payHeading && baseWords.test(preceding) && !totalWords.test(preceding) && !oteWords.test(preceding)) basis = 'base';
    else if (/\b(?:hourly|annual)\s+(?:pay|rate)\b/i.test(local)) basis = 'base';

    // For mixed sentences, only the amount attached to salary is base. Never
    // count "salary $80k plus $40k bonus" or an equity grant as base salary.
    const priorAmounts = [...before.matchAll(new RegExp(currencyPattern, 'g'))];
    const priorAmount = priorAmounts.at(-1)?.index ?? -1;
    const nearAfter = after.slice(0, 90);
    if (priorAmount >= 0 && (!beforeAnchor || beforeAnchor.index < priorAmount)) continue;
    if (!directTotal && /\b(?:bonus|equity|stock|401\s*\(?k\)?|stipend|allowance|relocation|signing|insurance|reimbursement)\s*(?:of|:|is|up to)?\s*$/i.test(before)) continue;
    if (!directTotal && benefitWords.test(nearAfter) && !/^\s*(?:USD|per\s+(?:year|annum)|a\s+year|annually|yearly)?\s*[,;]?(?:\s*(?:plus|and|with|excluding|excluding any|not including|does not include)|\s*\+)/i.test(nearAfter)) {
      if (!/\b(?:salary|base pay)\b/i.test(before)) continue;
    }
    if (oteWords.test(local) && !/\b(?:does not include|excluding|exclusive of)\b/i.test(local)) basis = 'unknown';

    const currency = currencyOf(marker, job, `${heading} ${line}`);
    const markers = [groups.prefix, groups.suffix, groups.prefix2, groups.suffix2].filter(Boolean).map(value => currencyOf(value, job, `${heading} ${line}`));
    if (markers.some(value => value !== 'unknown' && value !== currency)) continue;
    let low = Number(groups.low.replace(/,/g, '')) * (groups.scale ? 1000 : 1);
    let high = groups.high ? Number(groups.high.replace(/,/g, '')) * (groups.scale2 ? 1000 : 1) : low;
    if (groups.high && !groups.scale && groups.scale2 && low < 1000) low *= 1000;
    if (groups.high && groups.scale && !groups.scale2 && high < 1000) high *= 1000;
    if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high < low) continue;
    let period: Candidate['period'] = 'unknown';
    const periodContext = `${payHeading ? heading : ''} ${line}`;
    if (/\b(?:hourly|per\s+hour|an?\s+hour)\b|\/\s*(?:h|hr|hour)\b/i.test(periodContext)) period = 'hour';
    else if (/\b(?:monthly|weekly|daily|per\s+(?:month|week|day)|an?\s+(?:month|week|day))\b|\/\s*(?:mo|month|wk|week|day)\b/i.test(periodContext)) period = 'unknown';
    else if (/\b(?:annual(?:ly)?|yearly|per\s+(?:year|annum)|an?\s+year)\b|\/\s*(?:yr|year)\b/i.test(periodContext)) period = 'year';
    else if (low >= 20_000 && currency === 'USD' && (basis === 'base' && (baseWords.test(context) || payHeading))) period = 'year';

    let min: number | null = low;
    let max: number | null = high;
    if (!groups.high && /\b(?:up to|maximum(?: of)?|as much as)\s*$/i.test(before)) min = null;
    if (!groups.high && /\b(?:from|starting at|at least|minimum(?: of)?)\s*$/i.test(before)) max = null;
    const basisQuote = payHeading && !baseWords.test(heading) && !totalWords.test(heading)
      ? preceding.match(/[^\n.]*annual base salary listed does not include[^\n.]*(?:\.|$)/i)?.[0]?.trim()
        || preceding.match(/[^\n.]*salary range for non[ -]commissionable roles[^\n.]*(?:\.|$)/i)?.[0]?.trim()
      : '';
    const excerpt = payHeading ? `${basisQuote ? `${basisQuote}\n…\n` : ''}${heading}\n${line}` : line;
    result.push({ min, max, currency, basis, period, excerpt });
  }
  return result;
}

export function assessCompensation(job: Job, minimum: number | null, basis: 'base' | 'total'): CompensationAssessment {
  const empty: CompensationAssessment = { min: null, max: null, currency: 'unknown', basis: 'unknown', period: 'unknown', excerpt: '', sourceUrl: job.sourceUrl, checkedAt: job.fetchedAt, status: 'unknown' };
  const candidates = monetaryCandidates(job);
  const annualUSD = candidates.filter(candidate => candidate.currency === 'USD' && candidate.period === 'year');
  let matching = annualUSD.filter(candidate => candidate.basis === basis);
  // A disclosed annual base salary is a lower bound for total compensation.
  // Preserve its label; never invent a bonus/equity total.
  if (basis === 'total' && !matching.length) matching = annualUSD.filter(candidate => candidate.basis === 'base');
  const chosen = matching.length ? matching : candidates.filter(candidate => candidate.basis === basis);
  const display = chosen.length ? chosen : candidates;
  if (!display.length) return empty;
  const sameKind = display.filter(candidate => candidate.currency === display[0].currency && candidate.basis === display[0].basis && candidate.period === display[0].period);
  const min = sameKind.some(candidate => candidate.min === null) ? null : Math.min(...sameKind.map(candidate => candidate.min!));
  const max = sameKind.some(candidate => candidate.max === null) ? null : Math.max(...sameKind.map(candidate => candidate.max!));
  const result: CompensationAssessment = { ...empty, ...sameKind[0], min, max, excerpt: [...new Set(sameKind.map(candidate => candidate.excerpt))].join('\n…\n') };
  if (minimum === null || !matching.length || !Number.isFinite(minimum) || minimum < 0) return result;
  if (min !== null && min >= minimum) result.status = 'meets';
  else if (basis === 'total' && result.basis === 'base') result.status = 'unknown';
  else if (max !== null && max < minimum) result.status = 'below';
  else result.status = 'overlap';
  return result;
}

export function compensationEligibilityReasons(job: Job, minimum: number | null, basis: 'base' | 'total'): string[] {
  if (minimum === null) return [];
  const assessment = assessCompensation(job, minimum, basis);
  const target = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(minimum);
  if (assessment.status === 'meets') return [];
  if (assessment.status === 'below') return [`Compensation: advertised annual ${basis} pay is below ${target}`];
  if (assessment.status === 'overlap') return [`Compensation: advertised annual ${basis} range does not guarantee the ${target} minimum`];
  return [`Compensation: annual USD ${basis} pay of at least ${target} needs verification`];
}
