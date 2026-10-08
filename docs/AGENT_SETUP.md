# Use Codex or Claude Code

Career Agent supplies a local dashboard, CLI and shared workflow named **Adi “The Goat” Rosenstock**. Your own Codex or Claude Code session supplies reasoning and browser/email tools. The app makes no model API calls and needs no developer account or shared credentials. Agent subscriptions, external tools and optional cloud storage can have their own costs. Adi is a playful agent persona; each candidate's own verified profile controls the application answers.

## Install once

Beginners can copy the short installation message from the [README](../README.md#start-here-no-coding-experience-needed). The assistant should perform setup, open the dashboard, invite the user to [star the GitHub project](https://github.com/AdiRosenstock/career-agent-public) if they find it useful, and leave profile questions there. A star is optional; never click Star on the user's behalf or make it a requirement. The user should not need to design an agent plan.

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

Setup accepts an optional original résumé PDF path and uses local SQLite by default. If you skip the path, add the original PDF in **Start here** after launch. It creates private `.env.local` only when absent, preserves existing configuration/backend choices and never rewrites the PDF. Doctor checks prerequisites without opening application state or printing credentials. Starting the app creates a fresh database when needed.

Open [the dashboard](http://127.0.0.1:4317) and complete **Start here**. Save contact details, career stage, job interests, preferred employers, skills and experience highlights, locations/workplace preferences, compensation policy and separate work authorization answers. Add your original résumé PDF before preparing applications. A private companion skill and `profile.json` are generated in `.data/skills/candidate-profile/` from these saved answers. Update the dashboard to change them. Use actual experience and graduation/start dates. Matching covers US full-time roles at the chosen new graduate, early-career or experienced level; it does not assume the creator's cohort or career interests. Unknown facts stay unknown.

## Give the agent one instruction

Fresh installs have no employer boards selected. Add public Greenhouse, Lever or Ashby boards in **Settings** before using **Search employer feeds now**. Existing saved boards are preserved. For broader employer research and live forms, choose your assistant in the dashboard and copy its generated preparation instruction into the same chat. A simple request also works:

```text
Use the job-application-agent skill and continue from my saved dashboard.
Search and complete application preparation. Put missing personal answers
in Needs answers, continue other jobs, and follow my saved submission choice.
```

The agent starts with `npm run agent -- work`, a compact five-item queue of setup gaps, actionable packets/jobs, missing questions and daily capacity. Use `work --offset N` for the next group or `work --limit N` to tune a batch. Question options are sampled in the index; read an exact packet or use the dashboard for the full choice set. Read exact packets only when working on them; the full `state` output is for diagnostics. Reuse saved answers rather than repeatedly interviewing the candidate. New personal questions appear together in **Review queue → Needs answers**.

The agent refreshes configured Greenhouse, Lever and Ashby feeds and searches saved employers' official career pages before broad web search. It checks prior-application evidence, inspects actual forms and prepares sourced answers under the saved writing choice. Browser access lets it fill real forms if the candidate selected agent form filling. Supporting document choices remain explicit. A ready packet alone does not prove a live form is filled. For screenshot-only forms, optional `npm run agent -- ocr-image --file SCREENSHOT.png` uses local Tesseract when installed; structured browser controls remain preferred.

## Review and complete a batch

Upload your résumé, optional base cover letter PDF, and optional transcript PDF at the top of **Start here**, then choose who writes answers, fills forms and submits. The base letter is a drafting reference and cannot be attached as a generic supporting document; the transcript is selected for an exact application question. The three visible submission choices are **I click Submit**, **Adi submits batches I approve**, and **Adi finds, fills, and submits for me**. In review mode, inspect exact packets, approve a batch on the dashboard, then copy the generated submission instruction into your agent's chat. In automatic mode, choose agent form filling and agent-prepared answers, accept the dashboard risk warning, and use **Ask Adi to find, fill, and submit**; the agent may submit only complete current packets after fresh live checks. In self mode, the candidate clicks Submit; the agent may still fill the live form when agent form filling is selected. Scheduled discovery and preparation never submit. Changed packet contents or form requirements must be resolved before any submission, and review mode needs fresh approval.

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
