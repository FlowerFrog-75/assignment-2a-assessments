// Loads demo data that mirrors the UI prototype (Jordan Smith, Ms Chen, the
// six assessment templates...) so the front end has realistic data to build
// against.
//
//   npm run db:seed            # only runs on an empty database
//   npm run db:seed -- --reset # DELETES all app collections first
//
// Refuses to run when NODE_ENV=production.
import "./load-env";
import type { SkillKey } from "../lib/db/constants";
import { connectToDatabase, disconnectFromDatabase } from "../lib/db/connect";
import {
  AchievementModel,
  AssessmentAttemptModel,
  AssessmentItemModel,
  AssessmentTemplateModel,
  ClassGroupModel,
  ConsentModel,
  TeacherNoteModel,
  UserModel,
  WalletEventModel,
  allModels,
  appendAuditLog,
  createVerificationLink,
  verifyAuditChain,
  walletBalances,
  type AssessmentItemDocument,
  type AssessmentTemplateDocument,
  type ClassGroupDocument,
  type UserDocument,
} from "../lib/db/models";
import { hashPassword } from "../lib/security/password";

const COINS_PER_POINT = 10;
const SCHOOL = "Northview Secondary School";
const now = Date.now();
const daysAgo = (days: number, minutes = 0) => new Date(now - days * 86_400_000 + minutes * 60_000);
const daysFromNow = (days: number) => new Date(now + days * 86_400_000);

// ---------------------------------------------------------------------------
// Item bank. Points equal complexity, so harder items are worth more.
// ---------------------------------------------------------------------------
type ItemSpec = {
  key: string;
  subject: string;
  skill: SkillKey;
  complexity: number;
  prompt: string;
  options?: [key: string, text: string][];
  correct?: string;
  modelAnswer?: string;
  rubric?: string;
  ai?: { status: "pending_review" | "rejected"; notes: string; reviewComment?: string };
};

