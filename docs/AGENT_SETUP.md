# Use Codex or Claude Code

Career Agent supplies a local dashboard, CLI and shared workflow. Your own Codex or Claude Code session supplies reasoning and browser/email tools. The app makes no model API calls and needs no developer account or shared credentials. Agent subscriptions, external tools and optional cloud storage can have their own costs.

## Install once

Beginners can copy the short installation message from the [README](../README.md#start-here-no-coding-experience-needed). The assistant should perform setup, open the dashboard and leave profile questions there; it should not ask the user to design an agent plan.

For manual installation, use Node 22.16 or newer within Node 22:

```sh
git clone https://github.com/AdiRosenstock/career-agent-public.git
cd career-agent-public
npm ci
npm run setup
npm run doctor
npm run build
npm start
```

Setup asks for the original résumé PDF path and uses local SQLite by default. It creates private `.env.local` only when absent, preserves existing configuration/backend choices and never rewrites the PDF. Doctor checks prerequisites without opening application state or printing credentials. Starting the app creates a fresh database when needed.

Open [the dashboard](http://127.0.0.1:4317) and complete **Start here**. Save contact details, career stage, job interests, locations/workplace preferences, compensation policy and separate work authorization answers. Use actual experience and graduation/start dates. Matching covers US full-time roles at the chosen new graduate, early-career or experienced level; it does not assume the creator's cohort or career interests. Unknown facts stay unknown.

## Give the agent one instruction

Choose your assistant in the dashboard and copy its generated preparation instruction into the same chat. A simple request also works:

```text
Use the job-application-agent skill and continue from my saved dashboard.
Search and complete application preparation. Put missing personal answers
in Needs answers, continue other jobs, and leave final Submit for review.
```

The agent starts with `npm run agent -- work`, a compact queue of setup gaps, actionable packets/jobs, missing questions and daily capacity. `work --limit 5` narrows it further. It reads exact packets only when working on them; the full `state` output is for diagnostics. It should use saved answers rather than repeatedly interview the candidate. New personal questions appear together in **Review queue → Needs answers**.

The agent searches employer pages, refreshes configured feeds, checks available prior-application evidence, inspects actual forms and prepares sourced answers. The user does not need to select companies or configure feeds first. Browser access lets it fill real forms and upload the unchanged résumé. Supporting document choices remain explicit and part of review. A saved ready packet does not prove a live form is filled.

## Review and complete a batch

Review each packet's exact answers, documents and employer form. Approve the applications you want on the dashboard, then copy the generated submission instruction into your agent's chat. The agent reads the exact approved batch, rechecks live forms and submits supported browser forms with recorded attempts and confirmation evidence. It does not ask for the same permission again; changed packet contents or form requirements need fresh review.

Greenhouse, Lever, Ashby, Workday and other employer forms can be completed when the agent's browser handles the actual controls. A login needing your action, CAPTCHA, assessment, unreviewed consent or unsupported control blocks that job. The agent records the specific handoff and continues other jobs. It never treats a platform name alone as a reason to stop or claims success without confirmation. You may instead perform final submission yourself.

Ordinary preparation is capped at 20 new applications per Chicago day across runs. Schedules are separate and opt-in; scheduled discovery/preparation never authorizes submission.

## Shared agent compatibility

| | Codex | Claude Code |
|---|---|---|
| Open project | Open this cloned folder in the app or installed CLI | Open the installed Claude Code session in this folder |
| Project rules | `AGENTS.md` | `CLAUDE.md` imports `AGENTS.md` |
| Skill | `.agents/skills/job-application-agent` | `.claude/skills/job-application-agent` loads the canonical skill |
| Invoke | `$job-application-agent` | `/job-application-agent` |
| CLI | `npm run agent -- …` | Same CLI |
| Browser/email | Your available tools or configured MCP servers | Your available tools or configured MCP servers |

The dashboard's assistant selector generates instructions; it does not launch an agent, connect accounts or start a worker. `npm run agent -- prompt prepare --provider claude` prints the Claude preparation instruction; omit the provider flag for Codex.

## Connections and returning later

Read [Connections](CONNECTIONS.md) only when a tool needs connecting or you want your own Supabase backend. SQLite needs no external server. Browser/email MCP servers belong to your agent installation and accounts; this repository ships none. The agent should inspect available capabilities itself and explain only genuine missing steps in plain language. Without browser access it can prepare saved materials and give a manual handoff. Do not put passwords or keys in chat, source files or React.

Email checks are read-only searches of accounts you authorize. Checked accounts and actual confirmation evidence must be recorded; disconnected accounts remain a duplicate-check gap. Job alerts are not submissions.

To reopen the app, return to the same chat and say **“Open my existing Career Agent and continue from my saved dashboard.”** The assistant preserves state and runs `npm start`; setup is not repeated. The process must remain running for [the dashboard](http://127.0.0.1:4317) to open.

## Official references

[Codex skills](https://learn.chatgpt.com/docs/build-skills), [Codex project instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude Code skills](https://code.claude.com/docs/en/skills), [Claude project instructions and imports](https://code.claude.com/docs/en/memory). Product versions and available tools can differ; confirm discovery in the current session. The engine validates packet integrity and attempt transitions, while actual employer browser actions use the agent's tools.
