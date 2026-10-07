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
 const source = path.resolve(file); const bytes = readPdf(source);
 return captureResume(rt, dataDirectory, path.basename(source), bytes, source);
}

export async function registerResumeUpload(rt: Runtime, dataDirectory: string, filename: string, base64: string) {
 if (!filename || path.basename(filename) !== filename || /[\\/\x00-\x1f]/.test(filename) || !/\.pdf$/i.test(filename) || filename.length > 255) throw new Error('Choose a PDF file with a valid filename.');
 if (!base64 || base64.length > 28_000_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error('The uploaded PDF is invalid or exceeds 20 MB.');
 const bytes = Buffer.from(base64, 'base64');
 if (bytes.length < 5 || bytes.length > 20 * 1024 * 1024 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Choose a complete PDF under 20 MB.');
 return captureResume(rt, dataDirectory, filename, bytes);
}

async function captureResume(rt: Runtime, dataDirectory: string, filename: string, bytes: Buffer, source?: string) {
 const sha256 = digest(bytes);
 const previous = (await rt.store.read()).profile.resume;
 const directory = path.join(dataDirectory, 'artifacts', 'resumes');
 await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
 const target = path.join(directory, `resume-${sha256}.pdf`);
 const resume: Resume = { path: target, originalPath: source ?? target, filename, sha256 };
 try { await writeFile(resume.path, bytes, { flag: 'wx', mode: 0o600 }); }
 catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
 // Existing content-addressed copies must verify; never overwrite a corrupt one.
 verifiedResumeBytes(resume); await chmod(resume.path, 0o600);
 return rt.engine.replaceResume(resume, previous.sha256);
}
