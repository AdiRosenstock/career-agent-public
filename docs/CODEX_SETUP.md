# Use Career Agent with Codex

Career Agent supplies the dashboard, local state, CLI, and workflow instructions. Codex supplies the agent session and whatever browser/account tools your installation supports. No OpenAI API key is required by this app; Codex access and usage depend on your account.

## 1. Install the local application

Follow the [README quick start](../README.md#quick-start). Use your own PDF in `.env.local`, start the loopback server, and keep it running while using the dashboard. `npm run demo` is an isolated fictional preview, not candidate onboarding.

## 2. Open the cloned repository in Codex

Choose this local folder as the project/workspace and start a Codex chat there. The root `AGENTS.md` contains project boundaries. The job workflow lives in `.agents/skills/job-application-agent/SKILL.md`.

Codex discovers repo skills under `.agents/skills` from the working directory up to the repository root. If the skill is unavailable, restart the session or explicitly ask Codex to read that file. Global or nested instruction overrides can change effective guidance. See the official [skills documentation](https://learn.chatgpt.com/docs/build-skills) and [AGENTS.md documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

## 3. Onboard your facts

Open **Your profile**. Set your contact details and links, then confirm immigration status, authorization now, expected authorization at start, future sponsorship, and earliest start separately. Unknown answers stay unknown. A profile checkbox is not evidence of a government authorization being granted.

Ask Codex to help record verified résumé facts with source IDs. Do not infer demographic, disability, veteran, legal or conflict-of-interest declarations. Store private JSON under `.data/work/`; use `profile-update --file FILE` or the dashboard to save explicit confirmations. A `profile-seed.json` is optional onboarding input only; existing database state takes precedence.

```text
Use $job-application-agent. Read my original résumé and the private profile.
Help me confirm my factual experience and reusable answers. Preserve all PDF
bytes and list genuinely missing facts. Do not discover, fill, or submit
applications yet. Do not create an automation.
```

Set the annual compensation minimum and **base** or **total** basis in Settings. The fresh seed does not impose a salary floor. Default career matching specializes in US full-time 2027 graduates; changing profile graduation alone does not generalize the matching rules.

## 4. Check duplicates and account coverage

Connect an authorized email tool if available, or open signed-in history in your supported browser. Sign in personally when needed. The dashboard stores no email credentials and does not maintain a Gmail, Outlook, LinkedIn or Handshake integration itself.

```text
Use $job-application-agent to check my authorized application mailbox and
accessible candidate-account history for prior submissions. Inspect actual
receipts, exact roles, cohorts and requisitions. Record minimal sourced
evidence. Separate alerts, abandoned drafts and uncertain identities.
Report accounts or time ranges you cannot inspect. Do not send messages,
submit applications or change account settings.
```

## 5. Research and prepare

```text
Use $job-application-agent. Prepare up to 10 US full-time 2027 graduate roles,
prioritizing product, data engineering, then software. Follow my saved
compensation settings. Check duplicates before preparation. Verify pay,
start dates and sponsorship evidence. Inspect the complete employer form,
save sourced answers, and leave personal declarations unresolved. Preserve
original documents. Do not submit or schedule anything.
```

Public feeds provide postings, not complete hosted forms. A question API can assist inspection; the actual hosted form still needs checking. Company sponsorship history is not a promise for a specific role. An explicit refusal takes precedence.

## 6. Fill and leave for review

```text
Use $job-application-agent to fill the selected saved packets in actual live
employer forms. Recheck postings and duplicates, use only confirmed answers,
and attach the selected unchanged PDFs under their original filenames.
Validate every page, required field, selection and upload. Leave final Submit
untouched. Preserve tabs and record URLs, stages, remaining steps and evidence.
Do not describe a filled form as submitted.
```

Prefer Greenhouse and Lever; other platforms can need manual handoff. Browser capabilities vary. Never bypass login, OTP or CAPTCHA controls, and never complete candidate assessments. Fresh links or closed sessions may lose unsaved values. Employer-saved drafts can persist, but the tracker does not preserve browser DOM state.

## 7. Approval is a separate workflow

The recommended workflow is candidate final submission. If you explicitly choose agent submission, select complete packets in **Review queue**, approve their exact versions, and send the generated batch instruction to Codex. Packet edits revoke approval. The engine validates current approval, job freshness, form version, document hashes and history before recording a submission attempt. Browser tools still enforce their action-time rules.

Never use historical approvals as authorization for a new run. Record success only from a confirmation page or authoritative employer evidence. A lost session after Submit is unknown, not a failed attempt safe to retry.

## Scheduling is optional

The dashboard does not run a background AI worker. Its schedule fields are metadata for an external Codex automation. Only create one after an explicit request. Scheduled discovery/preparation never authorizes submission; it stops at reviewable materials. Local scheduling depends on the execution host and app availability.

## What persists

| Item | Persistence |
|---|---|
| Candidate facts, exact answers, jobs, packets, approvals, attempts | Active database |
| Résumé and supporting PDFs | Local artifacts; back them up separately |
| Supabase cover-letter bodies | Local artifacts referenced by integrity hashes |
| Browser form values / uploads | Employer/browser dependent; not serialized by this app |
| Chrome/Edge helper basic profile | Extension-local storage until removed |
| Email connector or signed-in sessions | Managed by your tools, not Career Agent |

Private handoffs and exports should stay in `.data/` and must never be included in a public fork.
