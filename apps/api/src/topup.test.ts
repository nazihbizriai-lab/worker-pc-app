import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { tokenPackGrant } from "@workcrew/contracts";
import {
  getBudgetUsage,
  getBudgetWindow,
  getTopupThisPeriod,
  grantTokenCredit,
  reserveBudget,
  settleBudget
} from "./budget.js";
import { client, getSubscription, initializeDatabase, setAutoReloadConfig, upsertSubscription } from "./db.js";

// Pro plan monthly allowance, in microdollars (see PLAN_CATALOG).
const PRO_CAP = 6_750_000;

// Persist an active Pro subscriber anchored at the given time, so getSubscription
// and the credit/auto-reload helpers (which read the DB) work against a real row.
async function makeUser(anchorMs: number): Promise<string> {
  const userId = randomUUID();
  await upsertSubscription({
    userId,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    plan: "pro",
    interval: "month",
    status: "active",
    active: true,
    budgetAnchorMs: anchorMs,
    currentPeriodEndMs: anchorMs + 30 * 24 * 60 * 60 * 1000
  });
  return userId;
}

describe("token top-up credits", () => {
  beforeAll(async () => {
    await initializeDatabase(client);
  });

  it("grants purchased tokens as a credit in the current window", async () => {
    const anchorMs = Date.now();
    const userId = await makeUser(anchorMs);
    const window = getBudgetWindow(anchorMs, anchorMs);

    await grantTokenCredit({
      userId,
      grantedMicrodollars: 5_000_000,
      chargedMicrodollars: 19_000_000,
      source: "token_topup",
      nowMs: anchorMs
    });

    // A credit lowers the window's used total, freeing that many tokens.
    const usage = await getBudgetUsage(userId, window);
    expect(usage.used).toBe(-5_000_000);
    const topup = await getTopupThisPeriod(userId, window);
    expect(topup.purchased).toBe(5_000_000);
    expect(topup.autoReloaded).toBe(0);
  });

  it("lets a top-up extend usage past the plan cap", async () => {
    const anchorMs = Date.now() + 1;
    const userId = await makeUser(anchorMs);
    const subscription = await getSubscription(userId);
    expect(subscription).not.toBeNull();
    const nowMs = anchorMs;

    // Consume the whole plan allowance.
    const first = await reserveBudget({ subscription: subscription!, runId: randomUUID(), model: "haiku", amountMicrodollars: PRO_CAP, nowMs });
    await settleBudget(first.reservationId, PRO_CAP);

    // Without extra tokens, a further reservation is rejected.
    await expect(
      reserveBudget({ subscription: subscription!, runId: randomUUID(), model: "haiku", amountMicrodollars: 1_000, nowMs })
    ).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });

    // After a top-up, the same reservation succeeds.
    await grantTokenCredit({ userId, grantedMicrodollars: 1_000_000, chargedMicrodollars: 0, source: "token_topup", nowMs });
    const retry = await reserveBudget({ subscription: subscription!, runId: randomUUID(), model: "haiku", amountMicrodollars: 1_000, nowMs });
    expect(retry.reservationId).toBeTruthy();
  });

  it("auto-reloads on exhaustion and stops at the period cap", async () => {
    const anchorMs = Date.now() + 2;
    const userId = await makeUser(anchorMs);
    const grant = tokenPackGrant("small"); // 5,000,000
    // Allow exactly one auto-reload pack this period.
    await setAutoReloadConfig(userId, { enabled: true, pack: "small", monthlyLimitMicro: grant });
    const subscription = await getSubscription(userId);
    const nowMs = anchorMs;

    // Use up the plan allowance.
    const first = await reserveBudget({ subscription: subscription!, runId: randomUUID(), model: "haiku", amountMicrodollars: PRO_CAP, nowMs });
    await settleBudget(first.reservationId, PRO_CAP);

    // The next reservation triggers auto-reload (no charge in simulated billing)
    // and then succeeds.
    const second = await reserveBudget({ subscription: subscription!, runId: randomUUID(), model: "haiku", amountMicrodollars: 1_000, nowMs });
    expect(second.reservationId).toBeTruthy();
    await settleBudget(second.reservationId, 1_000);

    const window = getBudgetWindow(anchorMs, nowMs);
    expect((await getTopupThisPeriod(userId, window)).autoReloaded).toBe(grant);

    // Drain the granted pack, then a further reservation fails because the
    // auto-reload cap (one pack) is already spent for this period.
    const third = await reserveBudget({ subscription: subscription!, runId: randomUUID(), model: "haiku", amountMicrodollars: grant - 1_000, nowMs });
    await settleBudget(third.reservationId, grant - 1_000);
    await expect(
      reserveBudget({ subscription: subscription!, runId: randomUUID(), model: "haiku", amountMicrodollars: 10_000, nowMs })
    ).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
  });

  it("does not auto-reload when it is turned off", async () => {
    const anchorMs = Date.now() + 3;
    const userId = await makeUser(anchorMs);
    await setAutoReloadConfig(userId, { enabled: false, pack: "small", monthlyLimitMicro: 5_000_000 });
    const subscription = await getSubscription(userId);
    const nowMs = anchorMs;

    const first = await reserveBudget({ subscription: subscription!, runId: randomUUID(), model: "haiku", amountMicrodollars: PRO_CAP, nowMs });
    await settleBudget(first.reservationId, PRO_CAP);
    await expect(
      reserveBudget({ subscription: subscription!, runId: randomUUID(), model: "haiku", amountMicrodollars: 1_000, nowMs })
    ).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
  });
});
