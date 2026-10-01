import { useEffect, useState } from "react";
import {
  Copy,
  ExternalLink,
  Download,
  Search,
  FileText,
  ArrowLeft,
} from "lucide-react";
import type { AppSnapshot, Job } from "../shared/types";
import {
  applicationGroup,
  financeRole,
  helperProfile,
} from "../shared/applicationHub";

function url(value: string) {
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
function payLabel(job: Job, state: AppSnapshot) {
  const pay = state.meta.salaryAssessments?.[job.id];
  if (
    !pay ||
    pay.min == null ||
    pay.period !== "year" ||
    pay.currency !== "USD"
  )
    return "Pay not verified";
  const amount = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  return `${amount(pay.min)}${pay.max != null && pay.max !== pay.min ? `–${amount(pay.max)}` : ""} · ${pay.basis === "base" ? "base" : pay.basis === "total" ? "total" : "basis unverified"}`;
}
const groups = [
  ["active", "Application links"],
  ["research", "Research"],
  ["applied", "Applied"],
  ["archived", "Archived"],
] as const;

type Props = {
  state: AppSnapshot;
  openJob: (id: string) => void;
  editPacket: (id: string) => void;
  markApplied: (id: string) => Promise<boolean>;
  busy: boolean;
};
export default function ApplicationHub({
  state,
  openJob,
  editPacket,
  markApplied,
  busy,
}: Props) {
  const [toolsOnly, setToolsOnly] = useState(false);
  const [family, setFamily] = useState(
    () => new URLSearchParams(location.search).get("track") || "all",
  );
  const [filter, setFilter] = useState(
    () => new URLSearchParams(location.search).get("status") || "active",
  );
  const [search, setSearch] = useState(
    () => new URLSearchParams(location.search).get("q") || "",
  );
  useEffect(() => {
    const u = new URL(location.href);
    for (const [key, value] of [
      ["track", family],
      ["status", filter],
      ["q", search],
    ]) {
      if (value) u.searchParams.set(key, value);
      else u.searchParams.delete(key);
    }
    history.replaceState(null, "", u);
  }, [family, filter, search]);
  const [answers, setAnswers] = useState("");
  const [message, setMessage] = useState("");
  const [confirmApplied, setConfirmApplied] = useState<string | null>(null);
  const jobs = state.jobs
    .filter(
      (j) =>
        family === "all" ||
        (family === "finance" ? financeRole(j) : j.roleFamily === family),
    )
    .sort((a, b) => b.score - a.score);
  const visible = jobs.filter(
    (j) =>
      applicationGroup(j, state) === filter &&
      `${j.company} ${j.title} ${j.location}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const profile = helperProfile(state.profile);
  const reusableAnswers = [
    ...state.profile.facts
      .filter((f) => f.confirmed)
      .map((f) => ({ id: f.id, question: f.label, answer: f.value })),
    ...state.profile.savedAnswers.filter((a) => a.confirmedAt),
  ].filter((a) =>
    `${a.question} ${a.answer}`.toLowerCase().includes(answers.toLowerCase()),
  );
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied.");
    } catch {
      setMessage("Copy unavailable. Select the text and copy it manually.");
    }
  }
  function download() {
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(profile, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = href;
    a.download = "career-helper-profile.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    setMessage("Basic profile exported. Keep this file private.");
  }
  return (
    <div className="apply-hub">
      {toolsOnly && (
        <div className="desk-toolbar">
          <p>
            {toolsOnly
              ? "Original documents and confirmed answers."
              : "Open a role, check the evidence, and review the employer form."}
          </p>
          <button
            className="button secondary"
            onClick={() => setToolsOnly(!toolsOnly)}
          >
            {toolsOnly ? <ArrowLeft size={15} /> : <FileText size={15} />}
            {toolsOnly ? "Back to applications" : "Documents & answers"}
          </button>
        </div>
      )}
      {!toolsOnly && (
        <>
          <section
            className="opportunity-panel desk-list"
            aria-label="Applications"
          >
            <div className="desk-list-header">
              <div>
                <h2>Application tracker</h2>
                <p>2027 graduate roles</p>
              </div>
              <div className="tracker-tools">
                <button
                  className="button secondary small-button"
                  onClick={() => setToolsOnly(true)}
                >
                  <FileText size={14} /> Documents & answers
                </button>
                <button
                  className="button secondary small-button"
                  disabled={!visible.length}
                  onClick={() =>
                    void copy(
                      visible
                        .map(
                          (j) =>
                            `${j.company} — ${j.title}\n${j.applyUrl || j.sourceUrl}`,
                        )
                        .join("\n\n"),
                    )
                  }
                >
                  <Copy size={14} /> Copy links
                </button>
              </div>
            </div>
            <div
              className="tab-row"
              role="group"
              aria-label="Application status"
            >
              {groups.map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={filter === id}
                  className={filter === id ? "selected" : ""}
                  onClick={() => {
                    setFilter(id);
                    setConfirmApplied(null);
                  }}
                >
                  {label}
                  <span>
                    {
                      jobs.filter((j) => applicationGroup(j, state) === id)
                        .length
                    }
                  </span>
                </button>
              ))}
            </div>
            <div className="filters hub-filter-bar">
              <label className="hub-search-label">
                <Search size={16} />
                <input
                  className="hub-search"
                  aria-label="Search applications"
                  placeholder="Search company, role, or location…"
                  name="application-search"
                  autoComplete="off"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                aria-label="Role family"
                value={family}
                onChange={(e) => setFamily(e.target.value)}
              >
                <option value="all">All career tracks</option>
                <option value="product">Product</option>
                <option value="data">Data</option>
                <option value="software">Software</option>
                <option value="finance">Finance & consulting</option>
                <option value="consulting">Consulting</option>
                <option value="other">Other</option>
              </select>
              <span className="small-note" role="status">
                {visible.length} shown
              </span>
            </div>
            <div className="tracker-scroll">
              <table className="tracker-table">
                <thead>
                  <tr>
                    <th scope="col">Company / role</th>
                    <th scope="col">Location</th>
                    <th scope="col">Compensation</th>
                    <th scope="col">Sponsorship</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((job) => {
                    const packet = state.packets.find(
                      (p) => p.jobId === job.id,
                    );
                    const href = url(job.applyUrl) || url(job.sourceUrl);
                    const applied = applicationGroup(job, state) === "applied";
                    return (
                      <tr className="hub-role" key={job.id}>
                        <td className="role-main">
                          <span className="role-company">{job.company}</span>
                          <h3>{job.title}</h3>

                          <details className="hub-handoff">
                            <summary>
                              {packet
                                ? "Saved progress & remaining steps"
                                : "Eligibility notes"}
                            </summary>
                            <p>
                              {packet?.notes ||
                                "Inspect the current employer form before filling."}
                            </p>
                            {(packet?.unresolved || job.eligibilityReasons).map(
                              (item, i) => (
                                <p key={i}>{item}</p>
                              ),
                            )}
                          </details>
                        </td>
                        <td className="role-location">{job.location}</td>
                        <td className="role-pay-cell">
                          <p className="role-pay">{payLabel(job, state)}</p>
                          <span className="small-note">
                            {state.meta.salaryAssessments?.[job.id]?.min != null ? "Annual USD" : "Verify employer posting"}
                            {state.meta.salaryAssessments?.[job.id]?.status ===
                            "overlap"
                              ? "; range crosses minimum"
                              : ""}
                          </span>
                        </td>
                        <td className="role-policy">
                          <p>
                            {job.sponsorship.some(
                              (e) => e.status === "explicit_no",
                            )
                              ? "No sponsorship"
                              : job.sponsorship.some(
                                    (e) =>
                                      e.status === "explicit_yes" &&
                                      e.scope === "role",
                                  )
                                ? "Role sponsorship evidence saved"
                                : job.sponsorship.some(
                                      (e) => e.status === "history_only",
                                    )
                                  ? "Sponsor history; role unconfirmed"
                                  : "Sponsorship unverified"}
                          </p>
                          <span className="small-note">
                            Checked{" "}
                            {new Date(job.fetchedAt).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="hub-actions">
                          {href && (
                            <a
                              className="button secondary small-button"
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {applied ? "View posting" : "Open form"}{" "}
                              <ExternalLink size={13} />
                            </a>
                          )}
                          <button
                            className="button text"
                            onClick={() => openJob(job.id)}
                          >
                            Evidence & details
                          </button>
                          {packet && (
                            <button
                              className="button text"
                              onClick={() => editPacket(packet.id)}
                            >
                              Saved answers
                            </button>
                          )}
                          {!applied &&
                            (confirmApplied === job.id ? (
                              <div className="record-confirm">
                                <p>Already submitted this exact role?</p>
                                <button
                                  className="button secondary small-button"
                                  disabled={busy}
                                  onClick={async () => {
                                    if (await markApplied(job.id)) {
                                      setMessage(
                                        `${job.company}: recorded as applied.`,
                                      );
                                      setConfirmApplied(null);
                                    }
                                  }}
                                >
                                  Yes, record it
                                </button>
                                <button
                                  className="button text"
                                  onClick={() => setConfirmApplied(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                className="button text record-link"
                                disabled={busy}
                                onClick={() => setConfirmApplied(job.id)}
                              >
                                Record prior application
                              </button>
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!visible.length && (
                <div className="hub-empty">
                  <Search size={23} />
                  <h3>No applications in this view</h3>
                  <p>
                    Try another status or career track, clear your search, or
                    add a role from Opportunities.
                  </p>
                  {search && (
                    <button
                      className="button secondary"
                      onClick={() => setSearch("")}
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
            </div>
            <p className="hub-footnote">
              Saved packets do not mean employer forms are complete. Confirm
              role-specific pay and sponsorship before applying.
            </p>
          </section>
        </>
      )}
      {toolsOnly && (
        <div className="hub-tools" id="application-tools">
          <section className="opportunity-panel hub-materials">
            <h2>Documents & saved answers</h2>
            <p className="muted small">
              Original PDFs, unchanged. Use only in fields that accept them and
              check transcript dates.
            </p>
            <a
              className="button secondary"
              href="/api/resume"
              target="_blank"
              rel="noreferrer"
            >
              {state.profile.resume.filename || "Résumé"}{" "}
              <ExternalLink size={14} />
            </a>
            {state.profile.documents?.map((d) => (
              <a
                key={d.id}
                className="button secondary"
                href={`/api/documents/${encodeURIComponent(d.id)}`}
                target="_blank"
                rel="noreferrer"
              >
                {d.filename} <ExternalLink size={14} />
              </a>
            ))}
            <h3>Confirmed answers</h3>
            <input
              className="hub-search"
              aria-label="Search saved answers"
              placeholder="Search education, sponsorship, experience…"
              value={answers}
              onChange={(e) => setAnswers(e.target.value)}
            />
            <div className="hub-answer-list">
              {reusableAnswers.map((a, i) => (
                <div className="hub-answer" key={`${a.id}-${i}`}>
                  <strong>{a.question}</strong>
                  <p>{a.answer}</p>
                  <button
                    className="button text"
                    aria-label={`Copy ${a.question}`}
                    onClick={() => void copy(a.answer)}
                  >
                    <Copy size={13} /> Copy
                  </button>
                </div>
              ))}
              {!reusableAnswers.length && (
                <p className="muted small">
                  No confirmed answers match. Add verified facts in Your
                  profile.
                </p>
              )}
            </div>
          </section>
          <section
            className="opportunity-panel hub-materials"
            id="browser-helper"
          >
            <h2>Basic browser autofill</h2>
            <p>
              Optional Chrome / Edge helper. Preview matching fields and fill
              only those you select.
            </p>
            <ol className="hub-steps">
              <li>
                Open <strong>chrome://extensions</strong> or{" "}
                <strong>edge://extensions</strong> and enable Developer mode.
              </li>
              <li>
                Choose <strong>Load unpacked</strong> and select this project's{" "}
                <strong>browser-extension</strong> folder.
                <button
                  className="button text"
                  onClick={() =>
                    void copy(`${state.meta.workspace}/browser-extension`)
                  }
                >
                  <Copy size={13} /> Copy folder path
                </button>
              </li>
              <li>
                Export your basic profile, then import the JSON in the
                extension.
              </li>
              <li>
                On an employer form, choose <strong>Scan this page</strong>,
                review matches, then <strong>Fill selected</strong>.
              </li>
            </ol>
            <details>
              <summary>Preview exported fields</summary>
              <dl>
                {Object.entries(profile.fields)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div className="hub-answer" key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
            </details>
            <button className="button primary" onClick={download}>
              <Download size={16} /> Export basic profile
            </button>
            <p className="small muted">
              Blank text fields only. Uploads, custom controls, declarations,
              signatures and authorization remain manual. The helper never
              clicks Next or Submit.
            </p>
            <p className="small muted">
              This project’s helper is not an official Codex extension and
              cannot run in its in-app browser. Data stays in extension-local
              storage; use Delete profile to remove it. Re-export after profile
              changes.
            </p>
          </section>
        </div>
      )}
      {message && (
        <div role="status" className="notice">
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
