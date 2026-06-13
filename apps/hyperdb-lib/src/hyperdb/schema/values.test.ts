import { assertType, describe, expect, it } from "vitest";
import { assertValid, type Infer, v } from "./values";

describe("validators", () => {
  it("infers primitive, object, optional, union, literal, and array types", () => {
    const validator = v.object({
      id: v.string(),
      count: v.number(),
      done: v.boolean(),
      missing: v.optional(v.string()),
      kind: v.union(v.literal("task"), v.literal("template")),
      tags: v.array(v.string()),
      none: v.null(),
    });

    type Value = Infer<typeof validator>;

    assertType<Value>({
      id: "1",
      count: 1,
      done: false,
      kind: "task",
      tags: ["a"],
      none: null,
    });

    assertType<Value>({
      id: "1",
      count: 1,
      done: false,
      missing: "ok",
      kind: "template",
      tags: [],
      none: null,
    });

    expect(
      assertValid(validator, {
        id: "1",
        count: 1,
        done: false,
        kind: "task",
        tags: ["a"],
        none: null,
      }),
    ).toEqual({
      id: "1",
      count: 1,
      done: false,
      kind: "task",
      tags: ["a"],
      none: null,
    });
  });

  it("validates and normalizes optional object fields", () => {
    const validator = v.object({
      id: v.string(),
      title: v.string(),
      note: v.optional(v.string()),
    });

    expect(
      assertValid(validator, {
        id: "1",
        title: "Hello",
      }),
    ).toEqual({
      id: "1",
      title: "Hello",
    });

    expect(
      assertValid(validator, {
        id: "1",
        title: "Hello",
        note: undefined,
      }),
    ).toEqual({
      id: "1",
      title: "Hello",
    });
  });

  it("rejects undefined stored values, including inside arrays", () => {
    expect(() => assertValid(v.string(), undefined)).toThrow(
      /undefined is not a valid stored value at <root>/,
    );

    expect(() => assertValid(v.array(v.string()), ["ok", undefined])).toThrow(
      /undefined is not a valid stored value at \[1\]/,
    );
  });

  it("rejects missing required fields, unexpected fields, and invalid object keys", () => {
    const validator = v.object({
      id: v.string(),
      _private: v.boolean(),
    });

    expect(() => assertValid(validator, { id: "1" })).toThrow(
      /missing required field at _private/,
    );
    expect(() =>
      assertValid(validator, { id: "1", _private: true, extra: "nope" }),
    ).toThrow(/unexpected object field extra at extra/);
    expect(() => assertValid(v.any(), { "": "empty" })).toThrow(
      /object keys cannot be empty or start with \$ at \[""\]/,
    );
    expect(() => assertValid(v.any(), { $bad: "bad" })).toThrow(
      /object keys cannot be empty or start with \$ at \$bad/,
    );

    expect(assertValid(validator, { id: "1", _private: true })).toEqual({
      id: "1",
      _private: true,
    });
  });

  it("validates record keys as dynamic ASCII keys", () => {
    const validator = v.record(v.string(), v.boolean());

    expect(assertValid(validator, { a: true, "z-9": false })).toEqual({
      a: true,
      "z-9": false,
    });

    expect(() => assertValid(validator, { ключ: true })).toThrow(
      /record keys must be non-empty ASCII keys/,
    );
    expect(() => assertValid(validator, { $bad: true })).toThrow(
      /record keys must be non-empty ASCII keys/,
    );
  });

  it("validates union, literal, any, and null semantics", () => {
    const validator = v.union(v.literal("a"), v.literal(1), v.null());

    expect(assertValid(validator, "a")).toBe("a");
    expect(assertValid(validator, 1)).toBe(1);
    expect(assertValid(validator, null)).toBeNull();
    expect(() => assertValid(validator, false)).toThrow(
      /expected one of union variants/,
    );

    const bytes = new ArrayBuffer(2);
    expect(assertValid(v.any(), { ok: [1, "two", true, null], bytes })).toEqual(
      {
        ok: [1, "two", true, null],
        bytes,
      },
    );
  });

  it("rejects non-finite numbers", () => {
    expect(() => assertValid(v.number(), Number.NaN)).toThrow(
      /expected finite number/,
    );
    expect(() => assertValid(v.any(), Number.POSITIVE_INFINITY)).toThrow(
      /number must be finite/,
    );
  });
});
