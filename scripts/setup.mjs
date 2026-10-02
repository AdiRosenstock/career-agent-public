import { access, mkdir, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1]; };
function quoted(value) {
  if (/[\r\n"\0]/.test(value)) throw new Error('Configuration values cannot contain line breaks, quotes or null characters.');
  return `"${value.replaceAll('\\', '/')}"`;
}
export async function configureWorkspace({ directory = root, resume, backend = 'sqlite', port = 4317, dataDir, supabaseUrl }) {
  if (!['sqlite', 'supabase'].includes(backend)) throw new Error('Choose sqlite or supabase.');
  if (!Number.isInteger(Number(port)) || Number(port) < 1024 || Number(port) > 65535) throw new Error('Port must be 1024–65535.');
  if (!resume) throw new Error('An unchanged résumé PDF is required.');
  const resumePath = path.resolve(directory, resume);
  const file = await open(resumePath, 'r');
  try { const bytes = Buffer.alloc(4); const { bytesRead } = await file.read(bytes, 0, 4, 0); if (bytesRead !== 4 || bytes.toString() !== '%PDF') throw new Error('The selected document must be a readable PDF.'); } finally { await file.close(); }
  const lines = ['# Private local configuration. Never commit this file.', `CAREER_BACKEND=${backend}`, `PORT=${port}`, `CAREER_RESUME_PATH=${quoted(resumePath)}`];
  if (dataDir) lines.push(`CAREER_DATA_DIR=${quoted(path.resolve(directory, dataDir))}`);
  if (backend === 'supabase') {
    const u = new URL(supabaseUrl || '');
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error('Provide your own HTTPS Supabase project URL without credentials.');
    lines.push(`SUPABASE_URL=${quoted(u.href)}`, '# Set SUPABASE_SECRET_KEY in your environment or add it here privately.');
  }
  await mkdir(directory, { recursive: true });
  // Exclusive creation prevents changing an existing backend or overwriting credentials.
  const config = await open(path.join(directory, '.env.local'), 'wx', 0o600);
  try { await config.writeFile(`${lines.join('\n')}\n`); } finally { await config.close(); }
}
async function main() {
  if (args.includes('--help')) { console.log('npm run setup [-- --resume PDF --backend sqlite|supabase --port 4317 --data-dir DIR --supabase-url URL]\nNo flags: interactive setup. Existing .env.local is never overwritten. No database is created or migrated.'); return; }
  try { await access(path.join(root, '.env.local'), constants.F_OK); console.log('Existing .env.local preserved. Run npm run doctor to check it. To migrate, use docs/CONFIGURATION.md.'); return; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let resume = flag('resume'), backend = flag('backend') || 'sqlite', port = flag('port') || '4317', supabaseUrl = flag('supabase-url');
  if (!resume) {
    if (!process.stdin.isTTY) throw new Error('Pass --resume /absolute/path/to/resume.pdf for non-interactive setup.');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try { console.log('Career Agent setup. Your profile and job preferences will be collected in the dashboard.'); resume = (await rl.question('Path to your unchanged résumé PDF: ')).trim(); if (backend === 'supabase' && !supabaseUrl) supabaseUrl = (await rl.question('Your Supabase project URL (not a key): ')).trim(); } finally { rl.close(); }
  }
  await configureWorkspace({ resume, backend, port, dataDir: flag('data-dir'), supabaseUrl });
  console.log(`Private configuration created. No application state changed.\n${backend === 'supabase' ? 'Apply supabase/schema.sql to your own project and privately set SUPABASE_SECRET_KEY first.\n' : 'Using private storage on your computer.\n'}Next: npm run doctor\nThen: npm run build && npm start\nOpen http://127.0.0.1:${port}\nComplete Start here, then copy your job-search instruction. See docs/AGENT_SETUP.md.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.code === 'EEXIST' ? 'Existing .env.local preserved. Setup will not overwrite it.' : e.message); process.exitCode = 1; });
