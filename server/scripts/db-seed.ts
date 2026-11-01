// Loads demo data that mirrors the UI prototype (the eight students of Ms
// Chen's Class 11B, the assessment templates, the access logs...) so the
// screens show realistic live data.
//
//   pnpm db:seed            # only runs on an empty database
//   pnpm db:seed --reset # DELETES all app collections first
//
// Refuses to run when NODE_ENV=production.
import "./load-env";
import { createHash } from "node:crypto";
import type { Types } from "mongoose";
import type { SkillKey } from "../db/constants";
import { connectToDatabase, disconnectFromDatabase } from "../db/connect";
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
  type UserDocument,
} from "../db/models";
import { hashPassword } from "../security/password";

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
  // English: Creative Writing Challenge (teacher-written, approved)
  {
    key: "eng-creative-2", subject: "English", skill: "creativity", complexity: 2,
    prompt: "Write a six-word story about starting at a new school, then explain in one sentence why you chose those words.",
    rubric: "1 mark: a complete six-word story. 1 mark: a clear reason for the word choices.",
  },
  {
    key: "eng-adapt-sr-2", subject: "English", skill: "adaptability", complexity: 2,
    prompt: "Your group's presentation topic is changed the day before it is due. Describe how you would adapt your plan.",
    rubric: "1 mark: a realistic re-plan. 1 mark: shows a positive, flexible attitude.",
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
// People (as in the prototype's Class Results screen)
// ---------------------------------------------------------------------------
type StudentSpec = { first: string; last: string; walletId: string; ability: number };

const STUDENTS: StudentSpec[] = [
  { first: "Jordan", last: "Smith", walletId: "DSW-2024-JS-1147", ability: 0.78 },
  { first: "Maya", last: "Patel", walletId: "DSW-2024-MP-1149", ability: 0.93 },
  { first: "Ethan", last: "Clarke", walletId: "DSW-2024-EC-1150", ability: 0.62 },
  { first: "Sofia", last: "Rodriguez", walletId: "DSW-2024-SR-1148", ability: 0.85 },
  { first: "Liam", last: "Nguyen", walletId: "DSW-2024-LN-1151", ability: 0.72 },
  { first: "Ava", last: "Thompson", walletId: "DSW-2024-AT-1153", ability: 0.55 },
  { first: "Noah", last: "Kim", walletId: "DSW-2024-NK-1152", ability: 0.88 },
  { first: "Isabella", last: "Brown", walletId: "DSW-2024-IB-1154", ability: 0.76 },
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

/** A repeatable number in [0, 1) for a given key, so every reseed gives the same results. */
function chance(key: string): number {
  return createHash("sha256").update(key).digest().readUInt32BE(0) / 2 ** 32;
}

/** Answers for a student, based on their ability: right more often the stronger they are. */
function answersFor(student: StudentSpec, keys: string[], items: Map<string, AssessmentItemDocument>): AnswerSpec[] {
  return keys.map((key) => {
    const spec = ITEM_SPECS.find((item) => item.key === key)!;
    const item = items.get(key)!;
    const right = chance(`${student.walletId}:${key}`) < student.ability;
    if (spec.options) {
      const wrong = spec.options.find(([optionKey]) => optionKey !== spec.correct)![0];
      return right ? spec.correct! : wrong;
    }
    return { text: "(written response)", points: right ? item.points : Math.floor(item.points / 2) };
  });
}

function buildAttempt(input: {
  template: AssessmentTemplateDocument;
  student: UserDocument;
  classGroupId?: Types.ObjectId;
  items: AssessmentItemDocument[];
  answers: AnswerSpec[];
  startedDaysAgo: number;
  release?: { markedBy: UserDocument };
}) {
  const { template, student, items, answers } = input;
  const startedAt = daysAgo(input.startedDaysAgo, Math.round(chance(`${student.walletId}:start`) * 300));
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
    classGroup: input.classGroupId,
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
  const minutesTaken = Math.round(template.durationMinutes * (0.55 + 0.4 * chance(`${student.walletId}:${template._id}`)));
  const submittedAt = new Date(startedAt.getTime() + minutesTaken * 60_000);

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
    console.error("The database already has data. Re-run with `pnpm db:seed --reset` to wipe it and reseed.");
    process.exitCode = 1;
    return;
  }

  // Build indexes first so unique constraints apply to the seed data too.
  for (const model of allModels) await model.syncIndexes();

  // Users ---------------------------------------------------------------------
  const password = process.env.SEED_PASSWORD ?? "ChangeMe-Demo-2026!";
  const passwordHash = await hashPassword(password); // one hash shared by all demo accounts
  const [admin, chen] = await UserModel.create([
    { email: "admin@northview.example", role: "admin", firstName: "Alex", lastName: "Morgan", school: SCHOOL, passwordHash },
    { email: "s.chen@northview.example", role: "teacher", firstName: "Sarah", lastName: "Chen", school: SCHOOL, passwordHash },
  ]);
  const students = await UserModel.create(
    STUDENTS.map((s) => ({
      email: `${s.first}.${s.last}@student.northview.example`.toLowerCase(),
      role: "student" as const,
      firstName: s.first,
      lastName: s.last,
      school: SCHOOL,
      yearLevel: 11,
      walletId: s.walletId,
      passwordHash,
    })),
  );
  const byWallet = new Map(students.map((student) => [student.walletId!, student]));
  const spec = (student: UserDocument) => STUDENTS.find((s) => s.walletId === student.walletId)!;
  const jordan = byWallet.get("DSW-2024-JS-1147")!;
  const maya = byWallet.get("DSW-2024-MP-1149")!;
  const ethan = byWallet.get("DSW-2024-EC-1150")!;
  const sofia = byWallet.get("DSW-2024-SR-1148")!;
  const liam = byWallet.get("DSW-2024-LN-1151")!;
  const ava = byWallet.get("DSW-2024-AT-1153")!;
  const noah = byWallet.get("DSW-2024-NK-1152")!;
  const isabella = byWallet.get("DSW-2024-IB-1154")!;

  // Class -----------------------------------------------------------------------
  const classB = await ClassGroupModel.create({
    name: "Class 11B",
    subject: "All subjects",
    school: SCHOOL,
    yearLevel: 11,
    academicYear: 2026,
    term: 4,
    teachers: [chen._id],
    students: students.map((s) => s._id),
  });

  // Item bank -----------------------------------------------------------------
  const items = new Map<string, AssessmentItemDocument>();
  for (const itemSpec of ITEM_SPECS) {
    const isAi = Boolean(itemSpec.ai);
    const item = await AssessmentItemModel.create({
      subject: itemSpec.subject,
      skill: itemSpec.skill,
      complexity: itemSpec.complexity,
      type: itemSpec.options ? "multiple_choice" : "short_response",
      prompt: itemSpec.prompt,
      options: (itemSpec.options ?? []).map(([key, text]) => ({ key, text })),
      answer: { correctOption: itemSpec.correct, modelAnswer: itemSpec.modelAnswer, rubric: itemSpec.rubric },
      points: itemSpec.complexity,
      source: isAi ? "ai" : "teacher",
      createdBy: chen._id,
      status: itemSpec.ai?.status ?? "approved",
      ...(itemSpec.ai && {
        generation: {
          model: "placeholder-model",
          promptVersion: "item-gen-v0.1",
          generatedAt: daysAgo(2),
          validation: { passed: true, notes: itemSpec.ai.notes, validatedAt: daysAgo(2, 5) },
        },
      }),
      ...(itemSpec.ai?.status !== "pending_review" && {
        review: { reviewedBy: chen._id, reviewedAt: daysAgo(itemSpec.ai ? 1 : 30), comments: itemSpec.ai?.reviewComment },
      }),
    });
    items.set(itemSpec.key, item);
  }
  const pick = (...keys: string[]) => keys.map((key) => items.get(key)!);

  // Assessment templates (as in the "Assessment Templates" screen) ------------
  const assign = (dueInDays: number, assignedDaysAgo = 21) => [
    { classGroup: classB._id, assignedAt: daysAgo(assignedDaysAgo), dueAt: daysFromNow(dueInDays) },
  ];
  const [criticalThinking, collaborative, , researchMethods, decisionMaking, growthMindset, creativeWriting] =
    await AssessmentTemplateModel.create([
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
        assignments: assign(-10), createdBy: chen._id,
      },
      {
        title: "Collaborative Problem Solving", subject: "Mathematics", yearLevels: { min: 9, max: 11 },
        skills: ["collaboration", "decision-making", "analytical-thinking"], difficulty: "intermediate", status: "published", durationMinutes: 30,
        blueprint: [
          { skill: "collaboration", complexity: 2, count: 1 },
          { skill: "decision-making", complexity: 3, count: 1 },
          { skill: "analytical-thinking", complexity: 2, count: 1 },
        ],
        assignments: assign(-7), createdBy: chen._id,
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
        assignments: assign(5, 4), createdBy: chen._id,
      },
      {
        title: "Decision-Making Under Uncertainty", subject: "Economics", yearLevels: { min: 10, max: 12 },
        skills: ["decision-making", "analytical-thinking", "critical-thinking"], difficulty: "intermediate", status: "published", durationMinutes: 35,
        blueprint: [
          { skill: "decision-making", complexity: 3, count: 1 },
          { skill: "analytical-thinking", complexity: 3, count: 1 },
          { skill: "critical-thinking", complexity: 3, count: 1 },
        ],
        assignments: assign(1, 3), createdBy: chen._id,
      },
      {
        title: "Growth Mindset & Resilience Survey", subject: "Personal Development", yearLevels: { min: 7, max: 12 },
        skills: ["adaptability", "collaboration"], difficulty: "foundation", status: "published", durationMinutes: 20,
        blueprint: [
          { skill: "adaptability", complexity: 1, count: 1 },
          { skill: "collaboration", complexity: 1, count: 1 },
        ],
        assignments: assign(-5), createdBy: chen._id,
      },
      {
        title: "Creative Writing Challenge", subject: "English", yearLevels: { min: 9, max: 11 },
        description: "Short creative pieces that show voice, originality and flexibility.",
        skills: ["creativity", "adaptability"], difficulty: "intermediate", status: "published", durationMinutes: 30,
        blueprint: [
          { skill: "creativity", complexity: 2, count: 1 },
          { skill: "adaptability", complexity: 2, count: 1 },
        ],
        assignments: assign(-12, 28), createdBy: chen._id,
      },
    ]);

  // Attempts and results ------------------------------------------------------
  const papers = {
    creative: { template: creativeWriting, keys: ["eng-creative-2", "eng-adapt-sr-2"], daysAgo: 20 },
    science: { template: criticalThinking, keys: ["sci-analytical-3", "sci-analytical-4", "sci-critical-3", "sci-critical-4", "sci-research-3"], daysAgo: 12 },
    maths: { template: collaborative, keys: ["math-collab-2", "math-decision-3", "math-analytical-2"], daysAgo: 9 },
    growth: { template: growthMindset, keys: ["pd-adapt-1", "pd-collab-1"], daysAgo: 5 },
    economics: { template: decisionMaking, keys: ["eco-decision-3", "eco-analytical-3", "eco-critical-3"], daysAgo: 2 },
    humanities: { template: researchMethods, keys: ["hum-research-3", "hum-research-4", "hum-critical-4"], daysAgo: 3 },
  };
  type Paper = (typeof papers)[keyof typeof papers];
  const released = { markedBy: chen };
  const sit = (student: UserDocument, paper: Paper, answers?: AnswerSpec[]) =>
    buildAttempt({
      template: paper.template,
      student,
      classGroupId: classB._id,
      items: pick(...paper.keys),
      answers: answers ?? answersFor(spec(student), paper.keys, items),
      startedDaysAgo: paper.daysAgo,
      release: released,
    });

  const attemptInputs = [
    // Every student sat the creative writing, science, maths and growth mindset papers...
    ...students.flatMap((student) => [
      sit(student, papers.creative),
      // Jordan's science answers are fixed so the demo story stays the same.
      student === jordan ? sit(student, papers.science, ["B", "C", "B", "A", "B"]) : sit(student, papers.science),
      ...(student === ava ? [] : [sit(student, papers.maths)]), // Ava ran out of time on maths
      sit(student, papers.growth),
    ]),
    // ...the strongest students have already done economics and humanities...
    ...[maya, noah, sofia, isabella].map((student) => sit(student, papers.economics)),
    sit(maya, papers.humanities),
    // ...and Jordan is part-way through humanities (autosaved, can resume).
    buildAttempt({
      template: researchMethods, student: jordan, classGroupId: classB._id,
      items: pick(...papers.humanities.keys), answers: ["B", null, null], startedDaysAgo: 0,
    }),
  ];
  const attempts = await AssessmentAttemptModel.create(attemptInputs);
  const inProgress = attempts.at(-1)!;
  inProgress.responses.push({ item: inProgress.questions[1].item, flagged: true });
  await inProgress.save();
  const releasedAttempts = attempts.filter((a) => a.status === "released" && a.result);

  // Skill coins (pending sync to Hyperledger Fabric) --------------------------
  await WalletEventModel.create(
    releasedAttempts.flatMap((attempt) =>
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
    ),
  );

  // Achievements, awarded by simple rules on each student's results -------------
  const achievements = [];
  for (const student of students) {
    const mine = releasedAttempts
      .filter((a) => a.student.equals(student._id))
      .sort((a, b) => a.releasedAt!.getTime() - b.releasedAt!.getTime());
    if (mine.length === 0) continue;
    const skillPercent = (skill: SkillKey) => {
      const scores = mine.flatMap((a) => a.result!.skillScores.filter((s) => s.skill === skill));
      const max = scores.reduce((sum, s) => sum + s.maxScore, 0);
      return max > 0 ? (scores.reduce((sum, s) => sum + s.score, 0) / max) * 100 : 0;
    };
    const lastWith = (skill: SkillKey) => [...mine].reverse().find((a) => a.result!.skillScores.some((s) => s.skill === skill))!;
    achievements.push({ student: student._id, code: "first-assessment", title: "First Assessment", description: "Completed a first Digital Skills assessment", evidence: mine[0]._id, awardedAt: mine[0].releasedAt ?? undefined });
    if (skillPercent("research") >= 70) {
      const evidence = lastWith("research");
      achievements.push({ student: student._id, code: "research-pioneer", title: "Research Pioneer", skill: "research" as const, description: "Scored 70%+ across research tasks", evidence: evidence._id, awardedAt: evidence.releasedAt ?? undefined });
    }
    if (skillPercent("critical-thinking") >= 80) {
      const evidence = lastWith("critical-thinking");
      achievements.push({ student: student._id, code: "critical-mind", title: "Critical Mind", skill: "critical-thinking" as const, description: "Reached Proficient or higher in Critical Thinking", evidence: evidence._id, awardedAt: evidence.releasedAt ?? undefined });
    }
    if (skillPercent("collaboration") >= 80) {
      const evidence = lastWith("collaboration");
      achievements.push({ student: student._id, code: "team-player", title: "Team Player", skill: "collaboration" as const, description: "Scored 80%+ in collaboration tasks", evidence: evidence._id, awardedAt: evidence.releasedAt ?? undefined });
    }
  }
  await AchievementModel.create(achievements);

  // Student-controlled sharing and consent -------------------------------------
  const jordanLink = await createVerificationLink({
    student: jordan._id,
    disclosedSkills: ["analytical-thinking", "research", "critical-thinking", "collaboration"],
    includeAchievements: true,
    label: "Work experience application, Acme Labs",
    expiresAt: daysFromNow(30),
  });
  const sofiaLink = await createVerificationLink({
    student: sofia._id,
    disclosedSkills: ["critical-thinking", "creativity", "adaptability"],
    includeAchievements: true,
    label: "University early-entry application",
    expiresAt: daysFromNow(60),
  });
  await ConsentModel.create([
    ...[jordan, maya, noah, isabella, liam].map((student) => ({
      student: student._id, grantee: chen._id, scope: "individual_results" as const, grantedAt: daysAgo(25),
    })),
    { student: sofia._id, grantee: chen._id, scope: "individual_results", grantedAt: daysAgo(25), active: false, revokedAt: daysAgo(3) },
  ]);
  await TeacherNoteModel.create([
    { student: jordan._id, author: chen._id, body: "Shows strong verbal reasoning but struggles with evaluating conflicting evidence. Recommend additional data literacy resources.", createdAt: daysAgo(9) },
    { student: jordan._id, author: chen._id, body: "Excellent collaboration in group tasks. Leadership potential observed. Encourage more independent research practice.", createdAt: daysAgo(4) },
    { student: ethan._id, author: chen._id, body: "Did not finish the economics paper. Check in about workload this term.", createdAt: daysAgo(1) },
  ]);

  // Audit log (hash-chained), mirroring the Access Logs screen -----------------
  const ip = (student: UserDocument) => `192.168.1.${20 + STUDENTS.findIndex((s) => s.walletId === student.walletId) * 7}`;
  await appendAuditLog({ actorRole: "system", action: "db.seed", details: { reset } });
  await appendAuditLog({ actor: admin._id, actorRole: "admin", action: "template.publish", ip: "10.0.0.1", resource: { type: "AssessmentTemplate", id: growthMindset._id.toString() }, details: { label: growthMindset.title } });
  for (const student of students) {
    const coins = releasedAttempts.filter((a) => a.student.equals(student._id)).reduce((sum, a) => sum + a.result!.coinsAwarded, 0);
    await appendAuditLog({ actorRole: "system", action: "wallet.coins.issue", subjectStudent: student._id, details: { coins, label: `${student.walletId}: ${coins} skill coins` } });
  }
  await appendAuditLog({ actor: liam._id, actorRole: "student", action: "auth.login", ip: ip(liam), status: "failure", details: { label: "Auth system", reason: "wrong password" } });
  await appendAuditLog({ actor: liam._id, actorRole: "student", action: "auth.login", ip: ip(liam), details: { label: "Auth system" } });
  await appendAuditLog({ actor: chen._id, actorRole: "teacher", action: "auth.login", ip: "10.0.0.15", details: { label: "Auth system" } });
  await appendAuditLog({ actor: jordan._id, actorRole: "student", action: "assessment.start", ip: ip(jordan), subjectStudent: jordan._id, resource: { type: "AssessmentAttempt", id: inProgress._id.toString() }, details: { label: researchMethods.title } });
  await appendAuditLog({ actor: maya._id, actorRole: "student", action: "assessment.submit", ip: ip(maya), subjectStudent: maya._id, details: { label: researchMethods.title } });
  await appendAuditLog({ actor: ethan._id, actorRole: "student", action: "assessment.abandon", ip: ip(ethan), subjectStudent: ethan._id, status: "warning", details: { label: decisionMaking.title } });
  await appendAuditLog({ actor: ava._id, actorRole: "student", action: "assessment.timeout", ip: ip(ava), subjectStudent: ava._id, status: "warning", details: { label: collaborative.title } });
  await appendAuditLog({ actor: chen._id, actorRole: "teacher", action: "results.view", ip: "10.0.0.15", resource: { type: "ClassGroup", id: classB._id.toString() }, details: { label: "Class 11B: Term 4 results" } });
  await appendAuditLog({ actor: chen._id, actorRole: "teacher", action: "results.view", ip: "10.0.0.15", subjectStudent: ethan._id, status: "denied", details: { label: "Ethan Clarke: individual results", reason: "no consent" } });
  await appendAuditLog({ actor: sofia._id, actorRole: "student", action: "wallet.share", ip: ip(sofia), subjectStudent: sofia._id, details: { label: `${sofia.walletId} public link` } });
  await appendAuditLog({ actorRole: "anonymous", action: "verification.view", ip: "203.44.12.88", subjectStudent: sofia._id, details: { label: sofia.walletId } });
  await appendAuditLog({ actor: noah._id, actorRole: "student", action: "wallet.view", ip: ip(noah), subjectStudent: noah._id, details: { label: noah.walletId } });
  await appendAuditLog({ actor: jordan._id, actorRole: "student", action: "wallet.share", ip: ip(jordan), subjectStudent: jordan._id, details: { label: `${jordan.walletId} public link` } });
  await appendAuditLog({ actor: chen._id, actorRole: "teacher", action: "record.export", ip: "10.0.0.15", subjectStudent: jordan._id, details: { label: "Jordan Smith: full report" } });
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
  console.log("\nPublic verification codes (shown once; only their hashes are stored):");
  console.log(`  Jordan Smith    ${jordanLink.code}`);
  console.log(`  Sofia Rodriguez ${sofiaLink.code}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnectFromDatabase);
