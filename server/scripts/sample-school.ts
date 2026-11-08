// Builds the SAMPLE SCHOOL on an empty installation: an administrator, a
// teacher and a class of students with a few weeks of results, coins on the
// blockchain, AI-drafted questions waiting for review, and one assessment left
// for you to sit live. Every account uses the password "password123" and no 2FA.
//
//   pnpm sample:school
//
// Sample accounts only work while sample mode is on (the default in
// development; set SAMPLE_SCHOOL=on to use them on a server). Everything is
// created through the app's own API (sign-up with codes, sitting assessments,
// marking, releasing). The only shortcut: the first three assessments are
// dated over the past five weeks so the trend charts have something to show.
//
// It refuses to run on a database that already has accounts.
import "./load-env";
import type { AddressInfo } from "node:net";
import { createHmac, randomInt } from "node:crypto";
import { parseArgs } from "node:util";

process.env.LEDGER_SYNC = "off"; // we sync once at the end, after dating the history
process.env.SAMPLE_SCHOOL = "on"; // sample accounts skip 2FA

const { default: express } = await import("express");
const { connectToDatabase, disconnectFromDatabase } = await import("../db/connect");
const { AssessmentAttemptModel, UserModel } = await import("../db/models");
const { apiErrorHandler, apiRouter } = await import("../api/router");
const { ensureSetupCode, SAMPLE_PASSWORD } = await import("../api/signup");
const { syncWalletEventsToLedger, closeLedgerConnections, describeLedgerError } = await import("../ledger");

const { values } = parseArgs({
  options: {
    school: { type: "string", default: "Riverside High School (Sample)" },
    url: { type: "string", default: process.env.SAMPLE_URL ?? "http://localhost:8443" },
    "i-understand": { type: "boolean", default: false },
  },
});

// ------------------------------------------------------------ helpers

let seed = 20261108;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

