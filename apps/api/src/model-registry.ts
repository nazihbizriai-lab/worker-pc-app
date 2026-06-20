import type { ModelTier } from "@workcrew/contracts";
import { config } from "./config.js";

export type ConcreteModelTier = Exclude<ModelTier, "auto">;

/**
 * MODEL_PRICES is the single source of truth for per token pricing in
 * microdollars. Input covers prompt tokens, output covers completion tokens.
 * anthropic.ts re-exports this so existing imports keep working.
 */
export const MODEL_PRICES = {
  haiku: { input: 1, output: 5 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 5, output: 25 }
} as const satisfies Record<ConcreteModelTier, { input: number; output: number }>;

/** Prompt and tool schema version. Persisted on run records lets failures be reproduced. */
export const PROMPT_VERSION = "2026-06-20" as const;

/** Resolve a concrete tier to the configured provider model id. */
export function modelId(tier: ConcreteModelTier): string {
  return config.models[tier];
}

/**
 * Patterns that signal explicit deep reasoning or genuinely hard, multistep,
 * or ambiguous work. These route to opus only when the requester opted in or
 * the language is unambiguous about difficulty.
 */
const DEEP_REASONING_PATTERN = /\b(deep reasoning|think (?:hard|deeply|step by step)|reason carefully|prove|derive|debug a tricky|root cause|architect|design a system|complex multi[ -]?step|ambiguous|difficult)\b/i;

/**
 * Patterns that signal normal planning, tool use, recovery, and multi
 * application coordination. These route to sonnet.
 */
const PLANNING_PATTERN = /\b(analy[sz]e|research|workflow|plan|multiple|across|coordinate|compare|summari[sz]e a (?:long|large)|recover|navigate|fill out)\b/i;

/**
 * Improved capability and cost aware router.
 *
 * When the caller pins a tier we honour it. Otherwise we route by capability
 * and cost intent following MVP_PLAN section 12:
 *   - haiku for short, simple, classification style next action selection,
 *   - sonnet for normal task planning, tool use, recovery, and communication,
 *   - opus only for explicit deep reasoning or clearly difficult multistep work.
 */
export function chooseModel(requested: ModelTier, task: string): ConcreteModelTier {
  if (requested !== "auto") return requested;
  const text = task ?? "";
  if (text.length > 4_000 || DEEP_REASONING_PATTERN.test(text)) return "opus";
  if (text.length > 600 || PLANNING_PATTERN.test(text)) return "sonnet";
  return "haiku";
}
