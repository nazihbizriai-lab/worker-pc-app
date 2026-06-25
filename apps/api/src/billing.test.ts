import { describe, expect, it } from "vitest";
import { isEntitledStatus } from "./billing.js";

// Pre-launch strict mode: entitlement comes only from a live subscription or a
// live trial. past_due (Stripe's payment-retry window) is NOT entitled unless the
// WORKCREW_BILLING_GRACE_PAST_DUE grace flag is intentionally enabled, which it is
// not in the test environment.
describe("subscription entitlement policy", () => {
  it("entitles active and trialing", () => {
    expect(isEntitledStatus("active")).toBe(true);
    expect(isEntitledStatus("trialing")).toBe(true);
  });

  it("does not entitle past_due in strict mode (default)", () => {
    expect(isEntitledStatus("past_due")).toBe(false);
  });

  it("never entitles ended, paused, or incomplete statuses", () => {
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "anything-else"]) {
      expect(isEntitledStatus(status)).toBe(false);
    }
  });
});
