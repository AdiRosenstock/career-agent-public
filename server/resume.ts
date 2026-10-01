import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CandidateProfile } from '../shared/types.js';
import type { Runtime } from './runtime.js';

type Resume = CandidateProfile['resume'];
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Read a complete, stable regular file without following a supplied symlink. */
function readPdf(file: string): Buffer {
 const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
 try {
  const before = fstatSync(descriptor);
  if (!before.isFile() || before.size < 5 || before.size > 20 * 1024 * 1024) throw new Error('Provide a complete PDF file under 20 MB.');
  const bytes = readFileSync(descriptor); const after = fstatSync(descriptor);
  if (bytes.length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
   throw new Error('Résumé PDF is incomplete, invalid, or changed while being read.');
  }
  return bytes;
 } finally { closeSync(descriptor); }
}

export function verifiedResumeBytes(resume: Resume): Buffer {
 if (!path.isAbsolute(resume.path) || !path.isAbsolute(resume.originalPath) || !/^[a-f0-9]{64}$/.test(resume.sha256) || !resume.filename || path.basename(resume.filename) !== resume.filename) throw new Error('Résumé metadata is invalid.');
 const bytes = readPdf(resume.path);
 if (digest(bytes) !== resume.sha256) throw new Error('Résumé copy does not match its SHA256.');
 return bytes;
}

/** Explicitly replace the active résumé; never rewrite source PDFs or older copies. */
export async function registerResume(rt: Runtime, dataDirectory: string, file: string) {
 if (!file?.trim()) throw new Error('Provide the new résumé PDF path.');
 const source = path.resolve(file); const bytes = readPdf(source); const sha256 = digest(bytes);
 const previous = (await rt.store.read()).profile.resume;
 const directory = path.join(dataDirectory, 'artifacts', 'resumes');
 await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
 const resume: Resume = { path: path.join(directory, `resume-${sha256}.pdf`), originalPath: source, filename: path.basename(source), sha256 };
 try { await writeFile(resume.path, bytes, { flag: 'wx', mode: 0o600 }); }
 catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
 // Existing content-addressed copies must verify; never overwrite a corrupt one.
 verifiedResumeBytes(resume); await chmod(resume.path, 0o600);
 return rt.engine.replaceResume(resume, previous.sha256);
}
