import { describe, expect, test } from "bun:test";
import { buildTursoDatabaseName } from "./turso";

describe("Turso database names", () => {
  test("uses a stable main database name", () => {
    expect(buildTursoDatabaseName("My App", "main", "main")).toBe(
      "my-app-main",
    );
  });

  test("creates distinct names for IDs that sanitize the same way", () => {
    const underscore = buildTursoDatabaseName("wbd", "space", "a_b");
    const dash = buildTursoDatabaseName("wbd", "space", "a-b");

    expect(underscore).not.toBe(dash);
  });

  test("keeps long names within the Turso limit", () => {
    const name = buildTursoDatabaseName(
      "a-very-long-will-be-done-deployment-prefix",
      "user",
      "an-even-longer-user-identifier-that-cannot-fit-in-a-database-name",
    );

    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toMatch(/^[a-z0-9-]+$/);
  });
});
