import { describe, expect, it } from "vitest";
import { isRoutineDue, nextDueRoutine, type Routine } from "./storage";

function routine(overrides: Partial<Routine>): Routine {
  return {
    id: "r1",
    name: "Test",
    task: "do the thing",
    cadence: "hourly",
    hour: 9,
    minute: 0,
    weekday: 1,
    enabled: true,
    lastRunAtMs: null,
    createdAtMs: 0,
    ...overrides
  };
}

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

describe("isRoutineDue", () => {
  it("never runs a manual or disabled routine automatically", () => {
    expect(isRoutineDue(routine({ cadence: "manual" }), NOW)).toBe(false);
    expect(isRoutineDue(routine({ cadence: "hourly", enabled: false }), NOW)).toBe(false);
  });

  it("runs hourly when never run or when an hour has passed", () => {
    expect(isRoutineDue(routine({ cadence: "hourly", lastRunAtMs: null }), NOW)).toBe(true);
    expect(isRoutineDue(routine({ cadence: "hourly", lastRunAtMs: NOW - 2 * HOUR }), NOW)).toBe(true);
  });

  it("does not run hourly again within the hour", () => {
    expect(isRoutineDue(routine({ cadence: "hourly", lastRunAtMs: NOW - 10 * 60 * 1000 }), NOW)).toBe(false);
  });

  it("does not run a timed routine before its time today", () => {
    // The current local hour at minute 59 is still ahead of NOW (whose minute is
    // well under 59 in every timezone offset), so it is not due yet.
    const r = routine({ cadence: "daily", hour: new Date(NOW).getHours(), minute: 59, lastRunAtMs: null });
    expect(isRoutineDue(r, NOW)).toBe(false);
  });

  it("runs a timed routine once its time has passed and not since", () => {
    // The current local hour at minute 0 is at or before NOW, so it is due.
    const r = routine({ cadence: "daily", hour: new Date(NOW).getHours(), minute: 0, lastRunAtMs: null });
    expect(isRoutineDue(r, NOW)).toBe(true);
  });
});

describe("nextDueRoutine", () => {
  it("returns the first due routine or null", () => {
    const notDue = routine({ id: "a", cadence: "manual" });
    const due = routine({ id: "b", cadence: "hourly", lastRunAtMs: null });
    expect(nextDueRoutine([notDue, due], NOW)?.id).toBe("b");
    expect(nextDueRoutine([notDue], NOW)).toBeNull();
  });
});
