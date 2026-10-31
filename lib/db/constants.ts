// Shared constants for the data model. This file has no database imports, so
// Client Components may import it directly (e.g. for skill labels).

/** The seven core skills the Digital Skills Wallet tracks. */
export const SKILLS = [
  { key: "analytical-thinking", label: "Analytical Thinking" },
  { key: "research", label: "Research" },
  { key: "critical-thinking", label: "Critical Thinking" },
  { key: "creativity", label: "Creativity" },
  { key: "decision-making", label: "Decision-Making" },
  { key: "collaboration", label: "Collaboration" },
  { key: "adaptability", label: "Adaptability" },
] as const;

export type SkillKey = (typeof SKILLS)[number]["key"];
export const SKILL_KEYS = SKILLS.map((skill) => skill.key) as readonly SkillKey[];

export function skillLabel(key: SkillKey): string {
  return SKILLS.find((skill) => skill.key === key)?.label ?? key;
}

export const USER_ROLES = ["student", "teacher", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["active", "deactivated"] as const;

export const DIFFICULTY_LEVELS = ["foundation", "intermediate", "advanced"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const TEMPLATE_STATUSES = ["draft", "published", "archived"] as const;

export const ITEM_TYPES = ["multiple_choice", "short_response"] as const;
export const ITEM_SOURCES = ["teacher", "ai"] as const;
/**
 * Item bank lifecycle. AI-drafted items go draft -> pending_review once the
 * AI has validated them. Only an educator can move an item to approved, and
 * only approved items may be used in an assessment.
 */
export const ITEM_STATUSES = ["draft", "pending_review", "approved", "rejected", "retired"] as const;

/** Item complexity, 1 (recall) to 5 (complex reasoning). Scoring weights by it. */
export const MIN_COMPLEXITY = 1;
export const MAX_COMPLEXITY = 5;

export const ATTEMPT_STATUSES = ["in_progress", "submitted", "marked", "released"] as const;

export const WALLET_EVENT_TYPES = ["issued", "revoked"] as const;
/** Sync state of a wallet event with the Hyperledger Fabric ledger. */
export const LEDGER_STATUSES = ["pending", "committed", "failed"] as const;

export const CONSENT_SCOPES = ["individual_results", "wallet"] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export const AUDIT_ACTOR_ROLES = [...USER_ROLES, "anonymous", "system"] as const;
export const AUDIT_STATUSES = ["success", "denied", "failure"] as const;
