# Detailed operational rules

Load only the section needed for the current job. The canonical skill supplies the ordinary workflow; this file preserves uncommon evidence and integrity rules.

## Prior applications

Search actual application confirmations in authorized email and relevant LinkedIn/Handshake candidate history when those tools are available. Record employer, role, date, requisition/job URL, account scope, and a minimal message/page reference. Job alerts, recommendations, abandoned applications and different roles at the same employer are not prior applications. Do not send mail or outreach.

Read `.data/email-application-review.json` when present for previous coverage and unresolved confirmations. Update checked-account scope and unresolved evidence. A disconnected account remains an explicit coverage gap; never report it checked. Exact duplicates are removed from active queues and blocked from submission.

Use `matchScope: "needs_review"` for role evidence with uncertain requisition, office or cohort. Hold matching roles for research without claiming every listing was submitted. Employer-only confirmations stay in the private review file until a role is identified; they never block an entire employer. To resolve a hold, append a sourced exact-role record with the original record's `supersedesId`; retain the original audit evidence. See [payloads](commands.md).

## Eligibility evidence

Read careerStage, yearsExperience, rolePriority, roleKeywords, graduation, earliestStart, locations, workplace preferences and compensation policy from saved state. Career preferences belong to the current candidate, not repository defaults or creator biography. US full-time matching supports new graduates, early-career and experienced candidates according to the saved settings. Dates and required experience need actual posting/profile evidence.

Do not exclude a full-time job merely because it asks about previous internships. Required advanced degrees and security clearance need separate verified qualifications. New graduate searches can include graduate/entry-level terms and the candidate's actual graduation year; broader stages use the selected roles and experience. Never hard-code one candidate's titles.

Read minimum annual compensation and base/total basis from Settings. A range crossing the floor is unconfirmed; undisclosed pay remains in research when a floor applies. Do not count hourly rates, bonuses, equity or sales OTE as annual base salary. An explicit floor of zero means there is no salary minimum.

Authorization now, authorization at the job's start date and future sponsorship are distinct candidate declarations. Confirmed authorization at start plus no future sponsorship means sponsorship evidence is unnecessary; no-sponsorship postings may qualify. Citizenship, ITAR/export-control and clearance still require their own confirmed answers. Otherwise, require live sponsorship evidence with URL, checked date, relevant excerpt, role/employer scope and verified employer-entity match. Explicit refusal overrides historical sponsorship. Employer history does not confirm the role; a form asking about sponsorship does not offer it. Keep ambiguity in research.

Reuse confirmed declarations only for unambiguous equivalent wording. Added conditions about employer support, all-employer eligibility, dates or an attestation require candidate review. Never infer visa status, OPT approval, STEM eligibility, authorization, demographics, experience or qualifications. Team projects do not establish sole authorship, live returns, employment, production scale or quantified impact. Answers need source fact IDs or an exact confirmed saved answer.

## Complete form inspection

Use the chosen agent's available browser tools and returned documentation. Capture the complete hosted form's actual questions, controls, options and required state with `job-inspect`; use ATS IDs where possible. Inspect all sections, including declarations and conditional questions. An API question list is partial until browser verification. Do not claim an unseen form is complete.

Manual postings and platforms without feed integration can still be researched, tracked and submitted through a supported browser session. LinkedIn/Handshake authorized signed-in sessions may supply history or actual form access; prefer direct employer pages for source evidence. Do not mass scrape or claim a persistent API connection from a browser session. Never use employer-only submission APIs or keys.

If login, OTP, CAPTCHA, assessment or a control prevents inspection/completion, preserve the current work and record the exact remaining step with `handoff`. Let the candidate handle it; continue other jobs. Account creation requiring candidate credentials or new unreviewed terms is a user action. Do not ask for passwords/secrets in chat.