const ITEM_SPECS: ItemSpec[] = [
  // Science: Critical Thinking in Data Interpretation
  {
    key: "sci-analytical-3", subject: "Science", skill: "analytical-thinking", complexity: 3,
    prompt: "A scientist observes that plants in a controlled environment grow taller when exposed to blue light compared to red light. Which of the following best describes an analytical approach to investigating this finding?",
    options: [
      ["A", "Accept the finding and apply it to all plant species immediately"],
      ["B", "Design a controlled experiment varying light wavelengths while holding other variables constant"],
      ["C", "Conclude that blue light is universally superior for all photosynthetic organisms"],
      ["D", "Record the observation in a journal without further investigation"],
    ],
    correct: "B",
  },
  {
    key: "sci-analytical-4", subject: "Science", skill: "analytical-thinking", complexity: 4,
    prompt: "Across five coastal towns, ice-cream sales and swimming accidents both rise during summer months. What is the strongest conclusion from this data?",
    options: [
      ["A", "Eating ice-cream causes swimming accidents"],
      ["B", "Swimming accidents cause people to buy ice-cream"],
      ["C", "Both are probably driven by a third variable, such as temperature"],
      ["D", "The data is unreliable and should be ignored"],
    ],
    correct: "C",
  },
  {
    key: "sci-critical-3", subject: "Science", skill: "critical-thinking", complexity: 3,
    prompt: "An article claims a supplement 'boosts memory by 50%', citing a study of 12 people with no control group. What is the main weakness of this evidence?",
    options: [
      ["A", "The supplement is expensive"],
      ["B", "The sample is very small and there is no control group"],
      ["C", "The article was published online"],
      ["D", "50% is too large a number to be real"],
    ],
    correct: "B",
  },
  {
    key: "sci-critical-4", subject: "Science", skill: "critical-thinking", complexity: 4,
    prompt: "Two experiments testing the same fertiliser report opposite results. What is the best next step?",
    options: [
      ["A", "Trust the experiment that reported the larger effect"],
      ["B", "Average the two results"],
      ["C", "Compare the methods, sample sizes and conditions to find the cause of the difference"],
      ["D", "Discard both experiments"],
    ],
    correct: "C",
  },
  {
    key: "sci-research-3", subject: "Science", skill: "research", complexity: 3,
    prompt: "Which source is most appropriate for checking the current scientific consensus on climate change?",
    options: [
      ["A", "A widely shared social media post"],
      ["B", "A peer-reviewed review article or an IPCC assessment report"],
      ["C", "A blog written by an anonymous author"],
      ["D", "An advertisement from an energy company"],
    ],
    correct: "B",
  },
  // Mathematics: Collaborative Problem Solving
  {
    key: "math-collab-2", subject: "Mathematics", skill: "collaboration", complexity: 2,
    prompt: "Your group has 20 minutes to solve a multi-step budgeting problem. Describe how you would divide the work and how the group would check each other's calculations.",
    modelAnswer: "Assign roles (e.g. reader, calculator, checker), split the steps, then swap and independently re-check each step before combining answers.",
    rubric: "1 mark: clear division of roles or steps. 1 mark: a concrete peer-checking strategy.",
  },
  {
    key: "math-decision-3", subject: "Mathematics", skill: "decision-making", complexity: 3,
    prompt: "Plan 1 costs $30/month plus $0.02 per MB over 2,000 MB. Plan 2 costs $45/month with unlimited data. You use about 3,000 MB a month. Which plan should you choose?",
    options: [
      ["A", "Plan 1, because its base price is lower"],
      ["B", "Plan 2, because Plan 1 would cost $50 for your usage"],
      ["C", "Either. They cost the same"],
      ["D", "There is not enough information to decide"],
    ],
    correct: "B",
  },
  {
    key: "math-analytical-2", subject: "Mathematics", skill: "analytical-thinking", complexity: 2,
    prompt: "A sequence goes 3, 7, 11, 15, ... What is the 10th term?",
    options: [["A", "39"], ["B", "40"], ["C", "43"], ["D", "35"]],
    correct: "A",
  },
  // Humanities: Research Methods & Source Evaluation
  {
    key: "hum-research-3", subject: "Humanities", skill: "research", complexity: 3,
    prompt: "You are researching daily life in Brisbane during the 1890s depression. Which of these is a primary source?",
    options: [
      ["A", "A 2015 history textbook chapter"],
      ["B", "A newspaper article published in 1893"],
      ["C", "A documentary made in 2020"],
      ["D", "An online encyclopedia article"],
    ],
    correct: "B",
  },
  {
    key: "hum-research-4", subject: "Humanities", skill: "research", complexity: 4,
    prompt: "Explain how you would decide whether a website about a historical event is reliable. Give at least three criteria.",
    modelAnswer: "Check the author's expertise, the publisher and purpose, whether claims are referenced to evidence, the date, and whether other reputable sources agree.",
    rubric: "1 mark per valid criterion (max 3). 1 further mark for explaining why one criterion matters.",
  },
  {
    key: "hum-critical-4", subject: "Humanities", skill: "critical-thinking", complexity: 4,
    prompt: "Two historians disagree about the causes of an event. What is the best way to evaluate their arguments?",
    options: [
      ["A", "Choose the more famous historian"],
      ["B", "Examine the evidence each uses and how well it supports their claims"],
      ["C", "Prefer whichever account is more recent"],
      ["D", "Assume both are equally correct"],
    ],
    correct: "B",
  },
  // Economics: Decision-Making Under Uncertainty
  {
    key: "eco-decision-3", subject: "Economics", skill: "decision-making", complexity: 3,
    prompt: "A busy café can buy a second coffee machine now, or wait six months for a possible price drop. Demand has been rising steadily. What is the strongest reason to buy now?",
    options: [
      ["A", "Prices always go up"],
      ["B", "Sales lost to long queues may outweigh the possible saving"],
      ["C", "Waiting is always risky"],
      ["D", "A competitor might buy one too"],
    ],
    correct: "B",
  },
  {
    key: "eco-analytical-3", subject: "Economics", skill: "analytical-thinking", complexity: 3,
    prompt: "A product's price rises from $10 to $12 and the quantity sold falls from 100 to 80. What happens to total revenue?",
    options: [["A", "It rises by $40"], ["B", "It falls by $40"], ["C", "It stays the same"], ["D", "It falls by $200"]],
    correct: "B",
  },
  {
    key: "eco-critical-3", subject: "Economics", skill: "critical-thinking", complexity: 3,
    prompt: "An advertisement says '9 out of 10 customers recommend us'. Which question best tests this claim?",
    options: [
      ["A", "What colour is the company's logo?"],
      ["B", "How many customers were surveyed, and how were they chosen?"],
      ["C", "How long has the company been operating?"],
      ["D", "Was the advertisement shown on television?"],
    ],
    correct: "B",
  },
  // Personal Development: Growth Mindset & Resilience Survey
  {
    key: "pd-adapt-1", subject: "Personal Development", skill: "adaptability", complexity: 1,
    prompt: "Describe a time your plans changed suddenly. What did you do to adjust?",
    rubric: "1 mark: describes a specific change and a concrete adjustment.",
  },
  {
    key: "pd-collab-1", subject: "Personal Development", skill: "collaboration", complexity: 1,
    prompt: "Describe a time you helped a group member who was struggling. What did you do?",
    rubric: "1 mark: describes a specific, supportive action.",
  },
  // English (draft template): AI-drafted items waiting in the review queue
  {
    key: "eng-creativity-3", subject: "English", skill: "creativity", complexity: 3,
    prompt: "Rewrite the opening of a well-known fairy tale from the point of view of a minor character, in no more than 150 words.",
    rubric: "Perspective is consistent (1), distinctive voice (1), stays within the word limit (1).",
    ai: { status: "pending_review", notes: "Open-ended creative prompt; rubric covers perspective, voice and word limit. No factual claims to verify." },
  },
  {
    key: "eng-adapt-2", subject: "English", skill: "adaptability", complexity: 2,
    prompt: "Your story competition entry suddenly has to be half as long. What should you cut first?",
    options: [["A", "Dialogue"], ["B", "Description"], ["C", "Minor subplots"], ["D", "The ending"]],
    correct: "C",
    ai: {
      status: "rejected",
      notes: "Single best answer identified as C.",
      reviewComment: "Too subjective for multiple choice. Several options could be defended. Convert to a short response.",
    },
  },
];

