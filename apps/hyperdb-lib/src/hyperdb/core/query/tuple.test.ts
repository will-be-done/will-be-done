/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { MAX, MIN } from "../primitives";
import {
  compareStoredTuple,
  compareStoredValue,
  compareTuple,
  compareValue,
  encodingTypeOf,
  isRowInRange,
} from "./tuple";
import { UnreachableError } from "../../utils";
import { defineTable } from "../../schema/table";
import { v } from "../../schema/values";

describe("Value and Tuple Comparison Edge Cases", () => {
  const sign = (value: number) => (value === 0 ? 0 : value > 0 ? 1 : -1);

  describe("encodingTypeOf", () => {
    it("should correctly identify encoding types", () => {
      expect(encodingTypeOf(null)).toBe("null");
      expect(encodingTypeOf(true)).toBe("float");
      expect(encodingTypeOf(false)).toBe("float");
      expect(encodingTypeOf(42)).toBe("float");
      expect(encodingTypeOf(3.14)).toBe("float");
      expect(encodingTypeOf("hello")).toBe("string");
      expect(encodingTypeOf(MIN)).toBe("virtual");
      expect(encodingTypeOf(MAX)).toBe("virtual");
    });

    it("should throw for unknown types", () => {
      expect(() => encodingTypeOf({} as any)).toThrow(UnreachableError);
      expect(() => encodingTypeOf([] as any)).toThrow(UnreachableError);
      // expect(() => encodingTypeOf(undefined as any)).toThrow(UnreachableError);
    });
  });

  describe("compareValue", () => {
    it("should compare same types correctly", () => {
      expect(compareValue(MIN, MAX)).toBe(-1);
      expect(compareValue(MAX, MIN)).toBe(1);
      expect(compareValue(MAX, MAX)).toBe(0);
      expect(compareValue(MIN, MIN)).toBe(0);

      expect(compareValue(MIN, "a")).toBe(-1);
      expect(compareValue("a", MIN)).toBe(1);

      expect(compareValue("a", MAX)).toBe(-1);
      expect(compareValue(MAX, "a")).toBe(1);

      expect(compareValue(1, 2)).toBe(-1);
      expect(compareValue(2, 1)).toBe(1);
      expect(compareValue(1, 1)).toBe(0);

      expect(compareValue(1.5, 2.5)).toBe(-1);
      expect(compareValue(2.5, 1.5)).toBe(1);
      expect(compareValue(1.5, 1.5)).toBe(0);

      expect(compareValue("a", "b")).toBe(-1);
      expect(compareValue("b", "a")).toBe(1);
      expect(compareValue("a", "a")).toBe(0);

      expect(compareValue(true, false)).toBe(1);
      expect(compareValue(false, true)).toBe(-1);
      expect(compareValue(true, true)).toBe(0);

      expect(compareValue(null, null)).toBe(0);
    });

    it("should handle MIN/MAX comparisons", () => {
      expect(compareValue(1, MIN)).toBe(1);
      expect(compareValue("hello", MIN)).toBe(1);
      expect(compareValue(null, MIN)).toBe(1);

      expect(compareValue(1, MAX)).toBe(-1);
      expect(compareValue("hello", MAX)).toBe(-1);
      expect(compareValue(null, MAX)).toBe(-1);
    });

    it("should compare different types by encoding rank", () => {
      // null < integer < float < string
      expect(compareValue(null, 1)).toBe(-1);
      expect(compareValue(1, null)).toBe(1);

      expect(compareValue(1, 1.5)).toBe(-1);
      expect(compareValue(1.5, 1)).toBe(1);

      expect(compareValue(1.5, "a")).toBe(-1);
      expect(compareValue("a", 1.5)).toBe(1);

      expect(compareValue(null, "a")).toBe(-1);
      expect(compareValue("a", null)).toBe(1);
    });
  });

  describe("compareTuple", () => {
    it("should compare tuples of different lengths", () => {
      expect(compareTuple([2, MIN, MIN], [2, "c", MAX])).toBe(-1);
      expect(compareTuple([2, "c", MAX], [2, MIN, MIN])).toBe(1);
    });

    it("should compare tuples of same length", () => {
      expect(compareTuple([1, 2], [1, 3])).toBe(-1);
      expect(compareTuple([1, 3], [1, 2])).toBe(1);
      expect(compareTuple([1, 2], [1, 2])).toBe(0);

      expect(compareTuple([1, 2], [2, 1])).toBe(-1);
      expect(compareTuple([2, 1], [1, 2])).toBe(1);
    });

    it("should compare tuples of different lengths", () => {
      expect(compareTuple([1], [1, 2])).toBe(-1);
      expect(compareTuple([1, 2], [1])).toBe(1);
      expect(compareTuple([1, 2], [1, 2, 3])).toBe(-1);
      expect(compareTuple([1, 2, 3], [1, 2])).toBe(1);
    });

    it("should handle empty tuples", () => {
      expect(compareTuple([], [])).toBe(0);
      expect(compareTuple([], [1])).toBe(-1);
      expect(compareTuple([1], [])).toBe(1);
    });

    it("should handle mixed types in tuples", () => {
      expect(compareTuple([null, 1], [null, "a"])).toBe(-1);
      expect(compareTuple([1, "a"], [1, null])).toBe(1);
      expect(compareTuple(["a", 1], [null, 1])).toBe(1);
    });

    it("should handle MIN/MAX in comparisons", () => {
      // Test that compareValue handles MIN/MAX correctly when used as bounds
      expect(compareValue(1, MIN)).toBe(1);
      expect(compareValue(1, MAX)).toBe(-1);
      expect(compareValue("hello", MIN)).toBe(1);
      expect(compareValue("hello", MAX)).toBe(-1);

      // But MIN/MAX vs regular values work for bounds
      expect(compareTuple([1, 0], [1, null])).toBe(1); // 0 > null in encoding order
      expect(compareTuple([null, 1], [1, null])).toBe(-1); // null < 1 in encoding order
    });
  });

  describe("compareStoredValue", () => {
    it("orders the full stored value type ladder including virtual bounds", () => {
      const values = [
        MIN,
        undefined,
        null,
        -1n,
        { $hyperdbType: "bigint", value: "0" },
        1,
        false,
        true,
        "",
        new Uint8Array([]),
        [],
        {},
        MAX,
      ];

      for (let left = 0; left < values.length; left++) {
        for (let right = 0; right < values.length; right++) {
          expect(sign(compareStoredValue(values[left], values[right]))).toBe(
            sign(left - right),
          );
        }
      }
    });

    it("compares bigint values numerically across raw and encoded forms", () => {
      const values = [
        -100n,
        { $hyperdbType: "bigint", value: "-2" },
        -1n,
        0n,
        { $hyperdbType: "bigint", value: "1" },
        2n,
        10n,
        100n,
      ];

      for (let left = 0; left < values.length; left++) {
        for (let right = 0; right < values.length; right++) {
          expect(sign(compareStoredValue(values[left], values[right]))).toBe(
            sign(left - right),
          );
        }
      }
      expect(
        compareStoredValue(1n, { $hyperdbType: "bigint", value: "1" }),
      ).toBe(0);
    });

    it("normalizes equivalent bytes from buffers, typed-array views, and encoded storage", () => {
      const buffer = new Uint8Array([9, 1, 2, 8]).buffer;
      const view = new Uint8Array(buffer, 1, 2);

      expect(compareStoredValue(view, new Uint8Array([1, 2]))).toBe(0);
      expect(
        compareStoredValue(view, { $hyperdbType: "bytes", value: [1, 2] }),
      ).toBe(0);
      expect(
        compareStoredValue(buffer, {
          $hyperdbType: "arrayBuffer",
          value: [9, 1, 2, 8],
        }),
      ).toBe(0);
      expect(compareStoredValue(new Uint8Array([]), new Uint8Array([0]))).toBe(
        -1,
      );
      expect(
        compareStoredValue(new Uint8Array([0, 1]), new Uint8Array([1])),
      ).toBe(-1);
    });

    it("compares arrays recursively and shorter equal prefixes first", () => {
      const arrays = [
        [],
        [null],
        [0],
        [0, null],
        [0, 1],
        [1],
        ["a"],
        [[0]],
        [{ a: 1 }],
      ];

      for (let left = 0; left < arrays.length; left++) {
        for (let right = 0; right < arrays.length; right++) {
          expect(sign(compareStoredValue(arrays[left], arrays[right]))).toBe(
            sign(left - right),
          );
        }
      }
    });

    it("compares objects by sorted keys before values", () => {
      const objects = [
        {},
        { a: 1 },
        { a: 2 },
        { a: 999, b: 0 },
        { b: 0 },
        { z: null },
      ];

      for (let left = 0; left < objects.length; left++) {
        for (let right = 0; right < objects.length; right++) {
          expect(sign(compareStoredValue(objects[left], objects[right]))).toBe(
            sign(left - right),
          );
        }
      }

      expect(compareStoredValue({ b: 1, a: 1 }, { a: 1, b: 1 })).toBe(0);
    });
  });

  describe("compareStoredTuple", () => {
    it("compares tuples lexicographically using stored value ordering", () => {
      expect(compareStoredTuple([undefined, "b"], [null, "a"])).toBe(-1);
      expect(compareStoredTuple([1n, "a"], [1n, "b"])).toBe(-1);
      expect(compareStoredTuple([[1], "a"], [{ a: 1 }, "a"])).toBe(-1);
      expect(compareStoredTuple([new Uint8Array([1])], [["a"]])).toBe(-1);
    });

    it("orders shorter tuples after equal stored prefixes", () => {
      expect(compareStoredTuple([1n], [1n, MIN])).toBe(-1);
      expect(compareStoredTuple([1n, MAX], [1n])).toBe(1);
      expect(compareStoredTuple([], [])).toBe(0);
    });
  });
});

