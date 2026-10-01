import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { createSeed } from '../server/seed.js';
import { validateAppState } from '../server/store.js';
import { verifiedDocumentBytes } from '../server/documents.js';
import type { AppState, CandidateDocument } from '../shared/types.js';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const body = (kind: CandidateDocument['kind']) => `%PDF-1.4 immutable ${kind} fixture`;

async function fixture() {
 const directory = await mkdtemp(path.join(tmpdir(), 'career-backup-documents-'));
 const resume = path.join(directory, 'resume.pdf');
 await writeFile(resume, '%PDF-1.4 backup resume fixture');
 const state = await createSeed({ resumePath: resume, originalPath: resume });
 state.profile.name = 'Imported supporting-document fixture';
 const documents: CandidateDocument[] = [];
 for (const kind of ['transcript', 'recommendation'] as const) {
  const saved = path.join(directory, `old-${kind}.pdf`);
  await writeFile(saved, body(kind));
  documents.push({ id: `document-${kind}`, kind, label: `Fixture ${kind}`, filename: `${kind}.pdf`,
   path: saved, originalPath: path.join(directory, 'originals', `${kind}.pdf`), sha256: hash(body(kind)),
   addedAt: '2026-09-27T12:00:00.000Z', documentDate: '2026-09-01', notes: 'Unchanged source PDF' });
 }
 state.profile.documents = documents;
 const backup = path.join(directory, 'backup.json');
 await writeFile(backup, JSON.stringify(state));
 const target = path.join(directory, 'target');
 const relocated = (document: CandidateDocument) => path.join(target, 'artifacts', 'supporting', `${document.kind}-${document.sha256}.pdf`);
 const importBackup = () => spawnSync(process.execPath, ['--import', 'tsx', 'server/cli.ts', 'import-backup', backup], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, CAREER_BACKEND: 'sqlite', CAREER_DATA_DIR: target, CAREER_RESUME_PATH: resume },
  encoding: 'utf8', timeout: 10_000,
 });
 const readState = (): AppState => {
  const db = new Database(path.join(target, 'career-agent.sqlite'), { readonly: true });
  try { return validateAppState(JSON.parse((db.prepare('SELECT payload FROM agent_state WHERE id=1').get() as { payload: string }).payload)); }
  finally { db.close(); }
 };
 const copyToTarget = async (document: CandidateDocument, bytes = body(document.kind)) => {
  await mkdir(path.dirname(relocated(document)), { recursive: true });
  await writeFile(relocated(document), bytes);
 };
 return { directory, state, documents, backup, target, relocated, importBackup, readState, copyToTarget };
}

test('backup import uses verified target supporting PDFs and preserves source metadata', async t => {
 const f = await fixture(); t.after(() => rm(f.directory, { recursive: true, force: true }));
 for (const document of f.documents) await f.copyToTarget(document);
 await rm(f.documents[0].path);
 await writeFile(f.documents[1].path, '%PDF-1.4 changed old copy');
 const result = f.importBackup();
 assert.equal(result.status, 0, result.stderr);
 assert.equal(JSON.parse(result.stdout).imported, true);
 const imported = f.readState();
 assert.equal(imported.profile.name, f.state.profile.name);
 assert.equal(imported.profile.documents?.length, 2);
 for (const original of f.documents) {
  const document: CandidateDocument = imported.profile.documents!.find(d => d.id === original.id)!;
  assert.deepEqual(document, { ...original, path: f.relocated(original) });
  assert.equal((await verifiedDocumentBytes(document)).toString(), body(original.kind));
 }
 assert.equal(imported.settings.backend, 'sqlite');
 assert.equal(await readFile(f.backup, 'utf8'), JSON.stringify(f.state), 'Import does not rewrite the backup');
});

test('backup import retains a verified saved path when target supporting copies are absent', async t => {
 const f = await fixture(); t.after(() => rm(f.directory, { recursive: true, force: true }));
 const result = f.importBackup();
 assert.equal(result.status, 0, result.stderr);
 assert.deepEqual(f.readState().profile.documents, f.documents);
});

for (const failure of ['missing', 'changed saved copy', 'changed target copy', 'target symlink', 'non-PDF target'] as const) {
 test(`backup import rejects ${failure} without importing any profile records`, async t => {
  const f = await fixture(); t.after(() => rm(f.directory, { recursive: true, force: true }));
  // Verify one good document first, proving a later bad one cannot cause a partial import.
  await f.copyToTarget(f.documents[0]);
  const bad = f.documents[1];
  if (failure === 'missing') await rm(bad.path);
  if (failure === 'changed saved copy') await writeFile(bad.path, '%PDF-1.4 modified');
  if (failure === 'changed target copy') await f.copyToTarget(bad, '%PDF-1.4 modified');
  if (failure === 'non-PDF target') await f.copyToTarget(bad, 'This is not a PDF');
  if (failure === 'target symlink') await symlink(bad.path, f.relocated(bad));
  const result = f.importBackup();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Supporting document.*missing or changed/);
  const target = f.readState();
  assert.notEqual(target.profile.name, f.state.profile.name);
  assert.deepEqual(target.profile.documents, []);
  assert.deepEqual(target.jobs, []);
  assert.deepEqual(target.packets, []);
 });
}
