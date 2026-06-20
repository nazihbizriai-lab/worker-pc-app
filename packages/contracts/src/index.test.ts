import { describe, expect, it } from "vitest";
import {
  PLAN_CATALOG,
  attachmentRefSchema,
  browserActionSchema,
  chatSendSchema,
  createCheckoutSchema,
  createRoutineSchema
} from "./index.js";

describe("plan catalog", () => {
  it("gives two months free on annual plans", () => {
    expect(PLAN_CATALOG.pro.yearlyPriceUsd).toBe(PLAN_CATALOG.pro.monthlyPriceUsd * 10);
    expect(PLAN_CATALOG.ultra.yearlyPriceUsd).toBe(PLAN_CATALOG.ultra.monthlyPriceUsd * 10);
  });

  it("keeps API budgets at 25 percent of monthly list price", () => {
    expect(PLAN_CATALOG.pro.monthlyApiBudgetMicrodollars).toBe(6_750_000);
    expect(PLAN_CATALOG.ultra.monthlyApiBudgetMicrodollars).toBe(50_000_000);
  });
});

describe("security schemas", () => {
  it("rejects unsupported browser commands", () => {
    expect(() => browserActionSchema.parse({ kind: "browser", command: "run-code" })).toThrow();
  });

  it("rejects extra checkout fields", () => {
    expect(() => createCheckoutSchema.parse({ plan: "pro", interval: "year", admin: true })).toThrow();
  });
});

describe("chat schemas", () => {
  it("applies chat send defaults", () => {
    const parsed = chatSendSchema.parse({ text: "hello" });
    expect(parsed.model).toBe("sonnet");
    expect(parsed.effort).toBe("high");
    expect(parsed.thinking).toBe(false);
    expect(parsed.attachments).toEqual([]);
  });

  it("rejects unknown chat send fields", () => {
    expect(() => chatSendSchema.parse({ text: "hi", surprise: true })).toThrow();
  });

  it("defaults attachment redaction to off", () => {
    const parsed = attachmentRefSchema.parse({
      attachmentId: "att_1",
      filename: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      kind: "pdf"
    });
    expect(parsed.redact).toBe(false);
  });

  it("rejects attachment kinds outside the allowlist", () => {
    expect(() =>
      attachmentRefSchema.parse({
        attachmentId: "att_1",
        filename: "movie.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1024,
        kind: "video"
      })
    ).toThrow();
  });
});

describe("routine schemas", () => {
  it("applies routine creation defaults", () => {
    const parsed = createRoutineSchema.parse({
      name: "Tidy downloads",
      instructions: "Move old files into folders",
      scheduleKind: "daily",
      scope: {}
    });
    expect(parsed.permissionMode).toBe("plan_first");
    expect(parsed.model).toBe("auto");
    expect(parsed.scope.network).toBe("allowlist");
    expect(parsed.scope.apps).toEqual([]);
  });

  it("rejects instructions that are too short", () => {
    expect(() =>
      createRoutineSchema.parse({
        name: "Tidy",
        instructions: "no",
        scheduleKind: "manual",
        scope: {}
      })
    ).toThrow();
  });

  it("rejects unknown routine fields", () => {
    expect(() =>
      createRoutineSchema.parse({
        name: "Tidy",
        instructions: "Move old files into folders",
        scheduleKind: "manual",
        scope: {},
        sneaky: true
      })
    ).toThrow();
  });
});
