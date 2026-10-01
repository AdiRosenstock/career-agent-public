import { helperProfile } from "./applicationHub";
import type { AppSnapshot } from "./types";

/** Portable, minimal view; never exports local paths, backend credentials or approval authority. */
export function helperBundle(state: AppSnapshot) {
  const { profile } = state;
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    fields: helperProfile(profile).fields,
    answers: profile.savedAnswers
      .filter((a) => a.confirmedAt)
      .map((a) => ({ question: a.question, answer: a.answer })),
    facts: profile.facts
      .filter((f) => f.confirmed)
      .map((f) => ({ label: f.label, value: f.value })),
    records: { education: [], experience: [] },
    documents: [
      {
        id: "resume",
        kind: "resume",
        filename: profile.resume.filename,
        sha256: profile.resume.sha256,
        documentDate: null,
      },
      ...(profile.documents || []).map((d) => ({
        id: d.id,
        kind: d.kind,
        filename: d.filename,
        sha256: d.sha256,
        documentDate: d.documentDate,
      })),
    ],
    jobs: state.jobs
      .filter((j) => state.packets.some((p) => p.jobId === j.id))
      .map((j) => {
        const packet = [...state.packets]
          .filter((p) => p.jobId === j.id)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        return {
          id: j.id,
          company: j.company,
          title: j.title,
          url: j.applyUrl || j.sourceUrl,
          updatedAt: packet.updatedAt,
          status: packet.status,
          unresolved: packet.unresolved,
          alreadyApplied:
            (state.meta.appliedJobIds || []).includes(j.id) ||
            state.attempts.some(
              (a) =>
                a.jobId === j.id &&
                ["submitted", "unknown", "in_progress"].includes(a.outcome),
            ),
          answers: packet.answers
            .filter((a) => a.confirmed)
            .map((a) => ({
              question: a.question,
              answer: a.answer,
              questionId: a.questionId,
            })),
          attachments: (packet.attachments || []).map((a) => ({
            ...a,
            question:
              j.questions.find((q) => q.id === a.questionId)?.label || "",
          })),
        };
      }),
  };
}
