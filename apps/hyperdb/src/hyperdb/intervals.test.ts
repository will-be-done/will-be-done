import { describe, expect, it } from "vitest";
import { MIN, MAX } from "./db";
import type { NormalizedInterval } from "./intervals";
import {
  intervalContains,
  intervalsOverlapOrAdjacent,
  mergeInterval,
  isFullyCovered,
  tupleScanToNormalized,
  recordToTuple,
} from "./intervals";

// Helper to create intervals concisely
const iv = (
  lower: (number | typeof MIN | typeof MAX)[],
  upper: (number | typeof MIN | typeof MAX)[],
  lowerInclusive = true,
  upperInclusive = true,
): NormalizedInterval => ({ lower, upper, lowerInclusive, upperInclusive });

describe("intervalContains", () => {
  it("returns true when outer fully contains inner", () => {
    expect(intervalContains(iv([1], [10]), iv([2], [5]))).toBe(true);
  });

  it("returns true when outer equals inner", () => {
    expect(intervalContains(iv([1], [5]), iv([1], [5]))).toBe(true);
  });

  it("returns false when inner extends beyond outer upper", () => {
    expect(intervalContains(iv([1], [5]), iv([1], [7]))).toBe(false);
  });

  it("returns false when inner extends below outer lower", () => {
    expect(intervalContains(iv([3], [10]), iv([1], [10]))).toBe(false);
  });

  it("handles inclusivity at lower bound", () => {
    const exclusive = iv([1], [10], false, true);
    const inclusive = iv([1], [10], true, true);
    // exclusive outer cannot contain inclusive inner at same lower
    expect(intervalContains(exclusive, inclusive)).toBe(false);
    // inclusive outer can contain exclusive inner
    expect(intervalContains(inclusive, exclusive)).toBe(true);
  });

  it("handles inclusivity at upper bound", () => {
    const exclusive = iv([1], [10], true, false);
    const inclusive = iv([1], [10], true, true);
    expect(intervalContains(exclusive, inclusive)).toBe(false);
    expect(intervalContains(inclusive, exclusive)).toBe(true);
  });

  it("works with MIN/MAX bounds", () => {
    const full = iv([MIN], [MAX]);
    const partial = iv([1], [5]);
    expect(intervalContains(full, partial)).toBe(true);
    expect(intervalContains(partial, full)).toBe(false);
  });

  it("works with multi-element tuples", () => {
    const outer = iv([1, MIN], [1, MAX]);
    const inner = iv([1, 2], [1, 8]);
    expect(intervalContains(outer, inner)).toBe(true);
    expect(intervalContains(inner, outer)).toBe(false);
  });
});

describe("intervalsOverlapOrAdjacent", () => {
  it("returns true for overlapping intervals", () => {
    expect(intervalsOverlapOrAdjacent(iv([1], [5]), iv([3], [7]))).toBe(true);
  });

  it("returns true for adjacent inclusive intervals", () => {
    // [1,5] and [5,10] share the point 5
    expect(intervalsOverlapOrAdjacent(iv([1], [5]), iv([5], [10]))).toBe(true);
  });

  it("returns false for adjacent exclusive intervals", () => {
    // [1,5) and (5,10] have a gap at 5
    expect(
      intervalsOverlapOrAdjacent(
        iv([1], [5], true, false),
        iv([5], [10], false, true),
      ),
    ).toBe(false);
  });

  it("returns false for disjoint intervals", () => {
    expect(intervalsOverlapOrAdjacent(iv([1], [3]), iv([5], [7]))).toBe(false);
  });

  it("returns true for nested intervals", () => {
    expect(intervalsOverlapOrAdjacent(iv([1], [10]), iv([3], [5]))).toBe(true);
  });

  it("is commutative", () => {
    const a = iv([1], [5]);
    const b = iv([3], [7]);
    expect(intervalsOverlapOrAdjacent(a, b)).toBe(
      intervalsOverlapOrAdjacent(b, a),
    );
  });
});

describe("mergeInterval", () => {
  it("merges overlapping intervals", () => {
    const result = mergeInterval([iv([1], [5])], iv([3], [7]));
    expect(result).toEqual([iv([1], [7])]);
  });

  it("merges adjacent inclusive intervals", () => {
    const result = mergeInterval([iv([1], [5])], iv([5], [10]));
    expect(result).toEqual([iv([1], [10])]);
  });

  it("keeps disjoint intervals separate", () => {
    const result = mergeInterval([iv([1], [3])], iv([5], [7]));
    expect(result).toEqual([iv([1], [3]), iv([5], [7])]);
  });

  it("merges into existing list of multiple intervals", () => {
    // Existing: [1,3], [7,9]. New: [2,8] bridges both
    const result = mergeInterval([iv([1], [3]), iv([7], [9])], iv([2], [8]));
    expect(result).toEqual([iv([1], [9])]);
  });

  it("preserves inclusivity — takes union at shared bounds", () => {
    const result = mergeInterval(
      [iv([1], [5], true, false)],
      iv([5], [10], true, true),
    );
    // At bound 5: first has exclusive upper, second has inclusive lower → overlap
    // Merged lower=1 inclusive, upper=10 inclusive
    expect(result).toEqual([iv([1], [10], true, true)]);
  });

  it("handles single-point intervals", () => {
    const result = mergeInterval([iv([1], [1])], iv([1], [1]));
    expect(result).toEqual([iv([1], [1])]);
  });

  it("handles adding interval before existing", () => {
    const result = mergeInterval([iv([5], [10])], iv([1], [3]));
    expect(result).toEqual([iv([1], [3]), iv([5], [10])]);
  });
});

