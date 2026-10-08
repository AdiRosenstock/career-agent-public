# Changelog

## Adi “The Goat” Rosenstock and submission choices — 2026-10-08

- Branded the shared Codex / Claude Code agent workflow as Adi “The Goat” Rosenstock without using the creator's identity as a candidate profile.
- Exposed self, approved-batch and automatic agent submission as three visible setup choices, with a separate risk acknowledgment for automatic submission.
- Clarified that the agent can click Submit when the saved mode and current request authorize it.
- Added an optional GitHub Star invitation to the installation prompt, setup output and dashboard.

## Public release preparation — 2026-10-01

- Added first-run setup, Codex workflow, architecture, design rationale, configuration, CLI and troubleshooting documentation.
- Added an isolated fictional demo on port 4318.
- Redesigned the application desk with all-track filtering, evidence columns, direct copy, and a separate documents/answers view.
- Added an explicit confirmation before recording a prior application.
- Removed candidate-specific shared instructions and UI document assumptions.
- Preserved original résumé filenames in fresh workspaces and document responses; existing state remains authoritative.
- Added CI, contribution/security guidance, MIT license, synthetic screenshots and a public-file hygiene gate.
- Kept personal state and application artifacts outside the public source tree.

This release uses a clean public source history. Private development history and candidate data are not part of the public distribution.

### Shared agent setup

- Added Claude Code instructions/skill discovery alongside Codex, plus provider-aware dashboard prompts.
- Added first-run setup and read-only diagnostics, with explicit refusal to overwrite existing configuration.
- Documented bring-your-own storage, agent accounts and MCP servers; made graduation input editable.

- Removed personal branding from the README, package metadata and license attribution.