describe("isRowInRange", () => {
  const mockTable = defineTable("test_table", {
    id: v.string(),
    name: v.string(),
    age: v.number(),
    score: v.number(),
  })
    .index("name_age", ["name", "age"])
    .index("score", ["score"]);

  const sampleRow = {
    id: "1",
    name: "Alice",
    age: 25,
    score: 85.5,
  };

  describe("single column index", () => {
    it("should return true when row is in range with gte", () => {
      expect(isRowInRange(sampleRow, mockTable, "score", { gte: [80.1] })).toBe(
        true,
      );
      expect(isRowInRange(sampleRow, mockTable, "score", { gte: [85.5] })).toBe(
        true,
      );
      expect(isRowInRange(sampleRow, mockTable, "score", { gte: [90.1] })).toBe(
        false,
      );
    });

    it("should return true when row is in range with gt", () => {
      expect(isRowInRange(sampleRow, mockTable, "score", { gt: [80.1] })).toBe(
        true,
      );
      expect(isRowInRange(sampleRow, mockTable, "score", { gt: [85.5] })).toBe(
        false,
      );
      expect(isRowInRange(sampleRow, mockTable, "score", { gt: [90.1] })).toBe(
        false,
      );
    });

    it("should return true when row is in range with lte", () => {
      expect(isRowInRange(sampleRow, mockTable, "score", { lte: [90.1] })).toBe(
        true,
      );
      expect(isRowInRange(sampleRow, mockTable, "score", { lte: [85.5] })).toBe(
        true,
      );
      expect(isRowInRange(sampleRow, mockTable, "score", { lte: [80.1] })).toBe(
        false,
      );
    });

    it("should return true when row is in range with lt", () => {
      expect(isRowInRange(sampleRow, mockTable, "score", { lt: [90.1] })).toBe(
        true,
      );
      expect(isRowInRange(sampleRow, mockTable, "score", { lt: [85.5] })).toBe(
        false,
      );
      expect(isRowInRange(sampleRow, mockTable, "score", { lt: [80.1] })).toBe(
        false,
      );
    });
  });

  describe("multi-column index", () => {
    it("should return true when row is in range with gte", () => {
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { gte: ["Alice", 20] }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { gte: ["Alice", 25] }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { gte: ["Alice", 30] }),
      ).toBe(false);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { gte: ["Bob", 20] }),
      ).toBe(false);
    });

    it("should return true when row is in range with gt", () => {
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { gt: ["Alice", 20] }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { gt: ["Alice", 25] }),
      ).toBe(false);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { gt: ["Alice", 30] }),
      ).toBe(false);
    });

    it("should return true when row is in range with lte", () => {
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { lte: ["Alice", 30] }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { lte: ["Alice", 25] }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { lte: ["Alice", 20] }),
      ).toBe(false);
    });

    it("should return true when row is in range with lt", () => {
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { lt: ["Alice", 30] }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { lt: ["Alice", 25] }),
      ).toBe(false);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { lt: ["Alice", 20] }),
      ).toBe(false);
    });
  });

  describe("combined bounds", () => {
    it("should handle gte and lte together", () => {
      expect(
        isRowInRange(sampleRow, mockTable, "score", {
          gte: [80.1],
          lte: [90.1],
        }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "score", {
          gte: [85.5],
          lte: [90.1],
        }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "score", {
          gte: [90.1],
          lte: [95.1],
        }),
      ).toBe(false);
      expect(
        isRowInRange(sampleRow, mockTable, "score", {
          gte: [70.1],
          lte: [80.1],
        }),
      ).toBe(false);
    });

    it("should handle gt and lt together", () => {
      expect(
        isRowInRange(sampleRow, mockTable, "score", { gt: [80.1], lt: [90.1] }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "score", { gt: [85.5], lt: [90.1] }),
      ).toBe(false);
      expect(
        isRowInRange(sampleRow, mockTable, "score", { gt: [90.1], lt: [95.1] }),
      ).toBe(false);
      expect(
        isRowInRange(sampleRow, mockTable, "score", { gt: [70.1], lt: [85.5] }),
      ).toBe(false);
    });

    it("should handle mixed bounds", () => {
      expect(
        isRowInRange(sampleRow, mockTable, "score", {
          gte: [80.1],
          lt: [90.1],
        }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "score", {
          gt: [80.1],
          lte: [90.1],
        }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "score", {
          gte: [85.5],
          lt: [90.1],
        }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "score", {
          gt: [85.5],
          lte: [90.1],
        }),
      ).toBe(false);
    });
  });

  describe("partial tuple bounds", () => {
    it("should handle partial tuples with gte", () => {
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { gte: ["Alice"] }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { gte: ["Bob"] }),
      ).toBe(false);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { gte: ["Aaron"] }),
      ).toBe(true);
    });

    it("should handle partial tuples with lte", () => {
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { lte: ["Alice"] }),
      ).toBe(true);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { lte: ["Aaron"] }),
      ).toBe(false);
      expect(
        isRowInRange(sampleRow, mockTable, "name_age", { lte: ["Bob"] }),
      ).toBe(true);
    });
  });

  describe("empty options", () => {
    it("should return true for empty options", () => {
      expect(isRowInRange(sampleRow, mockTable, "score", {})).toBe(true);
      expect(isRowInRange(sampleRow, mockTable, "name_age", {})).toBe(true);
    });
  });

  describe("edge cases with different data types", () => {
    const mixedRow = {
      id: "2",
      name: null,
      age: 0,
      score: 1, // Use integer instead of boolean for consistency
    };

    const booleanRow = {
      id: "3",
      name: "Bob",
      age: 30,
      score: true, // Separate test with boolean
    };

    it("should handle null values", () => {
      expect(
        isRowInRange(mixedRow, mockTable, "name_age", { gte: [null, 0] }),
      ).toBe(true);
      expect(
        isRowInRange(mixedRow, mockTable, "name_age", { gt: [null, 0] }),
      ).toBe(false);
      expect(
        isRowInRange(mixedRow, mockTable, "name_age", { gte: ["Alice", 0] }),
      ).toBe(false);
    });

    it("should handle boolean values", () => {
      expect(
        isRowInRange(booleanRow, mockTable, "score", { gte: [true] }),
      ).toBe(true);
      expect(isRowInRange(booleanRow, mockTable, "score", { gt: [true] })).toBe(
        false,
      );
      expect(
        isRowInRange(booleanRow, mockTable, "score", { gte: [false] }),
      ).toBe(true);
      expect(
        isRowInRange(booleanRow, mockTable, "score", { lt: [false] }),
      ).toBe(false);
    });

    it("should handle integer values", () => {
      expect(isRowInRange(mixedRow, mockTable, "score", { gte: [0] })).toBe(
        true,
      );
      expect(isRowInRange(mixedRow, mockTable, "score", { gte: [1] })).toBe(
        true,
      );
      expect(isRowInRange(mixedRow, mockTable, "score", { gte: [2] })).toBe(
        false,
      );
      expect(isRowInRange(mixedRow, mockTable, "score", { lt: [2] })).toBe(
        true,
      );
      expect(isRowInRange(mixedRow, mockTable, "score", { lt: [1] })).toBe(
        false,
      );
    });
  });
});