describe("isFullyCovered", () => {
  it("returns true when all requested are within cached", () => {
    const cached = [iv([1], [10])];
    const requested = [iv([2], [5]), iv([6], [9])];
    expect(isFullyCovered(cached, requested)).toBe(true);
  });

  it("returns false when one requested is not covered", () => {
    const cached = [iv([1], [5])];
    const requested = [iv([2], [4]), iv([6], [8])];
    expect(isFullyCovered(cached, requested)).toBe(false);
  });

  it("returns true for empty requested", () => {
    expect(isFullyCovered([iv([1], [5])], [])).toBe(true);
  });

  it("returns true when multiple cached intervals cover requested", () => {
    const cached = [iv([1], [5]), iv([5], [10])];
    const requested = [iv([3], [4]), iv([7], [9])];
    expect(isFullyCovered(cached, requested)).toBe(true);
  });

  it("returns false when requested partially extends beyond cached", () => {
    const cached = [iv([1], [5])];
    const requested = [iv([3], [7])];
    expect(isFullyCovered(cached, requested)).toBe(false);
  });

  it("respects inclusivity", () => {
    const cached = [iv([1], [5], true, false)]; // upper exclusive
    const requested = [iv([1], [5], true, true)]; // upper inclusive
    expect(isFullyCovered(cached, requested)).toBe(false);
  });
});

describe("tupleScanToNormalized", () => {
  it("converts gte/lte bounds", () => {
    const result = tupleScanToNormalized({ gte: [1], lte: [5] }, 1);
    expect(result).toEqual(iv([1], [5], true, true));
  });

  it("converts gt/lt bounds (exclusive)", () => {
    const result = tupleScanToNormalized({ gt: [1], lt: [5] }, 1);
    // normalizeTupleBounds pads gt with MAX, lt with MIN
    expect(result.lowerInclusive).toBe(false);
    expect(result.upperInclusive).toBe(false);
  });

  it("fills missing lower bound with MIN", () => {
    const result = tupleScanToNormalized({ lte: [5] }, 1);
    expect(result.lower).toEqual([MIN]);
    expect(result.lowerInclusive).toBe(true);
  });

  it("fills missing upper bound with MAX", () => {
    const result = tupleScanToNormalized({ gte: [1] }, 1);
    expect(result.upper).toEqual([MAX]);
    expect(result.upperInclusive).toBe(true);
  });

  it("fills missing bounds for multi-column index", () => {
    const result = tupleScanToNormalized({}, 3);
    expect(result.lower).toEqual([MIN, MIN, MIN]);
    expect(result.upper).toEqual([MAX, MAX, MAX]);
    expect(result.lowerInclusive).toBe(true);
    expect(result.upperInclusive).toBe(true);
  });

  it("pads gte tuple to full index length", () => {
    const result = tupleScanToNormalized({ gte: [1] }, 2);
    // normalizeTupleBounds pads gte with MIN
    expect(result.lower).toEqual([1, MIN]);
    expect(result.lowerInclusive).toBe(true);
  });

  it("pads lte tuple to full index length", () => {
    const result = tupleScanToNormalized({ lte: [5] }, 2);
    // normalizeTupleBounds pads lte with MAX
    expect(result.upper).toEqual([5, MAX]);
    expect(result.upperInclusive).toBe(true);
  });
});

describe("recordToTuple", () => {
  it("extracts specified columns in order", () => {
    const record = { id: "1", a: 10, b: "hello", c: true };
    expect(recordToTuple(record, ["a", "b"])).toEqual([10, "hello"]);
  });

  it("extracts single column", () => {
    const record = { id: "1", value: 42 };
    expect(recordToTuple(record, ["value"])).toEqual([42]);
  });

  it("handles null values", () => {
    const record = { id: "1", a: null, b: 5 };
    expect(recordToTuple(record, ["a", "b"])).toEqual([null, 5]);
  });

  it("respects column order", () => {
    const record = { id: "1", x: 1, y: 2 };
    expect(recordToTuple(record, ["y", "x"])).toEqual([2, 1]);
  });
});