let base = "";
class Session {
  cookie = "";
  async call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json", "X-Requested-With": "dsw" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0].endsWith("=") ? "" : setCookie.split(";")[0];
    const json = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json?.message ?? ""}`);
    return json as T;
  }
}

const step = (text: string) => console.log(`  • ${text}`);
const password = () => SAMPLE_PASSWORD;
/** Marks a just-created account as a sample account (simple password, no 2FA). */
const markSample = (email: string) => UserModel.updateOne({ email }, { $set: { sample: true, mustChangePassword: false } });

// ------------------------------------------------------------ the school

const STUDENTS: { first: string; last: string; base: number; growth: number }[] = [
  { first: "Mia", last: "Chen", base: 0.62, growth: 0.08 }, // the student you sign in as
  { first: "Liam", last: "Walker", base: 0.85, growth: 0.02 },
  { first: "Ava", last: "Patel", base: 0.92, growth: 0.0 },
  { first: "Noah", last: "Nguyen", base: 0.45, growth: 0.1 }, // hasn't given consent
  { first: "Isla", last: "Thompson", base: 0.7, growth: 0.04 },
  { first: "Ethan", last: "Okafor", base: 0.55, growth: -0.05 },
  { first: "Zoe", last: "Martin", base: 0.78, growth: 0.05 },
  { first: "Lucas", last: "Brown", base: 0.35, growth: 0.06 },
  { first: "Grace", last: "Kim", base: 0.88, growth: 0.03 },
  { first: "Oliver", last: "Singh", base: 0.6, growth: 0.02 },
  { first: "Ruby", last: "Taylor", base: 0.5, growth: 0.07 },
];

const TEMPLATES = [
  { title: "Evidence and Sources", weeksAgo: 5, skills: ["analytical-thinking", "research", "critical-thinking"], rows: [["analytical-thinking", 1, 1], ["analytical-thinking", 2, 1], ["research", 1, 1], ["research", 2, 1], ["critical-thinking", 1, 1], ["critical-thinking", 2, 1]] },
  { title: "Ideas and Decisions", weeksAgo: 3, skills: ["creativity", "decision-making", "critical-thinking"], rows: [["creativity", 1, 1], ["creativity", 2, 1], ["creativity", 3, 1], ["decision-making", 1, 1], ["decision-making", 2, 1], ["critical-thinking", 3, 1]] },
  { title: "Working Together", weeksAgo: 1, skills: ["collaboration", "adaptability", "analytical-thinking"], rows: [["collaboration", 1, 1], ["collaboration", 2, 1], ["adaptability", 1, 1], ["adaptability", 2, 1], ["analytical-thinking", 3, 1]] },
  { title: "Term Check-in: All Seven Skills", weeksAgo: null, skills: ["analytical-thinking", "research", "critical-thinking", "creativity", "decision-making", "collaboration", "adaptability"], rows: [["analytical-thinking", 3, 1], ["research", 3, 1], ["critical-thinking", 3, 1], ["creativity", 3, 1], ["decision-making", 3, 1], ["collaboration", 3, 1], ["adaptability", 3, 1], ["research", 2, 1]] },
] as const;

const FEEDBACK = [
  "Clear reasoning. Next time, back up each point with evidence.",
  "Good ideas. Explain how you reached your answer, not just the answer.",
  "Strong work. Try a counter-argument before you decide.",
  "You're improving. Slow down and re-read each question.",
];

async function main() {
  await connectToDatabase();
  const accounts = await UserModel.countDocuments();
  if (accounts > 0) {
    console.error(`\nsample:school only runs on an EMPTY database, and this one has ${accounts} account(s).`);
    console.error("It never mixes sample data into a real school. To start fresh on a test machine, see docs/DEMO.md (\"Reset\").\n");
    process.exitCode = 1;
    return;
  }
  if (process.env.NODE_ENV === "production" && !values["i-understand"]) {
    console.error("\nNODE_ENV is production. The sample school belongs on a test installation.");
    console.error("If this really is a test server, re-run with --i-understand.\n");
    process.exitCode = 1;
    return;
  }

  // Run the real API in this process, on a random local port.
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter, apiErrorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  console.log(`\nBuilding the sample school "${values.school}"…`);

  // 1. School and administrator (first-time setup, as in the browser)
  const admin = new Session();
  const adminPassword = password();
  await admin.call("POST", "/signup/setup", { setupCode: await ensureSetupCode(), schoolName: values.school, firstName: "Alex", lastName: "Morgan", email: "admin@sample.school", password: adminPassword });
  await markSample("admin@sample.school");
  await admin.call("PUT", "/admin/school", { name: values.school, shortName: "Riverside", academicYear: new Date().getFullYear(), term: 4, walletPrefix: "RHS", timezone: "Australia/Brisbane", aiMarkingEnabled: true });
  const staffCode = (await admin.call("POST", "/admin/school/staff-code", { enabled: true })).staffCode as string;
  step("School and administrator (Alex Morgan)");

  // 2. Teacher signs up with the staff code
  const teacher = new Session();
  const teacherPassword = password();
  await teacher.call("POST", "/signup", { code: staffCode, firstName: "Sam", lastName: "Rivera", email: "teacher@sample.school", password: teacherPassword });
  await markSample("teacher@sample.school");
  const teacherId = (await teacher.call("GET", "/auth/me")).user.id as string;
  step("Teacher (Sam Rivera) signed up with the staff code");

  // 3. Class, class code, students sign up with it
  const classId = (await admin.call("POST", "/admin/classes", { name: "10 Thinking A", subject: "General Capabilities", yearLevel: 10, term: 4, teacherIds: [teacherId], studentIds: [] })).id as string;
  const classCode = (await teacher.call("POST", `/classes/${classId}/join-code`, { enabled: true })).joinCode as string;
  const students: { first: string; last: string; email: string; password: string; session: Session; base: number; growth: number }[] = [];
  for (const s of STUDENTS) {
    const session = new Session();
    const email = s.first === "Mia" ? "student@sample.school" : `${s.first.toLowerCase()}@sample.school`;
    const pw = password();
    await session.call("POST", "/signup", { code: classCode, firstName: s.first, lastName: s.last, email, password: pw, yearLevel: 10 });
    await markSample(email);
    students.push({ ...s, email, password: pw, session });
  }
  step(`${students.length} students signed up with class code ${classCode}`);

  // 4. Question bank: starter questions, approved by the teacher
  const { execSync } = await import("node:child_process");
  execSync("pnpm -s db:starter-items", { stdio: "ignore" });
  for (const item of (await teacher.call("GET", "/items?status=pending_review")).items) {
    await teacher.call("POST", `/items/${item.id}/review`, { decision: "approve", comments: "Checked for accuracy and level." });
  }
  const answerKey = new Map<string, string>((await teacher.call("GET", "/items?status=approved")).items.map((i: any) => [i.id, i.answer.correctOption]));
  step("28 starter questions approved by the teacher");

  // 5. Assessments: three in the past (released), one current (to sit live)
  const now = Date.now();
  for (const [t, tpl] of TEMPLATES.entries()) {
    const templateId = (await teacher.call("POST", "/templates", {
      title: tpl.title,
      description: "Skills check-in through General Capabilities tasks.",
      subject: "General Capabilities",
      yearLevels: { min: 9, max: 11 },
      skills: tpl.skills,
      difficulty: "intermediate",
      durationMinutes: 30,
      blueprint: tpl.rows.map(([skill, complexity, count]) => ({ skill, complexity, count })),
    })).id as string;
    await teacher.call("POST", `/templates/${templateId}/status`, { status: "published" });
    const due = new Date(now + (tpl.weeksAgo === null ? 7 : -tpl.weeksAgo * 7 + 2) * 86_400_000).toISOString().slice(0, 10);
    await teacher.call("PUT", `/templates/${templateId}/assignments/${classId}`, { dueAt: due });

    const live = tpl.weeksAgo === null;
    for (const s of students) {
      if (live && s.first === "Mia") continue; // you sit this one live
      const ability = Math.min(0.97, Math.max(0.15, s.base + s.growth * t));
      const { attemptId } = await s.session.call("POST", `/me/assessments/${templateId}/start`);
      const paper = await s.session.call("GET", `/me/attempts/${attemptId}`);
      for (const q of paper.questions) {
        const correct = answerKey.get(q.itemId);
        const right = rand() < ability + (rand() - 0.5) * 0.2;
        const answer = q.type === "multiple_choice" ? (right ? correct : q.options.find((o: any) => o.key !== correct).key) : "I would compare the two options, look for evidence on each side, and check who benefits before deciding.";
        await s.session.call("PUT", `/me/attempts/${attemptId}/responses`, { itemId: q.itemId, answer });
      }
      await s.session.call("POST", `/me/attempts/${attemptId}/submit`);
      if (live) continue;
      // The teacher marks written answers
      const detail = await teacher.call("GET", `/marking/${attemptId}`);
      const marks: Record<string, number> = {};
      for (const q of detail.questions) if (q.type === "short_response") marks[q.itemId] = Math.max(0, Math.min(q.maxPoints, Math.round(ability * q.maxPoints + (rand() - 0.5))));
      await teacher.call("POST", `/marking/${attemptId}`, { marks, feedback: FEEDBACK[Math.floor(rand() * FEEDBACK.length)] });
    }
    if (live) {
      step(`"${tpl.title}" assigned (due in a week): most of the class has submitted, Mia hasn't started`);
      continue;
    }
    const ready = (await teacher.call("GET", "/marking")).attempts.filter((a: any) => a.status === "marked").map((a: any) => a.id);
    await teacher.call("POST", "/marking/release", { ids: ready });
    // Date this assessment in the past so the trend charts have history.
    const released = new Date(now - tpl.weeksAgo * 7 * 86_400_000);
    const attempts = await AssessmentAttemptModel.find({ _id: { $in: ready } });
    for (const a of attempts) {
      const started = new Date(released.getTime() - 2 * 86_400_000 + Math.floor(rand() * 6 * 3_600_000));
      const submitted = new Date(started.getTime() + (16 + Math.floor(rand() * 12)) * 60_000);
      await AssessmentAttemptModel.updateOne(
        { _id: a._id },
        { $set: { startedAt: started, endsAt: new Date(started.getTime() + 30 * 60_000), lastSavedAt: submitted, submittedAt: submitted, markedAt: new Date(released.getTime() - 3_600_000), releasedAt: released } },
      );
    }
    step(`"${tpl.title}": sat, marked and released ${tpl.weeksAgo} week${tpl.weeksAgo === 1 ? "" : "s"} ago`);
  }

  // 6. Privacy: Mia lets the teacher see her results and shares her skills
  const mia = students[0].session;
  const teachers = (await mia.call("GET", "/me/consents")).teachers;
  await mia.call("POST", "/me/consents", { teacherId: teachers[0].id });
  const link = await mia.call("POST", "/me/verification-links", { label: "Part-time job application", skills: ["analytical-thinking", "research", "critical-thinking", "creativity"], includeAchievements: true, expiresInDays: 90 });
  step("Mia gave her teacher consent and created a verification link");

  // A late joiner with no results yet
  const leoPassword = password();
  await new Session().call("POST", "/signup", { code: classCode, firstName: "Leo", lastName: "Rossi", email: "leo@sample.school", password: leoPassword, yearLevel: 10 });
  await markSample("leo@sample.school");
  students.push({ first: "Leo", last: "Rossi", email: "leo@sample.school", password: leoPassword, session: new Session(), base: 0, growth: 0 });
  step("Leo Rossi joined late (no results yet)");

  // 7. The AI drafts a few questions for the teacher to review
  const job = await teacher.call("POST", "/ai/item-jobs", { subject: "General Capabilities", skills: ["critical-thinking", "creativity"], complexities: [2, 3], count: 4, types: "mixed", yearLevel: 10, topic: "Everyday decisions at school" });
  let aiJob: any = null;
  for (let i = 0; i < 180; i++) {
    aiJob = await teacher.call("GET", `/ai/jobs/${job.jobId}`);
    if (aiJob.status !== "running" && aiJob.status !== "queued") break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const queuedCount = aiJob?.items?.filter((i: any) => i.status === "pending_review").length ?? 0;
  step(aiJob?.status === "succeeded" ? `AI (${aiJob.mode === "offline" ? "offline demo" : aiJob.model}) drafted and validated questions: ${queuedCount} waiting for the teacher's review` : `AI step skipped: ${aiJob?.error ?? "no result"}`);

  // 8. Write the coins to the blockchain
  // A network started moments ago can take a little while before both
  // organisations can endorse, so retry for up to a minute.
  let ledgerNote = "";
  let committed = 0;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const report = await syncWalletEventsToLedger();
      committed += report.committed + report.alreadyOnLedger;
      if (report.failed.length === 0) {
        ledgerNote = `${committed} coin transactions written to the blockchain`;
        break;
      }
      ledgerNote = `${committed} coin transactions on the blockchain, ${report.failed.length} still waiting (run pnpm ledger:sync, or the app retries automatically): ${report.failed[0].error.slice(0, 120)}`;
    } catch (error) {
      ledgerNote = `Blockchain not reachable (${describeLedgerError(error)}). Start it with pnpm fabric:up; the app writes the coins when it can.`;
    }
    if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  step(ledgerNote);
  server.close();

  // 9. Summary
  const url = values.url!.replace(/\/$/, "");
  console.log(`\n${"─".repeat(72)}`);
  console.log(`SAMPLE SCHOOL ready: ${values.school}`);
  console.log(`Open ${url} and use the one-click buttons, or sign in with:`);
  console.log(`  Student   student@sample.school   (Mia Chen: has an assessment to sit live)`);
  console.log(`  Teacher   teacher@sample.school   (Sam Rivera)`);
  console.log(`  Admin     admin@sample.school     (Alex Morgan)`);
  console.log(`  Password for every sample account: ${SAMPLE_PASSWORD}   (no 2FA)`);
  console.log(`  Classmates: <first name>@sample.school, e.g. noah@sample.school`);
  console.log(`\nClass code ${classCode} · staff code ${staffCode} · Mia's verification link: ${url}/verify/${link.code}`);
  console.log(`${"─".repeat(72)}\n`);
}

main()
  .catch((error) => {
    console.error("\nDemo setup failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeLedgerConnections().catch(() => undefined);
    await disconnectFromDatabase();
  });
