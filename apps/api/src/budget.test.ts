import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { actualCostMicrodollars, chooseModel, maximumReservationMicrodollars } from "./anthropic.js";
import { getBudgetUsage, getBudgetWindow, reserveBudget, settleBudget } from "./budget.js";
import { client, initializeDatabase, type SubscriptionRow } from "./db.js";

describe("monthly allowance windows", () => {
  it("creates monthly windows for annual subscriptions", () => {
    const anchor = Date.UTC(2026, 0, 15, 10, 0, 0);
    const window = getBudgetWindow(anchor, Date.UTC(2026, 5, 20));
    expect(new Date(window.startMs).toISOString()).toBe("2026-06-15T10:00:00.000Z");
    expect(new Date(window.endMs).toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  it("clamps anchors at the end of shorter months", () => {
    const anchor = Date.UTC(2026, 0, 31);
    const window = getBudgetWindow(anchor, Date.UTC(2026, 1, 28));
    expect(window.startMs).toBe(Date.UTC(2026, 1, 28));
  });
});

describe("model accounting", () => {
  it("reserves more than actual usage for bounded output", () => {
    const payload = { messages: [{ role: "user", content: "Open example.com" }] };
    const reserved = maximumReservationMicrodollars("sonnet", payload, 1_200);
    const actual = actualCostMicrodollars("sonnet", { input_tokens: 100, output_tokens: 50 });
    expect(reserved).toBeGreaterThan(actual);
  });

  it("routes simple requests to Haiku and harder ones up the ladder", () => {
    expect(chooseModel("auto", "Open example.com")).toBe("haiku");
    expect(chooseModel("auto", "Plan a complex workflow across multiple applications")).toBe("sonnet");
    expect(chooseModel("auto", "Use deep reasoning to root cause this difficult failure")).toBe("opus");
  });
});

// The ledger is the hard cost cap. These tests exercise the real reservation
// SQL against an isolated user and billing window so they never collide with
// other rows. Money is in integer microdollars throughout.
describe("budget ledger invariants", () => {
  beforeAll(async () => {
    await initializeDatabase(client);
  });

  function makeSubscription(): SubscriptionRow {
    return {
      userId: randomUUID(),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      plan: "pro",
      interval: "month",
      status: "active",
      active: true,
      // A unique anchor per test keeps each test inside its own billing window.
      budgetAnchorMs: Date.now(),
      currentPeriodEndMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
      autoReloadEnabled: false,
      autoReloadPack: "small",
      monthlyTopupLimitMicro: 0,
      stripePaymentMethodId: null
    };
  }

  it("never lets concurrent reservations collectively exceed the cycle cap", async () => {
    const subscription = makeSubscription();
    const nowMs = subscription.budgetAnchorMs;
    const window = getBudgetWindow(subscription.budgetAnchorMs, nowMs);
    // Pro budget is 6_750_000 microdollars. Each reservation asks for one tenth
    // of the cap, so at most 10 of the 25 attempts may succeed.
    const cap = 6_750_000;
    const perReservation = cap / 10;
    const attempts = 25;

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        reserveBudget({
          subscription,
          runId: randomUUID(),
          model: "haiku",
          amountMicrodollars: perReservation,
          nowMs
        })
      )
    );

    const accepted = results.filter((result) => result.status === "fulfilled").length;
    const rejected = results.filter((result) => result.status === "rejected").length;
    expect(accepted).toBeLessThanOrEqual(10);
    expect(accepted + rejected).toBe(attempts);

    // The decisive invariant: total reserved must never exceed the cycle cap.
    const usage = await getBudgetUsage(subscription.userId, window);
    expect(usage.reserved).toBeLessThanOrEqual(cap);
    expect(usage.reserved).toBe(accepted * perReservation);
  });

  it("rejects a reservation that would push reserved plus settled past the cap", async () => {
    const subscription = makeSubscription();
    const nowMs = subscription.budgetAnchorMs;
    const cap = 6_750_000;

    // First reservation consumes almost the whole cap and settles at its full
    // reserved amount.
    const first = await reserveBudget({
      subscription,
      runId: randomUUID(),
      model: "haiku",
      amountMicrodollars: cap - 100,
      nowMs
    });
    await settleBudget(first.reservationId, cap - 100);

    // A second reservation for more than the 100 microdollars of headroom must
    // be rejected as budget exhausted.
    await expect(
      reserveBudget({
        subscription,
        runId: randomUUID(),
        model: "haiku",
        amountMicrodollars: 1_000,
        nowMs
      })
    ).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
  });

  it("releases the difference when actual usage settles below the reservation", async () => {
    const subscription = makeSubscription();
    const nowMs = subscription.budgetAnchorMs;
    const window = getBudgetWindow(subscription.budgetAnchorMs, nowMs);
    const reserved = 1_000_000;
    const actual = 250_000;

    const reservation = await reserveBudget({
      subscription,
      runId: randomUUID(),
      model: "sonnet",
      amountMicrodollars: reserved,
      nowMs
    });

    // While reserved, the full amount counts against the budget.
    const afterReserve = await getBudgetUsage(subscription.userId, window);
    expect(afterReserve.reserved).toBe(reserved);
    expect(afterReserve.used).toBe(0);

    await settleBudget(reservation.reservationId, actual);

    // After settlement only the actual cost is charged and the difference is
    // released back into the available budget.
    const afterSettle = await getBudgetUsage(subscription.userId, window);
    expect(afterSettle.reserved).toBe(0);
    expect(afterSettle.used).toBe(actual);
  });
});
