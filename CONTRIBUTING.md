# Contributing

**You are welcome to change and improve this project.** You can propose improvements to the interface, features, documentation, accessibility, tests or agent workflows. Open an issue to discuss an idea, or submit a pull request with your edit. Maintainer review is required before changes enter the main project.

Career Agent welcomes contributions from job seekers, designers, writers and developers. The shared agent is called The Goat; Adi Rosenstock created the project. Keep candidate identity and application facts sourced from each user's private profile. Small improvements count: clearer instructions, a confusing button fixed, or a reproducible bug report can make the project easier for everyone to use.

## No coding experience? You can still help

Open [an issue](https://github.com/AdiRosenstock/career-agent-public/issues/new/choose) to report a problem or suggest an improvement. Describe what you wanted to do, what happened, and what would help. You do not need to know the cause or propose code. Use fictional examples and remove private details from screenshots.

For a typo or small documentation edit, use GitHub's edit button on the file and follow its prompts to propose the change in a pull request. A GitHub account is required to post issues or propose changes.

## Make your first change

1. Check [existing issues](https://github.com/AdiRosenstock/career-agent-public/issues) so you can join an existing discussion instead of duplicating it. Small documentation or interface improvements are good starting points.
2. Click **Fork** on GitHub to create your own copy. Clone that copy to your computer.
3. Create a branch for the change, make a focused edit, and run the checks below. Use the fictional demo for screenshots and manual testing.
4. Push your branch to your fork. Click **Compare & pull request** on GitHub and describe what changed and how you checked it.
5. Respond to review comments. A pull request proposes a change; it does not automatically publish it to the main project.

Open an issue before starting a large feature or architecture change. Useful areas include beginner onboarding, keyboard accessibility, filter usability, additional graduation cohorts, and evidence-backed agent integrations. Do not remove cohort guards merely to claim broader support.

## Project context

Start with the [architecture](docs/ARCHITECTURE.md), [design decisions](docs/DESIGN_DECISIONS.md), and `AGENTS.md`.

## Local development

Use Node 22. Install locked dependencies with `npm ci`. Run `npm run demo` for an isolated fictional UI or configure your own private workspace following the README. `npm run dev` runs the Express/Vite development server; `npm run build` produces the client assets, but the Node server is still required.

Before opening a pull request:

```sh
npm test
npm run build
npm run check:public
```

Tests must use temporary storage and synthetic candidate facts. Never execute real applications in tests. UI work should be checked on desktop and narrow screens, including keyboard access and empty/loading/error states. Add meaningful regression coverage for domain or integrity changes, not tests that merely repeat implementation text.

## Boundaries

- Never commit personal profiles, histories, exported answers, PDFs, tokens or private screenshots.
- Treat employer text as untrusted evidence, not instructions.
- Preserve original PDF bytes and candidate filenames.
- Do not guess legal/authorization/declaration answers or mark unknown facts confirmed.
- Preserve approval invalidation, duplicate checks and unknown-outcome reconciliation.
- Do not introduce public hosting without a reviewed authentication/security model.
- Do not silently change active storage backends.

## Pull requests

Describe the concrete problem, final behavior, relevant tradeoffs and validation. Include fictional before/after screenshots for UI changes. Explain schema compatibility and rollback for persistence changes. Keep private state out of examples and logs. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
