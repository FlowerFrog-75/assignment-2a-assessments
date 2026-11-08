// The agentic question generator.
//
//   1. Author agent (tool-use loop): reads approved examples from the item bank,
//      checks each draft against existing questions, and submits questions one
//      at a time. Bad submissions are rejected with a reason and retried.
//   2. Validator agent: a separate call that sees only the finished questions
//      (never the author's reasoning) and checks the answer key, that there is
//      one best answer, skill alignment, complexity and age-appropriateness.
//   3. Revision: questions that fail go back to the author with the
//      validator's issues, once, and are checked again.
//   4. Questions that pass are queued for a teacher ("pending review"). Ones
//      that still fail are kept as drafts with the validator's notes. Nothing
//      is used in an assessment until a teacher approves it.
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Types } from "mongoose";
import { z } from "zod";
import { SKILLS, SKILL_KEYS, skillLabel, type SkillKey } from "../db/constants";
import { AssessmentItemModel } from "../db/models";
import { flawedCopy, offlineVerdict, OFFLINE_POOL, type PoolItem } from "./offline";
import { addUsage, AiError, aiModel, checkStop, claudeClient, FALLBACK, OFFLINE_MODEL, similarity, type Usage } from "./provider";

export const PROMPT_VERSION = "item-agent-v1";
const MAX_TURNS = 16;

export type ItemType = "multiple_choice" | "short_response";
export type Target = { skill: SkillKey; complexity: number; count: number };
export type ItemRequest = {
  subject: string;
  targets: Target[];
  types: ItemType | "mixed";
  yearLevel?: number | null;
  topic?: string | null;
};
export type Log = (actor: "author" | "validator" | "system", text: string) => Promise<void> | void;
export type AgentResult = { queued: Types.ObjectId[]; drafts: Types.ObjectId[]; usage: Usage; model: string };

type Draft = {
  skill: SkillKey;
  complexity: number;
  type: ItemType;
  prompt: string;
  options: string[];
  correctOption: string; // "A", "B"... ("" for short response)
  modelAnswer: string;
  rubric: string;
  points: number;
};

type Verdict = {
  passed: boolean;
  answerKeyCorrect: boolean;
  singleBestAnswer: boolean;
  skillAlignment: "strong" | "partial" | "weak";
  complexityEstimate: number;
  ageAppropriate: boolean;
  issues: string[];
  suggestedFix: string;
};

const COMPLEXITY_GUIDE = `Complexity scale:
1 Recall: recognise a fact or a clearly correct option.
2 Apply: use an idea in a familiar, straightforward situation.
3 Analyse: compare, explain cause and effect, or spot a flaw in reasoning.
4 Evaluate: weigh evidence or options and justify a judgement.
5 Create: design or propose something new and justify it.`;

const SKILL_GUIDE = `Skills:
${SKILLS.map((s) => `- ${s.key} (${s.label})`).join("\n")}
Analytical thinking: breaking information down, interpreting data, cause and effect.
Research: finding, evaluating and using sources.
Critical thinking: judging claims, evidence, assumptions and bias.
Creativity: generating and improving original ideas.
Decision-making: weighing options, consequences and trade-offs.
Collaboration: working with others, communication and shared goals.
Adaptability: responding constructively to change and setbacks.`;

const AUTHOR_SYSTEM = `You write assessment questions for Australian secondary school students (Years 7-12) in a Digital Skills Wallet. Each question assesses one of seven skills through normal subject work.

${SKILL_GUIDE}

${COMPLEXITY_GUIDE}

Quality bar for every question:
- Clear, plain English suited to the year level; one idea per question; no trick wording.
- Multiple choice: 4 options, exactly one best answer, plausible distractors that reflect real misconceptions, similar option lengths, no "all of the above".
- Short response: worth 2-4 marks, with a model answer and a marking guide that says how each mark is earned.
- Inclusive, respectful, and free of sensitive or distressing content. No real people or brands.
- Genuinely tests the stated skill at the stated complexity, set in the stated subject or topic.

How to work:
1. Call search_item_bank for each skill and complexity you will write for, to match the school's style.
2. Draft a question, then call check_similarity on its text. If it is too similar to an existing question, write a different one.
3. Call submit_item once per question. If it is rejected, fix the problem and submit again.
4. Stop when every requested question has been submitted.`;

