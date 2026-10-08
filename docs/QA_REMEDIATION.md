# Customer QA and release plan

This plan follows an end-to-end test with a fictional Northwestern mechanical engineer: B.S. 2024, two years of design experience, US work authorized, no sponsorship needed. The agent used an isolated local database and fake résumé. It filled two live employer forms to an enabled Submit control and did **not** submit either application. That proves supported controls can be completed in those two cases; it does not establish a general submission success rate.

## Release 1: stop avoidable bad matches and make the workflow honest

| Finding | Change | Acceptance check |
|---|---|---|
| A 2024 graduate got 2027 graduate hardware drafts | Hold explicit incompatible cohorts for early-career candidates; require a graduation date before preparing cohort-restricted roles | 2024 candidate cannot prepare a 2027-only graduate role; matching 2027 candidate can |
| A 1–3 year mechanical role was rejected | Read structured `Min Yr = 1Max Yr = 3+` as a one-year minimum | Early-career mechanical role qualifies; a candidate with zero saved years does not |
| “Early career” covered 0–2 years without an exact count | Collect exact professional years in Start here and Settings; hold minimum-experience roles until a count is saved | A zero-year candidate cannot prepare a one-year minimum role |
| New profiles inherited six technology and trading feeds | Start with no employer feeds; keep each existing user's saved boards | New installs show a clear add-board or agent-research path and never spend quota on creator-selected employers |
| Published pay appeared as “Pay not verified” when no floor was set | Show “Published pay range” when the parsed assessment has a range | A zero pay floor still distinguishes published pay from missing pay |
| Self submission copy said the user must fill forms | Describe form filling and final Submit separately | Agent-fill plus self-submit instructions tell the user to review and click Submit |
| Shared answers hid questions after item 12 | Add a visible show-all control | Every pending reusable question is reachable |
| Review tabs hid “Blocked” at narrow widths | Wrap tabs on small screens | Every queue tab remains visible without horizontal scrolling |
| Ready packets looked like finished employer forms | Explain local packet readiness beside the queue | The candidate sees that the live form still needs verification and filling |
| Agent index carried more entries and options than needed | Default to five items, sample only three options, preserve exact packet reads | `work` stays bounded and returns IDs/offsets for focused follow-up |

## Next releases

1. **Qualification evidence before automatic preparation.** Detect role-specific mandatory skills, licenses and education requirements, compare them with confirmed candidate facts, and put unsupported claims in research. Test mechanical-versus-FPGA and other adjacent specialties without blocking candidates who have documented cross-discipline experience. A broad career track must not become proof of a specialized skill.
2. **Employer-form progress.** Add a durable, separately labeled state for inspected, partially filled, ready for candidate review and confirmed submitted forms. Save field-level evidence and expiry without storing sensitive browser credentials. A local packet's `ready` status must never imply that a browser form is complete.
3. **Source discovery.** Help a new candidate discover relevant official employer boards from saved career interests and employers, with human review before adding a feed. Show source freshness and feed failures. Direct dashboard search should not silently suggest it searches the whole job market.
4. **Accessibility and mobile.** Expand the small-screen fix into keyboard, screen reader and 320–500 px layout coverage across the whole dashboard.
5. **Cross-ATS form matrix.** Run consent-safe dry runs with fictional profiles on current Greenhouse, Lever, Ashby, Workday and employer-hosted forms. Record required control coverage, upload behavior, login/CAPTCHA handoff, and whether Submit became enabled. Never infer completion from an ATS brand or public question API.

## Open-source release gates

- Keep personal documents, test identities and service keys in ignored private state. Never publish a real candidate database, résumé or browser session. New installs use local SQLite; public multiuser hosting requires authentication and per-user isolation first.
- Use the same CLI and canonical `.agents/skills/job-application-agent/SKILL.md` in Codex and Claude Code. Their browser/email tools are supplied by each user's installation. Smoke-test both generated provider instructions.
- Run `npm ci`, `npm test`, `npm run build`, `npm run doctor` in a clean checkout. Check the PR diff, CI and production dependency audit. Merge only after green checks, then verify `main` contains the commit. There is no public web deployment in this local-first project.
- Use fictional fixtures for public bug reports and PRs. Keep setup questions in Start here and missing personal answers in Needs answers. Browser form filling must follow the candidate's separate writing, filling and submission choices.

## Token budget for agents

Start with `npm run agent -- work` (five items by default). Read exact `job ID` or `packet ID` only for the next action. Use `--offset` to page and `--batch` for current approvals. The work index samples choice options; exact packets and the dashboard retain the full set. Avoid `state` outside diagnostics, repeated full job pages, unchanged status messages and duplicate browser snapshots. Prefer structured controls and short sourced excerpts. These limits reduce context size without deleting evidence or skipping required form fields.
