# Contributing

Thanks for improving Career Agent. Start with the [architecture](docs/ARCHITECTURE.md), [design decisions](docs/DESIGN_DECISIONS.md), and `AGENTS.md`.

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
