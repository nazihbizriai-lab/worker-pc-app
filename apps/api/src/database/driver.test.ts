import { describe, expect, it } from "vitest";
import { createDatabaseClient, toPostgresText } from "./driver.js";

describe("toPostgresText", () => {
  it("numbers placeholders left to right", () => {
    expect(toPostgresText("INSERT INTO t(a, b, c) VALUES (?, ?, ?)")).toBe(
      "INSERT INTO t(a, b, c) VALUES ($1, $2, $3)"
    );
  });

  it("leaves SQL without placeholders untouched", () => {
    expect(toPostgresText("SELECT * FROM t WHERE id = '5'")).toBe("SELECT * FROM t WHERE id = '5'");
  });

  it("handles a single placeholder", () => {
    expect(toPostgresText("SELECT * FROM t WHERE id = ?")).toBe("SELECT * FROM t WHERE id = $1");
  });
});

describe("createDatabaseClient", () => {
  it("uses the SQLite/libSQL driver in the test environment", () => {
    // The test suite never sets DATABASE_URL, so the local SQLite driver is used.
    expect(createDatabaseClient().dialect).toBe("sqlite");
  });
});