const VALIDATOR_SYSTEM = `You are an independent reviewer of school assessment questions for Australian secondary students. You did not write these questions. Check each one strictly, as an experienced teacher would before it reaches students.

${SKILL_GUIDE}

${COMPLEXITY_GUIDE}

For each question:
- Work out the correct answer yourself before looking at the key. answerKeyCorrect is false if the key is wrong or debatable.
- singleBestAnswer is false if more than one option could reasonably be defended, or if two options are the same.
- skillAlignment: does it really test the stated skill? strong, partial or weak.
- complexityEstimate: your own rating on the 1-5 scale.
- ageAppropriate: wording and content suit the year level and are free of sensitive content.
- For short-response questions, check that the marking guide matches the marks and that the model answer would earn full marks.
- passed is true only if the key is correct, there is a single best answer, alignment is strong or partial, it is age-appropriate, and your complexity estimate is within one of the stated level.
- issues: short, specific problems (empty if none). suggestedFix: one sentence (empty if passed).
Return one verdict per question, in order, with its index.`;

const VerdictsSchema = z.object({
  verdicts: z.array(
    z.object({
      index: z.number().int(),
      passed: z.boolean(),
      answerKeyCorrect: z.boolean(),
      singleBestAnswer: z.boolean(),
      skillAlignment: z.enum(["strong", "partial", "weak"]),
      complexityEstimate: z.number().int(),
      ageAppropriate: z.boolean(),
      issues: z.array(z.string()),
      suggestedFix: z.string(),
    }),
  ),
});

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_item_bank",
    description: "Returns up to 3 approved questions from the school's item bank for a skill and complexity, to show the house style. Use before writing.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        skill: { type: "string", enum: [...SKILL_KEYS] },
        complexity: { type: "integer", enum: [1, 2, 3, 4, 5] },
      },
      required: ["skill", "complexity"],
      additionalProperties: false,
    },
  },
  {
    name: "check_similarity",
    description: "Compares a draft question's text with every question already in the bank and returns the closest matches with a similarity score from 0 to 1. Above 0.6 means too similar.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_item",
    description: "Submits one finished question. For multiple choice give 4 options and the letter of the correct one, with modelAnswer and rubric as empty strings. For short response give an empty options list, an empty correctOption, a model answer and a marking guide.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        skill: { type: "string", enum: [...SKILL_KEYS] },
        complexity: { type: "integer", enum: [1, 2, 3, 4, 5] },
        type: { type: "string", enum: ["multiple_choice", "short_response"] },
        prompt: { type: "string" },
        options: { type: "array", items: { type: "string" } },
        correctOption: { type: "string" },
        modelAnswer: { type: "string" },
        rubric: { type: "string" },
        points: { type: "integer", enum: [1, 2, 3, 4] },
      },
      required: ["skill", "complexity", "type", "prompt", "options", "correctOption", "modelAnswer", "rubric", "points"],
      additionalProperties: false,
    },
  },
];

/** The parts of the Anthropic client the agent uses (so tests can pass a scripted fake). */
export type ClaudeClient = Pick<Anthropic, "beta">;

// ------------------------------------------------------------- helpers

function describeTargets(targets: Target[]) {
  return targets.filter((t) => t.count > 0).map((t) => `${t.count} × ${skillLabel(t.skill)} at complexity ${t.complexity}`).join(", ");
}

/** Spreads a requested number of questions over the chosen skills and complexities. */
export function planTargets(skills: SkillKey[], complexities: number[], count: number): Target[] {
  const combos = skills.flatMap((skill) => complexities.map((complexity) => ({ skill, complexity, count: 0 })));
  for (let i = 0; i < count; i++) combos[i % combos.length].count += 1;
  return combos.filter((c) => c.count > 0);
}

