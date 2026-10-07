# Configuration, storage and backup

## Environment

The server loads `.env.local` from the repository root. Explicit process environment values take precedence. Do not put credentials in `VITE_` variables, client code, job descriptions or command payloads.

| Variable | Default / purpose |
|---|---|
| `CAREER_BACKEND` | `sqlite`; only `sqlite` or `supabase` accepted |
| `CAREER_DATA_DIR` | Repository `.data`; use a dedicated private absolute directory to override |
| `CAREER_RESUME_PATH` | Optional original PDF path for setup; otherwise add it in Start here. An existing store owns its résumé metadata. |
| `PORT` | 4317, bound to 127.0.0.1 |
| `SUPABASE_URL` | Server-only project URL when Supabase selected |
| `SUPABASE_SECRET_KEY` | Server-only service credential; legacy `SUPABASE_SERVICE_ROLE_KEY` supported |

A new database has a blank profile, default employer boards, a 20/day limit and Chicago day boundary. The initial seed does not impose a compensation minimum; entering 0 also disables the floor. Settings can select a minimum and base/total basis. Matching uses the saved career stage, experience and graduation month for US full-time roles.

## File layout

```text
.data/                         # ignored, private
├── career-agent.sqlite        # active local state
├── career-agent.sqlite-wal    # may hold recent committed changes
├── artifacts/
│   ├── resume.pdf             # fresh installation's initial captured résumé
│   ├── resumes/               # later immutable résumé versions
│   ├── supporting/            # registered supporting PDFs
│   └── cover-letters/         # local Supabase letter references, when used
├── backups/                   # JSON exports; no PDF bytes
├── work/                      # private agent payloads and evidence
└── demo/                      # explicitly separate fictional preview
```

Actual paths come from the profile records; existing installations can retain legacy paths. Never copy only a live SQLite main file and assume it includes WAL contents.

## Backup before deleting files

1. Export state while the active backend is healthy:

   ```sh
   npm run agent -- export /absolute/private/backup.json
   ```

2. Copy the complete local `artifacts` directory to private backup storage. Also preserve original source PDFs and any private handoffs/research files you need. The JSON export does **not** include document bytes.
3. Preserve configuration separately and securely. Credentials are not part of the state export and do not belong in Git.
4. Verify restoration into a fresh, empty destination before deleting the source. Confirm document hashes and history counts.

For a stopped SQLite server, a complete private data-directory backup can preserve the database and artifacts together. Do not delete files merely because code was pushed to GitHub.

## Restore or move a workspace

Set `CAREER_DATA_DIR` to an empty private directory. Keep `CAREER_RESUME_PATH` pointing to a hash-matching captured/original résumé and copy the saved artifacts into the target. Then:

```sh
npm run agent -- import-backup /absolute/private/backup.json
```

Import requires an empty destination and valid local documents. It can remap matching document paths and revokes imported pending approvals. Do not restore directly over a populated database. Missing/changed documents fail import rather than creating misleading records.

## Optional Supabase

Use your own dedicated project. Export the active store and preserve artifacts first. Stop workers before changing backend selection. Apply `supabase/schema.sql` in the project SQL editor, set backend/URL/server credential in `.env.local`, copy artifacts where accessible, and import into the empty destination. Restart and verify state and document integrity.

The singleton state table enables RLS, revokes anonymous/authenticated access and uses the local Node server's service role. A trigger enforces revision increments. Cover-letter bodies remain local with integrity references; PDFs remain local as well. A cloud-state backup alone cannot restore all materials.

To return to SQLite, export first, select a **new empty** `CAREER_DATA_DIR`, copy artifacts, import and verify. Never silently switch backend during an outage. No pricing or perpetual free-tier availability is guaranteed by this project.

`supabase/chrome-helper.sql` is an optional additive owner-scoped helper table scaffold. The current Chrome/Edge extension has no Supabase client and does not sync to that table. Applying it is not required to use either SQLite or the shipped extension.