When the user asks for forms ready for review, perform actual browser filling and verify all required fields. Record whether uploads or answers remain blocked. Do not click final Submit during preparation. Browser tabs can lose unsaved contents when closed or refreshed, so saved packet readiness must never be presented as persistent completed live forms.

## Documents

Preserve supplied PDF bytes and original upload filenames. Use the app's recorded hash verification immediately before an upload; a checksum mismatch is a blocker, not a reason to replace the saved checksum. Keep the original résumé unchanged. An explicit résumé replacement uses `resume-update` and invalidates affected approvals; preserve previous captured copies.

Register supporting PDFs using `document-add --file`. Their roles come from candidate instructions and accepted employer fields. Save the exact question ID, returned document ID and SHA-256 in packet attachments. A recommendation is not automatically a cover letter, and a transcript must match the degree level requested. Do not attach a recommendation/transcript unless the field accepts it and the exact attachment choice is current in the packet; review mode additionally requires dashboard approval. Never silently substitute files.

The candidate can upload a base cover letter PDF in Start here. It is reference material for drafting, never a selectable packet attachment. Verify its contents before reuse and keep job-specific claims and addresses tailored to the actual employer.

Check each transcript's actual document date. A recent-transcript requirement needs an acceptable copy or explicit confirmation that the employer accepts the available one. Do not overwrite a newer résumé GPA with an older transcript's GPA. Keep student IDs and unrelated academic details out of profile summaries and letters. Create a cover letter only when required, with source-supported facts, in the employer's accepted format.

## Submission integrity

The dashboard records review-mode approval. Agents may read approval but cannot create it through endpoints, direct storage edits or fabricated timestamps. `approved BATCH_ID` supplies the exact approved jobs, packet contents and document choices. Automatic mode instead requires the candidate's saved risk acknowledgment and a complete unchanged ready packet. No substitutions. Recheck each live posting/form before use; content edits and changed requirements require resolution, plus fresh approval in review mode.

Declarations still need the browser tool's required action-time confirmation for legal attestations, signatures and binding agreements. Do not infer them as ordinary fields. Missing or changed consent choices go back to the candidate through the dashboard or a precise manual step when the dashboard cannot capture the control. Continue unaffected applications.

Ordinary preparation stays within the persistent 20/day cap. `preparation-allowance` requires an explicit user request for a one-day manual batch, can raise the allowance to 50, and never authorizes submission. Do not use it to compensate for unsuitable jobs or enlarge scheduled runs. A stored automation ID is not proof of an active scheduler; no scheduling request authorizes submissions.

## Submission outcomes

Call `begin` immediately before any action finalizing an application; it validates freshness, the selected submission mode, packet integrity, résumé/supporting documents, sponsorship, prior history and the global browser lock before persisting the attempt. A validation failure forbids the final action. Only one application is in progress at a time.

Click Submit once. Explicit employer success text or candidate status confirming submission is required for `finish --outcome submitted`; save the identifying text, timestamp and confirmation URL. Filled fields, a button click, generic navigation or an email alert alone are not success evidence.

A timeout, lost session, ambiguous response or crash after submission is `unknown`, never an immediate retry. Save `finish --outcome unknown` or use `recover` for an interrupted `in_progress` attempt. Check actual employer confirmation/status before `reconcile`. A verified validation failure showing nothing was submitted can be marked failed; a subsequent submission still needs a complete current packet and review-mode approval when selected. Report confirmed submissions, unknown outcomes, failures and handoffs accurately and separately.

## Data and capability limits

The CLI saves state and evidence; browser tools perform employer interactions. Neither a CLI packet nor dashboard status proves a browser action occurred. Do not hide missing capabilities by changing agents, connecting accounts or installing servers without user authorization.

Use structured private JSON files for page text instead of shell interpolation. Do not retain unrelated mail, government IDs, tokens or credentials. `export` writes private state without PDF bytes; preserve artifacts separately. `import-backup` accepts only an empty destination with verified matching documents. Never silently fall back from the selected SQLite/Supabase backend.
