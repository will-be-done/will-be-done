import { describe, expect, it } from "vitest";
import { MAX, MIN } from "../db.ts";
import { UnreachableError } from "../utils.ts";
import {
  compareStoredTuple,
  compareStoredValue,
  compareTuple,
  compareValue,
} from "./tuple.ts";
import {
  encodeSqliteSortKeyTuple,
  getSqliteSortKeyTuple,
} from "./SqliteSortKey.ts";

const sign = (value: number) => (value === 0 ? 0 : value > 0 ? 1 : -1);

function compareEncodedTuples(
  left: readonly unknown[],
  right: readonly unknown[],
  mode: "scan" | "stored",
) {
  const encodedLeft = encodeSqliteSortKeyTuple(left, mode);
  const encodedRight = encodeSqliteSortKeyTuple(right, mode);

  if (encodedLeft < encodedRight) return -1;
  if (encodedLeft > encodedRight) return 1;
  return 0;
}

describe("SqliteSortKey", () => {
  describe("scan mode", () => {
    it("encodes scan values in the same order as compareValue", () => {
      const values = [
        MIN,
        undefined,
        null,
        Number.NEGATIVE_INFINITY,
        -1,
        -0,
        0,
        Number.MIN_VALUE,
        false,
        true,
        1,
        Number.POSITIVE_INFINITY,
        "",
        "!",
        "0",
        "a",
        "aa",
        "b",
        MAX,
      ];

      for (const left of values) {
        for (const right of values) {
          expect(compareEncodedTuples([left], [right], "scan")).toBe(
            sign(compareValue(left as never, right as never)),
          );
        }
      }
    });

    it("folds undefined into the null scan key", () => {
      expect(encodeSqliteSortKeyTuple([undefined], "scan")).toBe(
        encodeSqliteSortKeyTuple([null], "scan"),
      );
    });

    it("rejects values that are not valid scan bounds", () => {
      for (const value of [1n, [], {}, new Uint8Array([1])]) {
        expect(() => encodeSqliteSortKeyTuple([value], "scan")).toThrow(
          UnreachableError,
        );
      }
    });
  });

  describe("stored mode", () => {
    it("encodes stored values in the same order as compareStoredValue", () => {
      const bytes = new Uint8Array([9, 1, 2, 8]).buffer;
      const values = [
        MIN,
        undefined,
        null,
        -100n,
        { $hyperdbType: "bigint", value: "-2" },
        -1n,
        0n,
        { $hyperdbType: "bigint", value: "1" },
        2n,
        10n,
        Number.NEGATIVE_INFINITY,
        -Number.MAX_VALUE,
        -1,
        -0,
        0,
        Number.MIN_VALUE,
        1,
        Number.MAX_VALUE,
        Number.POSITIVE_INFINITY,
        false,
        true,
        "",
        "!",
        "0",
        "a",
        "aa",
        "b",
        new Uint8Array([]),
        new Uint8Array([0]),
        new Uint8Array([0, 1]),
        new Uint8Array([1]),
        new Uint8Array(bytes, 1, 2),
        { $hyperdbType: "bytes", value: [1, 2] },
        { $hyperdbType: "arrayBuffer", value: [9, 1, 2, 8] },
        [],
        [null],
        [0],
        [0, null],
        [1],
        ["a"],
        [[0]],
        [{ a: 1 }],
        {},
        { a: 1 },
        { a: 2 },
        { a: 999, b: 0 },
        { b: 0 },
        { z: null },
        MAX,
      ];

      for (const left of values) {
        for (const right of values) {
          expect(compareEncodedTuples([left], [right], "stored")).toBe(
            sign(compareStoredValue(left, right)),
          );
        }
      }
    });

    it("keeps missing and null distinct in stored keys", () => {
      expect(compareEncodedTuples([undefined], [null], "stored")).toBe(-1);
      expect(encodeSqliteSortKeyTuple([undefined], "stored")).not.toBe(
        encodeSqliteSortKeyTuple([null], "stored"),
      );
    });

    it("encodes equivalent storage wrappers to equivalent sort keys", () => {
      const buffer = new Uint8Array([9, 1, 2, 8]).buffer;

      expect(encodeSqliteSortKeyTuple([1n], "stored")).toBe(
        encodeSqliteSortKeyTuple(
          [{ $hyperdbType: "bigint", value: "1" }],
          "stored",
        ),
      );
      expect(
        encodeSqliteSortKeyTuple([new Uint8Array(buffer, 1, 2)], "stored"),
      ).toBe(
        encodeSqliteSortKeyTuple(
          [{ $hyperdbType: "bytes", value: [1, 2] }],
          "stored",
        ),
      );
    });

    it("does not encode malformed bytes wrappers as bytes", () => {
      const validBytesKey = encodeSqliteSortKeyTuple(
        [{ $hyperdbType: "bytes", value: [1, 2] }],
        "stored",
      );

      for (const value of [
        { $hyperdbType: "bytes", value: [1, 256] },
        { $hyperdbType: "bytes", value: [1.5] },
        { $hyperdbType: "bytes", value: "AQI=" },
        { $hyperdbType: "arrayBuffer", value: [Number.NaN] },
      ]) {
        expect(encodeSqliteSortKeyTuple([value], "stored")).not.toBe(
          validBytesKey,
        );
      }
    });

    it("encodes tuple comparisons lexicographically", () => {
      const tuples = [
        [1n, "a"],
        [1n, "b"],
        [2n, MIN],
        [2n, null],
        [2n, "a"],
        [2n, MAX],
        [2n, MAX, MIN],
      ];

      for (const left of tuples) {
        for (const right of tuples) {
          expect(compareEncodedTuples(left, right, "stored")).toBe(
            sign(compareStoredTuple(left, right)),
          );
        }
      }
    });

    it("rejects unsupported stored values", () => {
      for (const value of [Symbol("bad"), () => undefined]) {
        expect(() => encodeSqliteSortKeyTuple([value], "stored")).toThrow();
      }
    });
  });

  it("encodes scan tuples in the same order as compareTuple", () => {
    const tuples = [
      [1, "a"],
      [1, "b"],
      [2, MIN],
      [2, null],
      [2, ""],
      [2, MAX],
      [2, MAX, MIN],
    ];

    for (const left of tuples) {
      for (const right of tuples) {
        expect(compareEncodedTuples(left, right, "scan")).toBe(
          sign(compareTuple(left as never, right as never)),
        );
      }
    }
  });

  describe("getSqliteSortKeyTuple", () => {
    it("returns index values in column order", () => {
      expect(
        getSqliteSortKeyTuple(
          { id: "row-1", value: 1, title: "A" },
          ["value", "id"],
          false,
        ),
      ).toEqual([1, "row-1"]);
    });

    it("skips rows with missing indexed columns unless missing values are included", () => {
      expect(
        getSqliteSortKeyTuple({ id: "row-1" }, ["value", "id"], false),
      ).toBeUndefined();
      expect(
        getSqliteSortKeyTuple({ id: "row-1" }, ["value", "id"], true),
      ).toEqual([undefined, "row-1"]);
    });

    it("normalizes explicit undefined to null only when missing values are excluded", () => {
      expect(
        getSqliteSortKeyTuple(
          { id: "row-1", value: undefined },
          ["value", "id"],
          false,
        ),
      ).toEqual([null, "row-1"]);
      expect(
        getSqliteSortKeyTuple(
          { id: "row-1", value: undefined },
          ["value", "id"],
          true,
        ),
      ).toEqual([undefined, "row-1"]);
    });
  });
});
