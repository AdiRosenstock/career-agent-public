import { access, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const check = (ok, message) => { console.log(`${ok ? 'OK' : 'CHECK'}  ${message}`); if (!ok) failures++; };
try { process.loadEnvFile(path.join(root, '.env.local')); } catch (e) { if (e.code !== 'ENOENT') { check(false, 'Could not parse .env.local. Fix the local file; credentials are not printed.'); } }
const [major, minor] = process.versions.node.split('.').map(Number);
check(major > 22 || (major === 22 && minor >= 16), `Node ${process.versions.node}; Node 22.16+ required (22 recommended).`);
const backend = process.env.CAREER_BACKEND || 'sqlite';
check(['sqlite', 'supabase'].includes(backend), `Storage selection: ${['sqlite','supabase'].includes(backend) ? backend : 'invalid; choose sqlite or supabase'}.`);
if (backend === 'sqlite') {
  try { const Database = createRequire(import.meta.url)('better-sqlite3'); const db = new Database(':memory:'); db.close(); check(true, 'SQLite native module loads in this Node runtime.'); } catch { check(false, 'SQLite native module unavailable. Select Node 22 and rerun npm ci in this terminal.'); }
} else if (backend === 'supabase') {
  check(!!process.env.SUPABASE_URL && !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY), 'Supabase URL and server credential configured; remote connectivity is not tested.');
}
try { await access(path.join(root, '.env.local')); check(true, 'Private .env.local exists.'); } catch { check(false, 'No .env.local. Run npm run setup or provide configuration through your environment.'); }
const dataDir = path.resolve(process.env.CAREER_DATA_DIR || path.join(root,'.data'));
const resume = process.env.CAREER_RESUME_PATH || path.join(dataDir,'artifacts','resume.pdf');
try { const f = await open(resume, 'r'); try { const b=Buffer.alloc(4); const {bytesRead}=await f.read(b,0,4,0); check(bytesRead===4 && b.toString()==='%PDF', 'Résumé source is readable PDF bytes. Stored document hashes are checked by the app.'); } finally {await f.close();} } catch {check(false,'Résumé source missing/unreadable. Set CAREER_RESUME_PATH to your own original PDF. Existing database metadata remains authoritative.');}
for (const file of ['AGENTS.md','CLAUDE.md','.agents/skills/job-application-agent/SKILL.md','.claude/skills/job-application-agent/SKILL.md']) { try { await access(path.join(root,file)); check(true, `${file} available.`); } catch {check(false, `${file} missing.`);} }
try {await access(path.join(root,'dist/index.html'));check(true,'Dashboard build exists.');} catch {check(false,'No dashboard build. Run npm run build.');}
console.log('No application database opened, files changed, accounts connected, or automation started. Browser/email availability must be checked inside your chosen agent.');
process.exitCode = failures ? 1 : 0;
