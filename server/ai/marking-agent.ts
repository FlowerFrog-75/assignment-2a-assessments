// AI help for marking: suggested marks for written answers, and a draft of
// the feedback comment. Suggestions only: the teacher accepts or changes them,
// and nothing is saved until they click Save or Release.
//
// Privacy: the AI sees the question, marking guide, model answer and the
// answer text. Never the student's name, email or wallet ID. Schools turn this
// on in School Settings (aiMarkingEnabled).
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { offlineFeedback, offlineMarks } from "./offline";
import { AiError, aiModel, checkStop, claudeClient, FALLBACK } from "./provider";
import type { ClaudeClient } from "./item-agent";

export type MarkInput = { itemId: string; skill: string; prompt: string; modelAnswer: string; rubric: string; maxPoints: number; answer: string };
export type MarkSuggestion = { itemId: string; points: number; rationale: string; confidence: "high" | "medium" | "low" };

const MarksSchema = z.object({
  suggestions: z.array(
    z.object({
      itemId: z.string(),
      points: z.number(),
      rationale: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
});

const MARKING_SYSTEM = `You help a secondary school teacher mark short written answers. For each answer, apply the marking guide exactly as written and suggest a mark.
- Award marks only for what the student actually wrote. Spelling and grammar don't cost marks unless the guide says so.
- Half marks are allowed only if the guide allows partial credit.
- rationale: one or two sentences naming which parts of the guide were met or missed, in plain words a teacher can check quickly.
- confidence: low if the answer is ambiguous, off-topic, or the guide doesn't clearly cover it.
The teacher makes the final decision.`;

const FEEDBACK_SYSTEM = `You draft a short feedback comment from a teacher to a secondary school student about one assessment. Write 2-4 sentences in second person ("You..."), warm and specific: name one genuine strength, one thing to work on, and one concrete next step. No marks or percentages, no names, no emojis. The teacher will edit it before the student sees it.`;

/** Rounds to the nearest half mark within 0..max. */
const clampMark = (points: number, max: number) => Math.min(max, Math.max(0, Math.round(points * 2) / 2));

export async function suggestMarks(questions: MarkInput[], mode: "claude" | "offline", client?: ClaudeClient): Promise<MarkSuggestion[]> {
  const written = questions.filter((q) => q.answer.trim());
  const blank: MarkSuggestion[] = questions.filter((q) => !q.answer.trim()).map((q) => ({ itemId: q.itemId, points: 0, rationale: "No answer was written.", confidence: "high" }));
  if (mode === "offline") return [...offlineMarks(written), ...blank];
  if (written.length === 0) return blank;

  const content = written
    .map((q) => `Answer id: ${q.itemId}\nSkill: ${q.skill}. Maximum marks: ${q.maxPoints}\nQuestion: ${q.prompt}\nMarking guide: ${q.rubric || "(none given: judge against the model answer)"}\nModel answer: ${q.modelAnswer || "(none)"}\nStudent's answer: """${q.answer}"""`)
    .join("\n\n---\n\n");
  const response = await (client ?? claudeClient()).beta.messages.parse({
    model: aiModel(),
    max_tokens: 16000,
    ...FALLBACK,
    system: MARKING_SYSTEM,
    messages: [{ role: "user", content }],
    output_config: { format: betaZodOutputFormat(MarksSchema), effort: "medium" },
  });
  checkStop(response);
  if (!response.parsed_output) throw new AiError("The AI's suggestions couldn't be read. Try again.");
  const byId = new Map(response.parsed_output.suggestions.map((s) => [s.itemId, s]));
  return [
    ...written.map((q) => {
      const s = byId.get(q.itemId);
      return s ? { ...s, points: clampMark(s.points, q.maxPoints) } : { itemId: q.itemId, points: 0, rationale: "No suggestion returned for this answer.", confidence: "low" as const };
    }),
    ...blank,
  ];
}

export type FeedbackInput = {
  assessment: string;
  percent: number;
  skills: { skill: string; percent: number }[];
  questions: { skill: string; prompt: string; answer: string; points: number | null; maxPoints: number }[];
};

export async function draftFeedback(input: FeedbackInput, mode: "claude" | "offline", client?: ClaudeClient): Promise<string> {
  if (mode === "offline") return offlineFeedback(input.skills, input.percent);
  const content = [
    `Assessment: ${input.assessment}. Overall: ${input.percent}%.`,
    `Skill results: ${input.skills.map((s) => `${s.skill} ${s.percent}%`).join(", ")}.`,
    "Questions and answers:",
    ...input.questions.map((q, i) => `${i + 1}. [${q.skill}] ${q.prompt}\n   Answer: ${q.answer || "(blank)"}\n   Mark: ${q.points ?? "?"}/${q.maxPoints}`),
  ].join("\n");
  const response = await (client ?? claudeClient()).beta.messages.parse({
    model: aiModel(),
    max_tokens: 4000,
    ...FALLBACK,
    system: FEEDBACK_SYSTEM,
    messages: [{ role: "user", content }],
    output_config: { format: betaZodOutputFormat(z.object({ feedback: z.string() })), effort: "low" },
  });
  checkStop(response);
  if (!response.parsed_output) throw new AiError("The AI's draft couldn't be read. Try again.");
  return response.parsed_output.feedback.trim().slice(0, 4_000);
}