// ---------------------------------------------------------------------------
// Marking helpers
// ---------------------------------------------------------------------------
type AnswerSpec = string | { text: string; points: number } | null; // option key | written answer | unanswered

function gradeFor(percent: number): string {
  if (percent >= 85) return "A";
  if (percent >= 70) return "B";
  if (percent >= 50) return "C";
  if (percent >= 30) return "D";
  return "E";
}

function buildAttempt(input: {
  template: AssessmentTemplateDocument;
  student: UserDocument;
  classGroup?: ClassGroupDocument;
  items: AssessmentItemDocument[];
  answers: AnswerSpec[];
  startedDaysAgo: number;
  release?: { markedBy: UserDocument };
}) {
  const { template, student, items, answers } = input;
  const startedAt = daysAgo(input.startedDaysAgo);
  const questions = items.map((item) => ({
    item: item._id,
    skill: item.skill,
    complexity: item.complexity,
    maxPoints: item.points,
  }));

  const responses = items.flatMap((item, i) => {
    const answer = answers[i];
    if (answer === null || answer === undefined) return [];
    const answeredAt = new Date(startedAt.getTime() + (i + 1) * 4 * 60_000);
    if (typeof answer === "string") {
      const correct = answer === item.answer?.correctOption;
      return [{ item: item._id, answer, answeredAt, ...(input.release && { correct, pointsAwarded: correct ? item.points : 0 }) }];
    }
    return [{ item: item._id, answer: answer.text, answeredAt, ...(input.release && { pointsAwarded: answer.points }) }];
  });

  const base = {
    template: template._id,
    student: student._id,
    classGroup: input.classGroup?._id,
    seed: `${student.walletId}:${template._id}:1`,
    questions,
    responses,
    startedAt,
    endsAt: new Date(startedAt.getTime() + template.durationMinutes * 60_000),
    lastSavedAt: new Date(startedAt.getTime() + 10 * 60_000),
  };

  if (!input.release) return { ...base, status: "in_progress" as const };

  const totals = new Map<SkillKey, { score: number; maxScore: number }>();
  for (const question of questions) {
    const awarded = responses.find((r) => r.item.equals(question.item))?.pointsAwarded ?? 0;
    const total = totals.get(question.skill) ?? { score: 0, maxScore: 0 };
    total.score += awarded;
    total.maxScore += question.maxPoints;
    totals.set(question.skill, total);
  }
  const skillScores = [...totals].map(([skill, t]) => ({
    skill,
    ...t,
    percent: Math.round((t.score / t.maxScore) * 100),
  }));
  const score = skillScores.reduce((sum, s) => sum + s.score, 0);
  const maxScore = skillScores.reduce((sum, s) => sum + s.maxScore, 0);
  const percent = Math.round((score / maxScore) * 100);
  const submittedAt = new Date(startedAt.getTime() + 38 * 60_000);

  return {
    ...base,
    status: "released" as const,
    submittedAt,
    markedAt: new Date(submittedAt.getTime() + 86_400_000),
    markedBy: input.release.markedBy._id,
    releasedAt: new Date(submittedAt.getTime() + 2 * 86_400_000),
    result: { score, maxScore, percent, grade: gradeFor(percent), skillScores, coinsAwarded: score * COINS_PER_POINT },
  };
}

