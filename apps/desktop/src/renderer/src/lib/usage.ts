import type { SubscriptionState } from "@workcrew/contracts";

// How the user stands against their token allowance for the current period.
// "low" once 80% or more of the allowance is committed (used plus reserved),
// "empty" once nothing is left. Everything is in internal usage units, which are
// shown to the user as plain tokens (never as a money figure or a provider name).
export type UsageLevel = "ok" | "low" | "empty";

export type UsageStatus = {
  used: number;
  budget: number;
  remaining: number;
  percent: number;
  level: UsageLevel;
};

// The threshold at which we start warning the user they are running low.
export const LOW_USAGE_PERCENT = 80;

export function usageStatus(entitlement: SubscriptionState, liveUsed?: number): UsageStatus {
  const budget = Math.max(0, entitlement.budgetMicrodollars);
  const used = Math.max(0, Math.min(liveUsed ?? entitlement.usedMicrodollars, budget));
  const reserved = Math.max(0, entitlement.reservedMicrodollars);
  const committed = Math.min(budget, used + reserved);
  const remaining = Math.max(0, budget - committed);
  const percent = budget > 0 ? Math.min(100, (committed / budget) * 100) : 0;
  const level: UsageLevel = budget > 0 && remaining <= 0 ? "empty" : percent >= LOW_USAGE_PERCENT ? "low" : "ok";
  return { used, budget, remaining, percent, level };
}
