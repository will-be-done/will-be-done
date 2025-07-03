/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import {
  compareTuple,
  compareValue,
  encodingTypeOf,
  UnreachableError,
} from "./InmemDriver.ts";
import { MAX, MIN } from "../db.ts";

describe("Value and Tuple Comparison Edge Cases", () => {
  describe("encodingTypeOf", () => {
    it("should correctly identify encoding types", () => {
      expect(encodingTypeOf(null)).toBe("null");
      expect(encodingTypeOf(true)).toBe("integer");
      expect(encodingTypeOf(false)).toBe("integer");
      expect(encodingTypeOf(42)).toBe("integer");
      expect(encodingTypeOf(3.14)).toBe("float");
      expect(encodingTypeOf("hello")).toBe("string");
      expect(encodingTypeOf(MIN)).toBe("virtual");
      expect(encodingTypeOf(MAX)).toBe("virtual");
    });

    it("should throw for unknown types", () => {
      expect(() => encodingTypeOf({} as any)).toThrow(UnreachableError);
      expect(() => encodingTypeOf([] as any)).toThrow(UnreachableError);
      expect(() => encodingTypeOf(undefined as any)).toThrow(UnreachableError);
    });
  });

  describe("compareValue", () => {
    it("should compare same types correctly", () => {
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

    it("should throw for virtual values", () => {
      expect(() => compareValue(MIN, MAX)).toThrow(
        "Cannot save virtual values into tuple",
      );
    });
  });

  describe("compareTuple", () => {
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

      // Virtual values throw when both are virtual
      expect(() => compareValue(MIN, MAX)).toThrow(
        "Cannot save virtual values into tuple",
      );
      expect(() => compareValue(MAX, MIN)).toThrow(
        "Cannot save virtual values into tuple",
      );

      // But MIN/MAX vs regular values work for bounds
      expect(compareTuple([1, 0], [1, null])).toBe(1); // 0 > null in encoding order
      expect(compareTuple([null, 1], [1, null])).toBe(-1); // null < 1 in encoding order
    });
  });
});