// ---------------------------------------------------------------------------

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to load demo data when NODE_ENV=production.");
  }
  const reset = process.argv.includes("--reset");
  const mongoose = await connectToDatabase({ autoIndex: false });
  console.log(`Connected to database "${mongoose.connection.name}".`);

  if (reset) {
    for (const model of allModels) {
      await model.collection.drop().catch((error: { codeName?: string }) => {
        if (error.codeName !== "NamespaceNotFound") throw error;
      });
    }
    console.log("Dropped all app collections (--reset).");
  } else if ((await UserModel.estimatedDocumentCount()) > 0) {
    console.error("The database already has data. Re-run with `npm run db:seed -- --reset` to wipe it and reseed.");
    process.exitCode = 1;
    return;
  }

  // Build indexes first so unique constraints apply to the seed data too.
  for (const model of allModels) await model.syncIndexes();

  // Users ---------------------------------------------------------------------
  const password = process.env.SEED_PASSWORD ?? "ChangeMe-Demo-2026!";
  const passwordHash = await hashPassword(password); // one hash shared by all demo accounts
  const [admin, chen, jordan, maya, noah, sofia] = await UserModel.create([
    { email: "admin@northview.example", role: "admin", firstName: "Alex", lastName: "Morgan", school: SCHOOL, passwordHash },
    { email: "s.chen@northview.example", role: "teacher", firstName: "Sarah", lastName: "Chen", school: SCHOOL, passwordHash },
    { email: "jordan.smith@student.northview.example", role: "student", firstName: "Jordan", lastName: "Smith", school: SCHOOL, yearLevel: 11, walletId: "DSW-2026-JS-1147", passwordHash },
    { email: "maya.patel@student.northview.example", role: "student", firstName: "Maya", lastName: "Patel", school: SCHOOL, yearLevel: 11, walletId: "DSW-2026-MP-1148", passwordHash },
    { email: "noah.kim@student.northview.example", role: "student", firstName: "Noah", lastName: "Kim", school: SCHOOL, yearLevel: 11, walletId: "DSW-2026-NK-1149", passwordHash },
    { email: "sofia.rodriguez@student.northview.example", role: "student", firstName: "Sofia", lastName: "Rodriguez", school: SCHOOL, yearLevel: 11, walletId: "DSW-2026-SR-1150", passwordHash },
  ]);
  const students = [jordan, maya, noah, sofia];

  // Classes -------------------------------------------------------------------
  const [science, maths] = await ClassGroupModel.create([
    { name: "Year 11 Science", subject: "Science", school: SCHOOL, yearLevel: 11, academicYear: 2026, term: 4, teachers: [chen._id], students: students.map((s) => s._id) },
    { name: "Year 11 Mathematics", subject: "Mathematics", school: SCHOOL, yearLevel: 11, academicYear: 2026, term: 4, teachers: [chen._id], students: students.map((s) => s._id) },
  ]);

  // Item bank -----------------------------------------------------------------
  const items = new Map<string, AssessmentItemDocument>();
  for (const spec of ITEM_SPECS) {
    const isAi = Boolean(spec.ai);
    const item = await AssessmentItemModel.create({
      subject: spec.subject,
      skill: spec.skill,
      complexity: spec.complexity,
      type: spec.options ? "multiple_choice" : "short_response",
      prompt: spec.prompt,
      options: (spec.options ?? []).map(([key, text]) => ({ key, text })),
      answer: { correctOption: spec.correct, modelAnswer: spec.modelAnswer, rubric: spec.rubric },
      points: spec.complexity,
      source: isAi ? "ai" : "teacher",
      createdBy: chen._id,
      status: spec.ai?.status ?? "approved",
      ...(spec.ai && {
        generation: {
          model: "placeholder-model",
          promptVersion: "item-gen-v0.1",
          generatedAt: daysAgo(2),
          validation: { passed: true, notes: spec.ai.notes, validatedAt: daysAgo(2, 5) },
        },
      }),
      ...(spec.ai?.status !== "pending_review" && {
        review: { reviewedBy: chen._id, reviewedAt: daysAgo(spec.ai ? 1 : 30), comments: spec.ai?.reviewComment },
      }),
    });
    items.set(spec.key, item);
  }
  const pick = (...keys: string[]) => keys.map((key) => items.get(key)!);

  // Assessment templates (as in the "Assessment Templates" screen) ------------
  const [criticalThinking, collaborative, , researchMethods, , growthMindset] = await AssessmentTemplateModel.create([
    {
      title: "Critical Thinking in Data Interpretation", subject: "Science", yearLevels: { min: 10, max: 12 },
      description: "Interpret experimental data and evaluate scientific claims.",
      curriculumLink: { code: "AC9S10I06", description: "Analyse patterns and trends in data, identifying anomalies and inconsistencies" },
      skills: ["critical-thinking", "analytical-thinking", "research"], difficulty: "advanced", status: "published", durationMinutes: 45,
      blueprint: [
        { skill: "analytical-thinking", complexity: 3, count: 1 },
        { skill: "analytical-thinking", complexity: 4, count: 1 },
        { skill: "critical-thinking", complexity: 3, count: 1 },
        { skill: "critical-thinking", complexity: 4, count: 1 },
        { skill: "research", complexity: 3, count: 1 },
      ],
      assignments: [{ classGroup: science._id, assignedAt: daysAgo(21), dueAt: daysAgo(10) }],
      createdBy: chen._id,
    },
    {
      title: "Collaborative Problem Solving", subject: "Mathematics", yearLevels: { min: 9, max: 11 },
      skills: ["collaboration", "decision-making", "analytical-thinking"], difficulty: "intermediate", status: "published", durationMinutes: 30,
      blueprint: [
        { skill: "collaboration", complexity: 2, count: 1 },
        { skill: "decision-making", complexity: 3, count: 1 },
        { skill: "analytical-thinking", complexity: 2, count: 1 },
      ],
      assignments: [{ classGroup: maths._id, assignedAt: daysAgo(14), dueAt: daysAgo(7) }],
      createdBy: chen._id,
    },
    {
      title: "Creative Writing & Adaptability Challenge", subject: "English", yearLevels: { min: 8, max: 10 },
      skills: ["creativity", "adaptability", "research"], difficulty: "intermediate", status: "draft", durationMinutes: 60,
      blueprint: [
        { skill: "creativity", complexity: 3, count: 1 },
        { skill: "adaptability", complexity: 2, count: 1 },
      ],
      createdBy: chen._id,
    },
    {
      title: "Research Methods & Source Evaluation", subject: "Humanities", yearLevels: { min: 11, max: 12 },
      skills: ["research", "critical-thinking", "analytical-thinking"], difficulty: "advanced", status: "published", durationMinutes: 40,
      blueprint: [
        { skill: "research", complexity: 3, count: 1 },
        { skill: "research", complexity: 4, count: 1 },
        { skill: "critical-thinking", complexity: 4, count: 1 },
      ],
      createdBy: chen._id,
    },
    {
      title: "Decision-Making Under Uncertainty", subject: "Economics", yearLevels: { min: 10, max: 12 },
      skills: ["decision-making", "analytical-thinking", "critical-thinking"], difficulty: "intermediate", status: "published", durationMinutes: 35,
      blueprint: [
        { skill: "decision-making", complexity: 3, count: 1 },
        { skill: "analytical-thinking", complexity: 3, count: 1 },
        { skill: "critical-thinking", complexity: 3, count: 1 },
      ],
      createdBy: chen._id,
    },
    {
      title: "Growth Mindset & Resilience Survey", subject: "Personal Development", yearLevels: { min: 7, max: 12 },
      skills: ["adaptability", "collaboration"], difficulty: "foundation", status: "published", durationMinutes: 20,
      blueprint: [
        { skill: "adaptability", complexity: 1, count: 1 },
        { skill: "collaboration", complexity: 1, count: 1 },
      ],
      createdBy: chen._id,
    },
  ]);

  // Attempts and results ------------------------------------------------------
  const scienceItems = pick("sci-analytical-3", "sci-analytical-4", "sci-critical-3", "sci-critical-4", "sci-research-3");
  const released = { markedBy: chen };
  const attempts = await AssessmentAttemptModel.create([
    // Year 11 Science, Critical Thinking in Data Interpretation (whole class)
    buildAttempt({ template: criticalThinking, student: jordan, classGroup: science, items: scienceItems, answers: ["B", "C", "B", "A", "B"], startedDaysAgo: 12, release: released }),
    buildAttempt({ template: criticalThinking, student: maya, classGroup: science, items: scienceItems, answers: ["B", "C", "B", "C", "D"], startedDaysAgo: 12, release: released }),
    buildAttempt({ template: criticalThinking, student: noah, classGroup: science, items: scienceItems, answers: ["B", "A", "D", "C", "B"], startedDaysAgo: 11, release: released }),
    buildAttempt({ template: criticalThinking, student: sofia, classGroup: science, items: scienceItems, answers: ["A", "C", "B", "C", "B"], startedDaysAgo: 11, release: released }),
    // Jordan's other subjects
    buildAttempt({
      template: collaborative, student: jordan, classGroup: maths,
      items: pick("math-collab-2", "math-decision-3", "math-analytical-2"),
      answers: [{ text: "We split into reader, calculator and checker roles, then swapped sheets to re-check every step.", points: 2 }, "B", "C"],
      startedDaysAgo: 8, release: released,
    }),
    buildAttempt({
      template: growthMindset, student: jordan, items: pick("pd-adapt-1", "pd-collab-1"),
      answers: [
        { text: "When our excursion was cancelled I helped re-plan the project around online sources.", points: 1 },
        { text: "I paired with a classmate who was behind and we worked through the practice problems together.", points: 1 },
      ],
      startedDaysAgo: 5, release: released,
    }),
    // In progress (autosaved), to resume later
    buildAttempt({ template: researchMethods, student: jordan, items: pick("hum-research-3", "hum-research-4", "hum-critical-4"), answers: ["B", null, null], startedDaysAgo: 0 }),
  ]);
  const inProgress = attempts.at(-1)!;
  inProgress.responses.push({ item: inProgress.questions[1].item, flagged: true });
  await inProgress.save();

  // Skill coins (pending sync to Hyperledger Fabric) --------------------------
  const walletEvents = attempts
    .filter((attempt) => attempt.status === "released" && attempt.result)
    .flatMap((attempt) =>
      attempt.result!.skillScores
        .filter((s) => s.score > 0)
        .map((s) => ({
          student: attempt.student,
          skill: s.skill,
          type: "issued" as const,
          coins: s.score * COINS_PER_POINT,
          reason: "Assessment result released",
          sourceAttempt: attempt._id,
          createdAt: attempt.releasedAt ?? undefined,
        })),
    );
  await WalletEventModel.create(walletEvents);

  // Achievements ---------------------------------------------------------------
  const [jordanScience, mayaScience, noahScience, sofiaScience, jordanMaths] = attempts;
  await AchievementModel.create([
    ...[jordanScience, mayaScience, noahScience, sofiaScience].map((attempt) => ({
      student: attempt.student, code: "first-assessment", title: "First Assessment",
      description: "Completed a first Digital Skills assessment", evidence: attempt._id, awardedAt: attempt.releasedAt ?? undefined,
    })),
    { student: jordan._id, code: "team-player", title: "Team Player", skill: "collaboration", description: "Full marks for collaboration in a group task", evidence: jordanMaths._id, awardedAt: jordanMaths.releasedAt ?? undefined },
    { student: maya._id, code: "critical-mind", title: "Critical Mind", skill: "critical-thinking", description: "Full marks in Critical Thinking", evidence: mayaScience._id, awardedAt: mayaScience.releasedAt ?? undefined },
  ]);

  // Student-controlled sharing and consent -------------------------------------
  const { token } = await createVerificationLink({
    student: jordan._id,
    disclosedSkills: ["analytical-thinking", "research", "collaboration"],
    includeAchievements: true,
    label: "Work experience application, Acme Labs",
    expiresAt: daysFromNow(30),
  });
  await ConsentModel.create([
    { student: jordan._id, grantee: chen._id, scope: "individual_results", grantedAt: daysAgo(20) },
    { student: maya._id, grantee: chen._id, scope: "individual_results", grantedAt: daysAgo(20) },
    { student: sofia._id, grantee: chen._id, scope: "individual_results", grantedAt: daysAgo(20), active: false, revokedAt: daysAgo(3) },
  ]);
  await TeacherNoteModel.create([
    { student: jordan._id, author: chen._id, body: "Shows strong verbal reasoning but struggles with evaluating conflicting evidence. Recommend additional data literacy resources.", createdAt: daysAgo(9) },
    { student: jordan._id, author: chen._id, body: "Excellent collaboration in group tasks. Leadership potential observed. Encourage more independent research practice.", createdAt: daysAgo(4) },
  ]);

  // Audit log (hash-chained) ---------------------------------------------------
  await appendAuditLog({ actorRole: "system", action: "db.seed", details: { reset } });
  await appendAuditLog({ actor: chen._id, actorRole: "teacher", action: "auth.login", ip: "10.0.0.12", userAgent: "Mozilla/5.0 (seed)" });
  await appendAuditLog({
    actor: chen._id, actorRole: "teacher", action: "results.view", ip: "10.0.0.12",
    resource: { type: "AssessmentAttempt", id: jordanScience._id.toString() }, subjectStudent: jordan._id,
  });
  await appendAuditLog({
    actor: chen._id, actorRole: "teacher", action: "results.view", ip: "10.0.0.12", status: "denied",
    resource: { type: "AssessmentAttempt", id: noahScience._id.toString() }, subjectStudent: noah._id,
    details: { reason: "no active consent" },
  });
  await appendAuditLog({ actor: admin._id, actorRole: "admin", action: "user.create", resource: { type: "User", id: chen._id.toString() } });
  for (const attempt of attempts.filter((a) => a.status === "released")) {
    await appendAuditLog({
      actorRole: "system", action: "wallet.coins.issue", subjectStudent: attempt.student,
      resource: { type: "AssessmentAttempt", id: attempt._id.toString() }, details: { coins: attempt.result!.coinsAwarded },
    });
  }
  await appendAuditLog({ actor: jordan._id, actorRole: "student", action: "verification.link.create", subjectStudent: jordan._id });
  const chain = await verifyAuditChain();

  // Summary ---------------------------------------------------------------------
  const balances = await walletBalances(jordan._id);
  console.log("\nSeeded:");
  for (const model of allModels) {
    console.log(`  ${model.collection.collectionName.padEnd(20)} ${await model.countDocuments()}`);
  }
  console.log(`\nAudit chain: ${chain.ok ? `OK (${chain.checked} entries)` : `BROKEN: ${JSON.stringify(chain)}`}`);
  console.log(`Jordan's wallet: ${balances.map((b) => `${b.skill} ${b.coins}`).join(", ")}`);
  console.log(`\nDemo logins (password for all: ${password}):`);
  for (const user of [admin, chen, ...students]) console.log(`  ${user.role.padEnd(8)} ${user.email}`);
  console.log(`\nJordan's public verification token (shown once, only its hash is stored):\n  ${token}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnectFromDatabase);
