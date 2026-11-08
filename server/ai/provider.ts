// Which AI the app uses, and the shared Claude client.
//
//   ANTHROPIC_API_KEY set     -> "claude": real Claude (AI_MODEL, or DEFAULT_MODEL below)
//   AI_OFFLINE_DEMO=on, or    -> "offline": a scripted stand-in that runs the same
//   sample school with no key    workflow, clearly labelled "Offline demo (not real AI)"
//   otherwise                 -> "off": AI features say "AI isn't set up"
import Anthropic from "@anthropic-ai/sdk";
import { sampleModeEnabled } from "../auth/session";

export type AiMode = "claude" | "offline" | "off";

export const OFFLINE_MODEL = "offline-demo";

export function aiMode(): AiMode {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "claude";
  if (process.env.AI_OFFLINE_DEMO === "on") return "offline";
  if (process.env.AI_OFFLINE_DEMO !== "off" && sampleModeEnabled()) return "offline";
  return "off";
}

/** The Claude model used when AI_MODEL isn't set. */
export const DEFAULT_MODEL = "claude-opus-5-5";

export function aiModel(): string {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}

export function aiStatus() {
  const mode = aiMode();
  return {
    mode,
    model: mode === "claude" ? aiModel() : mode === "offline" ? OFFLINE_MODEL : null,
    label: mode === "claude" ? `Claude (${aiModel()})` : mode === "offline" ? "Offline demo (not real AI)" : "Not set up",
  };
}

let client: Anthropic | null = null;
export function claudeClient(): Anthropic {
  client ??= new Anthropic({ maxRetries: 3, timeout: 5 * 60_000 });
  return client;
}

/**
 * Sent on every Claude request: if the model declines for policy reasons, the
 * API retries on its default fallback model inside the same call.
 */
export const FALLBACK = { betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[], fallbacks: "default" as const };

/** Errors the teacher sees, in plain words. */
export class AiError extends Error {}

export function describeAiError(error: unknown): string {
  if (error instanceof AiError) return error.message;
  if (error instanceof Anthropic.AuthenticationError) return "The AI key was rejected. Check ANTHROPIC_API_KEY on the server.";
  if (error instanceof Anthropic.RateLimitError) return "The AI service is busy (rate limit). Try again in a minute.";
  if (error instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Check the server's internet connection.";
  if (error instanceof Anthropic.APIError) return `The AI service returned an error (${error.status}). Try again later.`;
  return error instanceof Error ? error.message : "The AI request failed";
}

/** Checks why a response stopped before its content is used. */
export function checkStop(response: { stop_reason: string | null; stop_details?: { category?: string | null } | null }) {
  if (response.stop_reason === "refusal") {
    throw new AiError("The AI declined this request. Try rewording the topic.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiError("The AI's answer was cut off. Try asking for fewer questions at once.");
  }
}

export type Usage = { inputTokens: number; outputTokens: number };
export function addUsage(total: Usage, usage?: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null) {
  if (!usage) return;
  total.inputTokens += (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  total.outputTokens += usage.output_tokens ?? 0;
}

/** Word overlap (Jaccard) between two texts, 0 to 1. Used to spot near-duplicate questions. */
export function similarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common += 1;
  return common / (x.size + y.size - common);
}
