# CLI reference

Use `npm run agent -- help` for the executable contract and the [payload examples](../.agents/skills/job-application-agent/references/commands.md) for exact JSON shapes. Run in the repository root. The CLI opens the configured runtime, so even a query can initialize an empty data directory or capture a résumé. It is not a filesystem-forensic read-only interface.

| Command | Effect |
|---|---|
| `work [--limit N] [--offset N] [--batch BATCH_ID]` | Default compact agent read: setup gaps, bounded actionable work, shared missing questions, counts and remaining quota; optional approved-batch focus |
| `profile`, `job ID`, `packet ID`, `approved BATCH_ID` | Read exact profile, job or approved application contents only when needed |
| `state`, `jobs`, `prior-applications` | Diagnostic/full reads; outputs can contain private data |
| `prompt accounts`, `prompt prepare [--provider codex\|claude]`, `prompt submit BATCH_ID` | Generate short workflow instructions for the selected agent |
| `import-job --file FILE` | Fetch/import an ATS posting or sourced manual job |
| `job-put --file FILE`, `job-inspect ID --file FILE` | Save typed job evidence / fully inspected controls |
| `refresh ID` | Fetch current supported posting; preserve unchanged local evidence |
| `board-put --file FILE` | Configure a verified public ATS board |
| `profile-update --file FILE` | Save candidate-confirmed profile answers |
| `settings-update --file FILE` | Change preparation/compensation settings |
| `resume-update --file PDF` | Capture a new unchanged résumé; invalidate affected approvals |
| `ocr-image --file IMAGE` | Optional local Tesseract OCR for screenshot-only form labels; writes private text under `.data/ocr/` |
| `document-add --file FILE` | Register unchanged supporting PDF metadata; no employer upload |
| `prior-application --file FILE` | Record minimal sourced prior-application evidence |
| `discover` | Refresh enabled feeds and record run/backup |
| `prepare-next` | Refresh and prepare within remaining ordinary daily cap |
| `prepare JOB_ID [--file FILE]` | Create a review packet |
| `preparation-allowance --limit 50 --reason TEXT` | Record explicit one-day manual allowance; not submission permission |
| `prepare JOB_ID --allowance ID --file FILE` | Prepare using that day's allowance |
| `packet-edit ID --file FILE` | Edit answers/documents/notes; revoke old approval |
| `handoff PACKET_ID --evidence TEXT` | Record a blocked browser step requiring user action |
| `begin PACKET_ID` | Validate approved packet and persist attempt/lock before final browser action |
| `finish ATTEMPT_ID --outcome submitted\|failed\|unknown\|handoff --evidence TEXT` | Save actual outcome; optional `--url URL` |
| `recover ATTEMPT_ID --evidence TEXT` | Convert interrupted attempt to unknown; not a retry |
| `reconcile ATTEMPT_ID --outcome submitted\|failed --evidence TEXT` | Resolve unknown from actual employer evidence |
| `export [FILE]` | Write private backup JSON; PDFs remain separate |
| `import-backup FILE` | Restore into empty destination after document verification |

## Normal agent loop

Start with `npm run agent -- work` for a five-item queue; use `--offset N` to page or `--limit N` to change the batch size. Read `packet ID` only for the application being worked on. Save newly inspected form controls with `job-inspect`, and sourced answers or unresolved personal questions with `packet-edit`. The dashboard groups exact missing questions under **Review queue → Needs answers**; the agent should continue other jobs while answers are pending.

`prepare-next` refreshes public feeds and creates initial drafts within the remaining daily cap; it does not inspect or fill every live form. Supplement it with employer research. For submission, read `work --batch BATCH_ID` and `approved BATCH_ID`, then recheck each actual form and call `begin` immediately before final Submit. Approval happens only on the dashboard. These CLI commands save records; browser tools perform actual employer interactions.

Prefer structured private files over interpolating untrusted page text into shell commands. Do not include credentials, candidate-account tokens, government IDs or unrelated mail.

## Compensation example

Create `.data/work/criteria.json` with your explicitly chosen values:

```json
{"minimumAnnualCompensation":100000,"compensationBasis":"total"}
```

Then `npm run agent -- settings-update --file .data/work/criteria.json`. This mutates saved settings; it is not a dry run.

## Supported posting example

```json
{"url":"https://job-boards.greenhouse.io/VERIFIED_BOARD/jobs/VERIFIED_POSTING_ID"}
```

Use actual verified identifiers with `import-job`. ATS board tokens are public identifiers, not employer submission credentials. Imported feed data does not prove the hosted form was fully inspected.

## Document attachment

Register the original supporting PDF, then choose its returned document ID and SHA-256 for a specific inspected question in `packet-edit`. Selection is part of the review packet. Never rename a recommendation into a cover letter by assumption or use a transcript for a different degree level.

## HTTP surface

`server/index.ts` defines the loopback API. `/api/work` returns a bounded work index; `/api/onboarding` saves profile and preferences atomically. `/api/state` returns a snapshot, `/api/health` checks service availability, `/api/resume` and `/api/documents/:id` deliver hash-verified originals. `/api/export` also writes a local backup. `/api/helper-export` downloads a full portable bundle with confirmed answers and job references; unlike the basic extension export, it includes sensitive declarations and must remain private. It contains no approval authority or backend credentials.

`npm run setup` creates private first-run configuration without overwriting existing settings. `npm run doctor` checks local prerequisites without opening application state. `/api/agent-prompt?mode=prepare&provider=claude` generates Claude instructions; `/api/codex-prompt` remains a compatibility alias. The Assistant selector changes generated prompt syntax, not the storage backend.
