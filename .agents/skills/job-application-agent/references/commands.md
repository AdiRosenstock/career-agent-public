# Payload examples

Use a private JSON file under `.data/work/`, not shell interpolation of page text. `npm run agent -- COMMAND --file /absolute/path.json` loads it. Do not put credentials in input files.

Import a supported posting:
```json
{"url":"https://job-boards.greenhouse.io/BOARD/jobs/POST_ID"}
```

After inspecting all actual form controls:
```json
{"questions":[{"id":"first_name","label":"First Name","required":true,"type":"input_text"},{"id":"resume","label":"Resume","required":true,"type":"input_file"}]}
```

Packet edit (use real fact IDs from `state`; this is only a shape example):
```json
{"answers":[{"questionId":"first_name","question":"First Name","answer":"Alex","factIds":["name"],"confirmed":true}],"coverLetter":"","notes":"Hosted form inspected; required questions recorded."}
```

For a manual job, inspect `shared/types.ts` and an existing job from `state`, then save a complete sourced Job via `job-put`. Explicitly set fetched time, open/closed/unknown status, question inspection state, and sponsorship evidence. Do not claim a manual import has been verified until the employer page has been read.

To resume a user-approved batch: `approved BATCH_ID`, `packet PACKET_ID`, `refresh JOB_ID`, `job-inspect JOB_ID --file FILE`, then `begin PACKET_ID` immediately before the final submission action. `begin` returns the attempt identifier; pass that identifier to `finish`.

Use shell-safe structured files for long text. Unknown outcomes cannot be retried until `reconcile` records checked evidence. Employer-only keys and application POST APIs are never needed.

Register a user-supplied supporting PDF (no upload occurs):
```json
{"path":"/absolute/path/to/Transcript.pdf","kind":"transcript","label":"Unofficial transcript","documentDate":"2024-12-19","notes":"Historical transcript; confirm acceptability when the employer requests a recent copy."}
```

Use `document-add --file FILE`, then explicitly select a returned document in a packet with `packet-edit --file FILE`:
```json
{"attachments":[{"questionId":"actual_form_upload_id","documentId":"registered_document_id","sha256":"actual_64_character_sha256_from_document_record"}]}
```

Record only verified prior-application evidence via `prior-application --file FILE`:
```json
{"id":"unique_record_id","company":"Verified employer","title":"Exact application role title","jobUrl":"https://employer.example/jobs/requisition","postingId":"exact_requisition_id","source":"email","sourceRef":"connector message ID or accessible message link","evidence":"Minimal confirmation excerpt identifying the submitted application and role.","appliedAt":"2026-09-20T12:00:00Z","checkedAt":"2026-09-27T12:00:00Z"}
```

Use actual values, not the example. `jobUrl`, `postingId`, and `appliedAt` may be null when absent; use `matchScope: "needs_review"` for role-specific evidence when the exact requisition, office, or cohort is uncertain. This holds matching roles for research without marking them applied. Employer-only evidence cannot be imported as a role; keep it in `.data/email-application-review.json` until identified. Omit `matchScope` or use `"exact_role"` only when the posting identity is confirmed. To resolve a review hold, append a new sourced exact record with a confirmed requisition, the same employer/title, and `supersedesId` set to the original review record ID. Keep the original record for audit; do not delete or overwrite evidence. Do not store unrelated email content. For account-check instructions use `prompt accounts`.

Salary policy with `settings-update --file FILE`:
```json
{"minimumAnnualCompensation":100000,"compensationBasis":"base"}
```
