# Use Codex or Claude Code

Career Agent is an MIT-licensed local application. It supplies a dashboard, CLI and shared workflow. Your agent supplies reasoning and whatever browser/email tools you configure. The app makes no OpenAI or Anthropic model API calls and requires no shared developer account. Agent access, external tools and optional cloud storage can have their own costs.

## First run

```sh
git clone https://github.com/AdiRosenstock/career-agent-public.git
cd career-agent-public
# With nvm: nvm install && nvm use
npm ci
npm run setup
npm run doctor
npm run build
npm start
```

Setup asks for your unchanged résumé PDF and local SQLite or your own Supabase project. It writes private `.env.local` only when absent, never replaces an existing backend, never uploads a document, and never initializes application state. Doctor checks local prerequisites without opening the database or printing credentials. A fresh database is created when you start the app.

Open `http://127.0.0.1:4317`. Enter your own contact information, graduation month, confirmed experience, exact reusable answers and separate authorization declarations. Set the annual compensation floor and base/total basis in Settings. Unknown facts remain unknown.

**Matching scope:** US full-time early-career roles, with automated cohort/date checks currently specialized for June 2027 undergraduate graduation. Enter your true graduation date; another cohort needs manual eligibility review and code changes; the engine blocks automatic preparation outside that supported graduation date. The daily ledger uses Chicago time. Agent compatibility does not make those domain rules universal.

## Choose your agent

| | Codex | Claude Code |
|---|---|---|
| Open the project | Open this cloned folder in the app, or run your installed `codex` CLI here | Run your installed `claude` CLI here |
| Project rules | `AGENTS.md` | `CLAUDE.md` imports `AGENTS.md` |
| Workflow skill | `.agents/skills/job-application-agent` | `.claude/skills/job-application-agent` loads the canonical `.agents` skill |
| Invoke | `$job-application-agent` | `/job-application-agent` |
| State / changes | Same `npm run agent -- …` CLI | Same CLI |
| Browser/email | Your available Codex tools or configured MCP servers | Your available Claude tools or configured MCP servers |

The dashboard's **Assistant** selector generates instructions for either agent. It does not launch an agent, share credentials, connect accounts or run a worker. `npm run agent -- prompt prepare --provider claude` generates the same workflow for Claude; omit the flag for Codex. Existing Codex endpoint clients remain compatible.

## Start with this request

```text
Use the job-application-agent skill in this repository. Check my saved
profile and prior application history. Help research suitable US full-time
new-grad roles using my confirmed criteria. Preserve original document
bytes. Prepare factual answers, flag missing facts, and leave forms ready
for my review. Do not submit or start a scheduler.
```

First ask your agent to confirm which browser and email tools are actually available. A terminal session alone cannot fill an employer page. If tools are missing, it can research public pages and prepare saved answers while you open and fill the form manually. A ready packet is not evidence that a live form is complete.

## Bring your own services

Read [Connections](CONNECTIONS.md). SQLite needs no external server. Supabase uses your own project and server-only credential. Browser, email and other MCP servers belong to your agent installation and your accounts. This repository ships no shared tokens, developer account, email integration or hidden telemetry service.

Email checks are read-only searches of accounts you authorize. Record which accounts were checked and the evidence source; disconnected accounts remain an explicit duplicate-check gap. Job alerts are not submissions. Follow the shared skill for employer form inspection, unchanged uploads, approval integrity and unknown outcomes.

Scheduling is optional and host-specific. No scheduler is installed or started by setup. Candidate final submission is the default. An explicitly requested agent submission also needs the exact current dashboard-approved batch.

## Official references

[Codex skills](https://learn.chatgpt.com/docs/build-skills), [Codex project instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude Code skills](https://code.claude.com/docs/en/skills), [Claude project instructions and imports](https://code.claude.com/docs/en/memory). Product versions and available tools can differ; confirm discovery in your current session. Instructions guide agents; the engine enforces packet integrity, but it does not police arbitrary external browser tools.
