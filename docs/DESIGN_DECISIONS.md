# Design decisions

These notes explain the architecture as it exists. They are a design rationale, not a claim that every decision was recorded in advance or that the system has enterprise production scale.

## 1. Local first, one active backend

**Decision:** SQLite by default, with optional explicitly selected Supabase storage.

Application state contains personal answers and employment history. Local storage makes ownership and recovery visible and avoids requiring a hosted account just to run the project. Supabase is useful for a dedicated private cloud state store, but outages must fail visibly instead of silently creating divergent local histories.

**Tradeoff:** this is a single-candidate tool. A multi-user deployment needs authentication, tenant isolation, operational monitoring and a different deployment model.

## 2. Separate the agent from the record system

**Decision:** the engine/CLI manage deterministic state; Codex performs research and browser interactions.

The dashboard should not equate an API request with an employer application. A typed record system can check prerequisites and preserve evidence while the agent adapts to external pages. This also avoids requiring a separate paid model API integration inside the app.

**Tradeoff:** users must have suitable Codex browser/account tools or perform manual handoffs. The app cannot keep researching on its own when the agent session is unavailable.

## 3. Approval binds content, not intent forever

**Decision:** version and hash the exact review packet; invalidate approval on content changes.

A candidate approves specific answers, documents and a job. Editing one of those later should not inherit old permission. Revalidation makes the final action depend on current form requirements and history.

**Tradeoff:** employer changes can require another review. That additional step is preferable to submitting stale answers.

## 4. Original PDFs are immutable artifacts

**Decision:** capture original bytes and verify SHA-256 before use.

PDF re-rendering can alter wording, formatting, metadata or attachments. Hash-based validation gives a precise guarantee: the submitted document matches the selected original bytes.

**Tradeoff:** hashes prove byte identity, not factual correctness or employer acceptance. Older transcripts and recommendation-versus-cover-letter choices still require judgment.

## 5. Uncertainty is a first-class state

**Decision:** unknown pay, sponsorship, role identity and submission outcomes remain explicitly unresolved.

An employer's historical visa filing does not promise sponsorship for a particular role. A salary range crossing a floor does not guarantee an offer above it. A click does not prove submission. Storing these distinctions prevents optimistic assumptions from becoming application facts.

**Tradeoff:** fewer items reach Ready automatically. The queue is useful because it distinguishes evidence from a quota.

## 6. Durable daily accounting and serialized submissions

**Decision:** persist preparation ledger entries, allowances, leases and attempt locks.

Multiple requests, scheduled runs or crashes should not reset limits or create duplicate attempts. SQLite transactions and Supabase revisions coordinate state updates.

**Tradeoff:** stale locks need explicit recovery, and unknown attempts need reconciliation instead of automatic retries.

## 7. A narrow browser helper

**Decision:** preview recognizable blank text fields, fill only selected matches, and never press Next/Submit.

A generic form filler should not infer legal attestations or overwrite existing values. Keeping uploads, custom controls and declarations manual limits surprising behavior.

**Tradeoff:** basic autofill is less comprehensive than site-specific automation. Compatibility is tested in fixtures, not guaranteed for every ATS.

## 8. Transparent public presentation

**Decision:** publish code, architecture, tests and synthetic screenshots; keep personal candidate state private.

A useful portfolio project lets a reader inspect engineering decisions and run a demo. It does not need real application history to demonstrate those ideas. The demo has its own database, reserved example URLs and deliberately unresolved sponsorship evidence.

**Tradeoff:** a clone is not a backup of the original candidate's workspace. Users must preserve state and artifacts separately.

## Next engineering directions

- Extend matching beyond US full-time roles, with country-specific eligibility tests.
- Split the large UI modules into feature components as the interface grows.
- Add reliable site-specific form adapters only with explicit scope and browser validation.
- Introduce schema-versioned incremental persistence if state size becomes a bottleneck.
- Build authenticated extension sync only as a separately reviewed feature; the helper SQL is a schema scaffold, not shipped sync.
