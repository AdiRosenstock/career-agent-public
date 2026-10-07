# Troubleshooting

| Symptom | What to check |
|---|---|
| Port 4317 is unreachable | Run `npm start` in the clone; inspect startup errors; check `PORT` |
| Native SQLite dependency fails to install | Use supported Node 22 and `npm ci`; ensure a native build toolchain if no prebuilt binary is available |
| No résumé in a new workspace | Add the original PDF in Start here, or set `CAREER_RESUME_PATH` before first launch |
| PDF is empty/truncated | Download/hydrate cloud-placeholder files locally; do not regenerate the document |
| Résumé checksum fails | Restore the unchanged selected file or explicitly use `resume-update` for a new original |
| Blank profile | Expected for a fresh install; confirm your own facts rather than copying demo data |
| Most jobs remain in research | Inspect pay, sponsorship, role/cohort eligibility, prior identity and form requirements |
| No roles on Apply yourself | Try Needs research or a different role-family filter; import/refresh in Opportunities |
| A packet is ready but the form is blank | Packet state and browser state are separate; refill/revalidate the actual employer form |
| Workday is blank or asks for login | Sign in personally or reopen manually; record an incomplete handoff, not a completed form |
| CAPTCHA, OTP, consent or an assessment blocks work | Follow your browser's required handoff/confirmation rules; never bypass or solve candidate assessments |
| A filled form disappeared | Find an employer-saved draft if available; fresh tabs/restarts may lose unsaved fields and uploads |
| Prior application is ambiguous | Inspect exact requisition, cohort, office and account evidence; append a sourced superseding record |
| Timeout after Submit | Mark unknown and reconcile from employer status/receipt before any retry |
| Supabase unavailable | Restore access to the selected project; do not silently switch to SQLite |
| Import refuses destination | Use an empty destination and matching local PDFs; do not overwrite application history |
| Daily cap reached | Wait for the Chicago day boundary or record an explicitly requested one-day allowance |
| Skill is unavailable in Codex | Open the repository as the working folder; read `.agents/skills/job-application-agent/SKILL.md`; check instruction overrides |
| “Daily” appears but no runs happen | Stored schedule metadata is not an active scheduler; inspect your externally configured automation |

The browser helper only handles recognizable blank text fields in the main document. It skips uploads, custom selects, iframes, shadow DOM, consent, signatures, authorization, demographics and employment repeaters. Some sites reject programmatic changes; visually verify every filled value.

For a bug report, use fictional examples and remove private state, email, document paths, screenshots, candidate links and credentials. Include Node version, OS, steps, expected behavior and relevant sanitized errors.

If SQLite reports `NODE_MODULE_VERSION` or `ERR_DLOPEN_FAILED`, installation and execution used different Node versions. Select the repository’s Node 22 runtime (`nvm install && nvm use`, if using nvm), then run `npm ci` again and keep that runtime selected for tests and the server. Check `node -v` in the same terminal before installing and starting.