function checkDraft(input: unknown, request: ItemRequest, remaining: Target[], bank: string[]): { draft?: Draft; error?: string } {
  const d = input as Partial<Draft>;
  if (!d || typeof d.prompt !== "string" || !SKILL_KEYS.includes(d.skill as SkillKey)) return { error: "Malformed submission." };
  const target = remaining.find((t) => t.skill === d.skill && t.complexity === d.complexity && t.count > 0);
  if (!target) return { error: `Not needed: no ${d.skill} questions at complexity ${d.complexity} remain. Still needed: ${describeTargets(remaining) || "nothing"}.` };
  if (request.types !== "mixed" && d.type !== request.types) return { error: `Only ${request.types.replace("_", " ")} questions were requested.` };
  const prompt = d.prompt.trim();
  if (prompt.length < 25 || prompt.length > 1500) return { error: "The question should be between 25 and 1500 characters." };
  const options = (d.options ?? []).map((o) => String(o).trim()).filter(Boolean);
  if (d.type === "multiple_choice") {
    if (options.length < 3 || options.length > 6) return { error: "Multiple choice needs 3 to 6 options (4 is best)." };
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { error: "Two options are identical." };
    const index = "ABCDEF".indexOf(String(d.correctOption ?? "").trim().toUpperCase());
    if (index < 0 || index >= options.length) return { error: "correctOption must be the letter of one of the options (A, B, C...)." };
  } else {
    if (!d.modelAnswer?.trim() || !d.rubric?.trim()) return { error: "A short-response question needs a model answer and a marking guide." };
  }
  const closest = Math.max(0, ...bank.map((p) => similarity(p, prompt)));
  if (closest > 0.75) return { error: "This is almost the same as a question already in the bank. Write a different one." };
  return {
    draft: {
      skill: d.skill as SkillKey,
      complexity: Number(d.complexity),
      type: d.type as ItemType,
      prompt,
      options: d.type === "multiple_choice" ? options : [],
      correctOption: d.type === "multiple_choice" ? String(d.correctOption).trim().toUpperCase() : "",
      modelAnswer: d.modelAnswer?.trim() ?? "",
      rubric: d.rubric?.trim() ?? "",
      points: d.type === "multiple_choice" ? 1 : Math.min(4, Math.max(2, Number(d.points) || 3)),
    },
  };
}

function itemsForReview(drafts: Draft[], request: ItemRequest) {
  return drafts
    .map((d, index) => {
      const lines = [`Question ${index}: skill ${d.skill}, complexity ${d.complexity}, ${d.type.replace("_", " ")}, ${d.points} mark(s)`, d.prompt];
      if (d.type === "multiple_choice") {
        d.options.forEach((o, i) => lines.push(`  ${"ABCDEF"[i]}. ${o}`));
        lines.push(`  Key: ${d.correctOption}`);
      } else {
        lines.push(`  Model answer: ${d.modelAnswer}`, `  Marking guide: ${d.rubric}`);
      }
      return lines.join("\n");
    })
    .join("\n\n")
    .concat(`\n\nSubject: ${request.subject}. Year level: ${request.yearLevel ?? "7-12"}.`);
}

async function existingPrompts(subject: string) {
  const items = await AssessmentItemModel.find({ status: { $ne: "retired" } }, { prompt: 1, subject: 1 }).lean();
  return { all: items.map((i) => i.prompt), inSubject: items.filter((i) => i.subject === subject).map((i) => i.prompt) };
}

async function save(draft: Draft, verdict: Verdict, request: ItemRequest, requestedBy: Types.ObjectId, model: string) {
  const notes = verdict.passed
    ? `Passed independent review: answer key checked, one best answer, ${verdict.skillAlignment} fit with ${skillLabel(draft.skill)}, complexity about ${verdict.complexityEstimate}.`
    : `Did not pass review: ${verdict.issues.join(" ")}${verdict.suggestedFix ? ` Suggested fix: ${verdict.suggestedFix}` : ""}`;
  const item = await AssessmentItemModel.create({
    subject: request.subject,
    skill: draft.skill,
    complexity: draft.complexity,
    type: draft.type,
    prompt: draft.prompt,
    options: draft.options.map((text, i) => ({ key: "ABCDEF"[i], text })),
    answer: {
      correctOption: draft.type === "multiple_choice" ? draft.correctOption : undefined,
      modelAnswer: draft.modelAnswer || undefined,
      rubric: draft.rubric || undefined,
    },
    points: draft.points,
    source: "ai",
    status: verdict.passed ? "pending_review" : "draft",
    generation: {
      model,
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date(),
      validation: { passed: verdict.passed, notes: notes.slice(0, 4_900), validatedAt: new Date() },
    },
    createdBy: requestedBy,
  });
  return item._id;
}

