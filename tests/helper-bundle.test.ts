import test from "node:test";
import assert from "node:assert/strict";
import { helperBundle } from "../shared/helperBundle";
import type { AppSnapshot } from "../shared/types";

test("full helper bundle includes confirmed answers and duplicate state without paths or approval authority", () => {
  const state = {
    profile: {
      name: "Alex Example",
      email: "alex@example.test",
      phone: "",
      linkedin: "",
      github: "",
      savedAnswers: [
        {
          id: "a",
          question: "Sponsorship?",
          answer: "Yes",
          confirmedAt: "2026-01-01",
        },
        {
          id: "b",
          question: "Unverified",
          answer: "Never export",
          confirmedAt: "",
        },
      ],
      facts: [
        {
          id: "f",
          label: "Experience",
          value: "Fictional project",
          confirmed: true,
          source: "/private/source",
        },
      ],
      resume: {
        filename: "Example Resume.pdf",
        sha256: "a".repeat(64),
        path: "/private/resume.pdf",
        originalPath: "/private/original.pdf",
      },
      documents: [],
    },
    jobs: [
      {
        id: "job",
        company: "Example",
        title: "2027 Analyst",
        applyUrl: "https://example.test/job",
        sourceUrl: "https://example.test/job",
        questions: [],
      },
    ],
    packets: [
      {
        id: "p",
        jobId: "job",
        updatedAt: "2026-01-01",
        status: "approved",
        approvalId: "private-approval",
        unresolved: [],
        answers: [
          {
            questionId: "q",
            question: "Name",
            answer: "Alex",
            confirmed: true,
          },
          {
            questionId: "u",
            question: "Unknown",
            answer: "Never export",
            confirmed: false,
          },
        ],
      },
    ],
    meta: { appliedJobIds: ["job"] },
    attempts: [],
  } as unknown as AppSnapshot;
  const bundle = helperBundle(state);
  const encoded = JSON.stringify(bundle);
  assert.equal(bundle.version, 2);
  assert.equal(bundle.jobs[0].alreadyApplied, true);
  assert.deepEqual(bundle.answers, [
    { question: "Sponsorship?", answer: "Yes" },
  ]);
  assert.deepEqual(bundle.jobs[0].answers, [
    { question: "Name", answer: "Alex", questionId: "q" },
  ]);
  assert.equal(encoded.includes("/private/"), false);
  assert.equal(encoded.includes("private-approval"), false);
  assert.equal(encoded.includes("Never export"), false);
  state.meta.appliedJobIds = [];
  state.attempts = [{ jobId: "job", outcome: "unknown" }] as any;
  assert.equal(
    helperBundle(state).jobs[0].alreadyApplied,
    true,
    "uncertain outcomes must not be offered as safe retries",
  );
});
