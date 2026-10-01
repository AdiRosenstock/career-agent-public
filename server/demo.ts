/** An explicitly isolated, fictional workspace. Never reads the normal candidate database. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createSeed } from "./seed.js";
import { createStore } from "./store.js";
import { normalizeJob, assessJob } from "./discovery.js";

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const dataDir = path.join(workspace, ".data", "demo");
await mkdir(dataDir, { recursive: true, mode: 0o700 });
const resumePath = path.join(dataDir, "demo-resume.pdf");
// Placeholder bytes are only for exercising the integrity checks, never for an application.
await writeFile(
  resumePath,
  "%PDF-1.4\n% Fictional demo placeholder. Do not upload to employers.\n",
  { flag: "wx", mode: 0o600 },
).catch((e) => {
  if (e.code !== "EEXIST") throw e;
});
const store = await createStore({
  backend: "sqlite",
  dataDir,
  seed: async () => {
    const s = await createSeed({ resumePath });
    s.profile = {
      ...s.profile,
      name: "Alex Demo",
      email: "candidate@example.test",
      graduation: "2027-06",
    };
    s.settings.minimumAnnualCompensation = 100000;
    s.settings.compensationBasis = "total";
    const now = new Date().toISOString();
    s.jobs = [
      [
        "Northstar Labs",
        "Associate Product Manager — New Grad 2027",
        "product",
        "New York, NY",
        "Annual base salary $120,000–$150,000.",
      ],
      [
        "Orbit Data",
        "Data Engineer — Graduate 2027",
        "data",
        "Chicago, IL",
        "Annual base salary $115,000–$140,000.",
      ],
      [
        "Fieldwork",
        "Software Engineer — New Grad 2027",
        "software",
        "San Francisco, CA",
        "Compensation is not disclosed.",
      ],
    ].map(([company, title, roleFamily, location, pay], index) => {
      const sourceUrl = `https://example.test/jobs/${index + 1}`;
      return assessJob({
        ...normalizeJob({
          company,
          title,
          location,
          description: `Fictional demonstration only. US full-time role for June 2027 bachelor's graduates. No prior full-time experience required. ${pay}`,
          sourceUrl,
          applyUrl: sourceUrl,
          status: "open",
          fetchedAt: now,
        }),
        roleFamily: roleFamily as "product" | "data" | "software",
        sponsorship: [],
      });
    });
    return s;
  },
});
await store.close();
console.log(
  "DEMO ONLY: fictional candidate, fictional jobs, isolated .data/demo. No employer forms.",
);
const child = spawn(
  process.execPath,
  ["--import", "tsx", path.join(workspace, "server/index.ts")],
  {
    cwd: workspace,
    env: {
      ...process.env,
      CAREER_BACKEND: "sqlite",
      CAREER_DATA_DIR: dataDir,
      CAREER_RESUME_PATH: resumePath,
      PORT: "4318",
    },
    stdio: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