// ------------------------------------------------------------- Claude

async function authorLoop(client: ClaudeClient, firstMessage: string, request: ItemRequest, remaining: Target[], bank: { all: string[]; inSubject: string[] }, log: Log, usage: Usage): Promise<Draft[]> {
  const drafts: Draft[] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: firstMessage }];
  const left = () => remaining.reduce((t, r) => t + r.count, 0);
  let nudges = 0;

  for (let turn = 0; turn < MAX_TURNS && left() > 0; turn++) {
    const response = await client.beta.messages.create({
      model: aiModel(),
      max_tokens: 16000,
      ...FALLBACK,
      system: [{ type: "text", text: AUTHOR_SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      tool_choice: { type: "auto" },
      output_config: { effort: "high" },
      messages,
    });
    addUsage(usage, response.usage);
    checkStop(response);
    messages.push({ role: "assistant", content: response.content });

    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (calls.length === 0) {
      if (nudges++ >= 2) break;
      messages.push({ role: "user", content: `Please continue. Still needed: ${describeTargets(remaining)}. Submit each with submit_item.` });
      continue;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const input = call.input as Record<string, unknown>;
      if (call.name === "search_item_bank") {
        const skill = input.skill as SkillKey;
        const complexity = Number(input.complexity);
        let examples = await AssessmentItemModel.find({ status: "approved", subject: request.subject, skill, complexity }).select("+answer").limit(3).lean();
        if (examples.length === 0) examples = await AssessmentItemModel.find({ status: "approved", skill }).select("+answer").limit(3).lean();
        await log("author", `Read ${examples.length} approved example${examples.length === 1 ? "" : "s"} from the bank (${skillLabel(skill)}, complexity ${complexity}).`);
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(
            examples.map((e) => ({
              type: e.type,
              complexity: e.complexity,
              prompt: e.prompt,
              options: e.options.map((o) => `${o.key}. ${o.text}`),
              key: e.answer?.correctOption ?? null,
              rubric: e.answer?.rubric ?? null,
            })),
          ),
        });
      } else if (call.name === "check_similarity") {
        const prompt = String(input.prompt ?? "");
        const top = bank.all
          .map((p) => ({ prompt: p.slice(0, 160), score: Math.round(similarity(p, prompt) * 100) / 100 }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        await log("author", `Checked a draft against ${bank.all.length} existing questions (closest match ${Math.round((top[0]?.score ?? 0) * 100)}%).`);
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify({ closest: top, tooSimilar: (top[0]?.score ?? 0) > 0.6 }) });
      } else if (call.name === "submit_item") {
        const { draft, error } = checkDraft(input, request, remaining, bank.all);
        if (!draft) {
          await log("author", `Draft rejected by the app's checks: ${error}`);
          results.push({ type: "tool_result", tool_use_id: call.id, content: error ?? "Rejected", is_error: true });
        } else {
          const target = remaining.find((t) => t.skill === draft.skill && t.complexity === draft.complexity)!;
          target.count -= 1;
          drafts.push(draft);
          bank.all.push(draft.prompt);
          await log("author", `Drafted question ${drafts.length}: ${skillLabel(draft.skill)}, complexity ${draft.complexity}, ${draft.type === "multiple_choice" ? "multiple choice" : "short response"}.`);
          results.push({ type: "tool_result", tool_use_id: call.id, content: `Accepted. Still needed: ${describeTargets(remaining) || "nothing, you're done"}.` });
        }
      } else {
        results.push({ type: "tool_result", tool_use_id: call.id, content: `Unknown tool ${call.name}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return drafts;
}

async function validate(client: ClaudeClient, drafts: Draft[], request: ItemRequest, log: Log, usage: Usage): Promise<Verdict[]> {
  await log("validator", `Independently reviewing ${drafts.length} question${drafts.length === 1 ? "" : "s"} (the reviewer doesn't see how they were written).`);
  const response = await client.beta.messages.parse({
    model: process.env.AI_VALIDATOR_MODEL || aiModel(),
    max_tokens: 16000,
    ...FALLBACK,
    system: VALIDATOR_SYSTEM,
    messages: [{ role: "user", content: itemsForReview(drafts, request) }],
    output_config: { format: betaZodOutputFormat(VerdictsSchema), effort: "high" },
  });
  addUsage(usage, response.usage);
  checkStop(response);
  const parsed = response.parsed_output;
  if (!parsed) throw new AiError("The reviewer's answer couldn't be read. Try again.");
  return drafts.map((_, index) => {
    const v = parsed.verdicts.find((x) => x.index === index);
    return v ?? { passed: false, answerKeyCorrect: false, singleBestAnswer: false, skillAlignment: "weak", complexityEstimate: 0, ageAppropriate: false, issues: ["The reviewer returned no verdict."], suggestedFix: "" };
  });
}

// ------------------------------------------------------------- offline

function poolToDraft(p: PoolItem): Draft {
  return {
    skill: p.skill,
    complexity: p.complexity,
    type: p.type,
    prompt: p.prompt,
    options: p.options ?? [],
    correctOption: p.type === "multiple_choice" ? "ABCDEF"[p.correct ?? 0] : "",
    modelAnswer: p.modelAnswer ?? "",
    rubric: p.rubric ?? "",
    points: p.points,
  };
}

async function offlineRun(request: ItemRequest, requestedBy: Types.ObjectId, log: Log): Promise<AgentResult> {
  const bank = await existingPrompts(request.subject);
  const used = new Set(bank.all);
  const picks: PoolItem[] = [];
  for (const target of request.targets) {
    const candidates = OFFLINE_POOL.filter((p) => p.skill === target.skill && p.complexity === target.complexity && !used.has(p.prompt) && (request.types === "mixed" || p.type === request.types));
    await log("author", `Read approved examples from the bank (${skillLabel(target.skill)}, complexity ${target.complexity}).`);
    if (candidates.length < target.count) {
      await log("system", `The offline demo has only ${candidates.length} new ${skillLabel(target.skill)} question(s) at complexity ${target.complexity}. Add an API key for unlimited generation.`);
    }
    picks.push(...candidates.slice(0, target.count));
  }
  // Draft: the first question is deliberately flawed so the validator has something to catch.
  const drafts = picks.map((p, i) => (i === 0 && p.type === "multiple_choice" ? flawedCopy(p) : p));
  for (const [i, d] of drafts.entries()) {
    await log("author", `Checked draft ${i + 1} against ${bank.all.length} existing questions, then drafted it (${skillLabel(d.skill)}, complexity ${d.complexity}).`);
  }
  if (drafts.length === 0) return { queued: [], drafts: [], usage: { inputTokens: 0, outputTokens: 0 }, model: OFFLINE_MODEL };

  await log("validator", `Independently reviewing ${drafts.length} question${drafts.length === 1 ? "" : "s"}.`);
  const queued: Types.ObjectId[] = [];
  const kept: Types.ObjectId[] = [];
  for (const [i, d] of drafts.entries()) {
    let verdict = offlineVerdict(d, bank.all);
    let final = d;
    if (!verdict.passed) {
      await log("validator", `Question ${i + 1} failed: ${verdict.issues.join(" ")}`);
      final = picks[i]; // the author's revision
      await log("author", `Revised question ${i + 1} to fix the reviewer's issues.`);
      verdict = offlineVerdict(final, bank.all);
      await log("validator", `Question ${i + 1} ${verdict.passed ? "now passes" : "still fails"} review.`);
    } else {
      await log("validator", `Question ${i + 1} passed: answer key checked, one best answer, fits ${skillLabel(d.skill)}.`);
    }
    const id = await save(poolToDraft(final), verdict, request, requestedBy, OFFLINE_MODEL);
    (verdict.passed ? queued : kept).push(id);
  }
  return { queued, drafts: kept, usage: { inputTokens: 0, outputTokens: 0 }, model: OFFLINE_MODEL };
}

// ------------------------------------------------------------- entry

export async function generateItems(opts: { request: ItemRequest; requestedBy: Types.ObjectId; log: Log; mode: "claude" | "offline"; client?: ClaudeClient }): Promise<AgentResult> {
  const { request, requestedBy, log } = opts;
  await log("system", `Asked for ${describeTargets(request.targets)} in ${request.subject}${request.topic ? ` (topic: ${request.topic})` : ""}.`);
  if (opts.mode === "offline") return offlineRun(request, requestedBy, log);

  const client = opts.client ?? claudeClient();
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  const bank = await existingPrompts(request.subject);
  const remaining = request.targets.map((t) => ({ ...t }));
  const brief = [
    `Write these questions for the subject "${request.subject}"${request.yearLevel ? `, Year ${request.yearLevel}` : ""}: ${describeTargets(remaining)}.`,
    request.types === "mixed" ? "Use multiple choice mostly; include a short-response question where complexity is 3 or higher if it suits." : `All questions must be ${request.types.replace("_", " ")}.`,
    request.topic ? `Set them in this topic or context: ${request.topic}` : "",
  ].filter(Boolean).join("\n");

  const drafts = await authorLoop(client, brief, request, remaining, bank, log, usage);
  if (drafts.length === 0) throw new AiError("The AI didn't produce any questions. Try again, or change the request.");

  const verdicts = await validate(client, drafts, request, log, usage);
  for (const [i, v] of verdicts.entries()) {
    await log("validator", v.passed ? `Question ${i + 1} passed review.` : `Question ${i + 1} failed: ${v.issues.join(" ")}`);
  }

  // One round of revisions for anything that failed.
  const failedIdx = verdicts.map((v, i) => (v.passed ? -1 : i)).filter((i) => i >= 0);
  const finals = [...drafts];
  if (failedIdx.length) {
    await log("author", `Revising ${failedIdx.length} question${failedIdx.length === 1 ? "" : "s"} using the reviewer's feedback.`);
    const reviseTargets: Target[] = [];
    for (const i of failedIdx) {
      const t = reviseTargets.find((r) => r.skill === drafts[i].skill && r.complexity === drafts[i].complexity);
      if (t) t.count += 1;
      else reviseTargets.push({ skill: drafts[i].skill, complexity: drafts[i].complexity, count: 1 });
    }
    const feedback = failedIdx
      .map((i) => `${itemsForReview([drafts[i]], request).split("\n\nSubject:")[0].replace("Question 0", `Question ${i + 1}`)}\nReviewer's issues: ${verdicts[i].issues.join(" ")} ${verdicts[i].suggestedFix}`)
      .join("\n\n");
    const bankWithoutFailed = { all: bank.all.filter((p) => !failedIdx.some((i) => drafts[i].prompt === p)), inSubject: bank.inSubject };
    const revised = await authorLoop(
      client,
      `These questions failed independent review. Write a corrected version of each that fixes every issue (same skill and complexity), and submit each with submit_item.\n\n${feedback}`,
      request,
      reviseTargets,
      bankWithoutFailed,
      log,
      usage,
    );
    if (revised.length) {
      const reVerdicts = await validate(client, revised, request, log, usage);
      // Match revisions back to the failed slots by skill and complexity.
      for (const [r, draft] of revised.entries()) {
        const slot = failedIdx.find((i) => finals[i] === drafts[i] && drafts[i].skill === draft.skill && drafts[i].complexity === draft.complexity);
        if (slot === undefined) continue;
        finals[slot] = draft;
        verdicts[slot] = reVerdicts[r];
        await log("validator", `Revised question ${slot + 1} ${reVerdicts[r].passed ? "now passes" : "still fails"} review.`);
      }
    }
  }

  const queued: Types.ObjectId[] = [];
  const kept: Types.ObjectId[] = [];
  for (const [i, draft] of finals.entries()) {
    const id = await save(draft, verdicts[i], request, requestedBy, aiModel());
    (verdicts[i].passed ? queued : kept).push(id);
  }
  return { queued, drafts: kept, usage, model: aiModel() };
}
