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
  subtractIntervals,
  intervalToWhereClause,
} from "./intervals";

// Helper to create intervals concisely
const iv = (
  lower: (number | string | typeof MIN | typeof MAX)[],
  upper: (number | string | typeof MIN | typeof MAX)[],
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

describe("subtractIntervals", () => {
  it("returns full requested when no cached intervals", () => {
    const result = subtractIntervals([], [iv([5], [7])]);
    expect(result).toEqual([iv([5], [7])]);
  });

  it("returns empty when fully covered", () => {
    const result = subtractIntervals([iv([0], [10])], [iv([2], [5])]);
    expect(result).toEqual([]);
  });

  it("returns uncovered right portion (partial left overlap)", () => {
    const result = subtractIntervals([iv([0], [4])], [iv([0], [7])]);
    expect(result).toEqual([iv([4], [7], false, true)]);
  });

  it("returns uncovered left portion (partial right overlap)", () => {
    const result = subtractIntervals([iv([5], [10])], [iv([3], [10])]);
    expect(result).toEqual([iv([3], [5], true, false)]);
  });

  it("returns gaps around multiple cached intervals", () => {
    const cached = [iv([0], [4]), iv([7], [9])];
    const result = subtractIntervals(cached, [iv([0], [10])]);
    expect(result).toEqual([
      iv([4], [7], false, false),
      iv([9], [10], false, true),
    ]);
  });

  it("handles multiple cached covering parts", () => {
    const cached = [iv([1], [3]), iv([5], [7]), iv([9], [11])];
    const result = subtractIntervals(cached, [iv([0], [12])]);
    expect(result).toEqual([
      iv([0], [1], true, false),
      iv([3], [5], false, false),
      iv([7], [9], false, false),
      iv([11], [12], false, true),
    ]);
  });

  it("handles exclusive/inclusive boundary matching", () => {
    // cached [0,5) exclusive upper, requested [5,10] inclusive lower
    const cached = [iv([0], [5], true, false)];
    const result = subtractIntervals(cached, [iv([5], [10])]);
    // [5,10] is fully uncovered because cached excludes 5
    expect(result).toEqual([iv([5], [10])]);
  });

  it("handles cached inclusive upper matching requested inclusive lower", () => {
    // cached [0,5] inclusive upper, requested [5,10] inclusive lower
    const cached = [iv([0], [5], true, true)];
    const result = subtractIntervals(cached, [iv([5], [10])]);
    // 5 is covered, so uncovered is (5,10]
    expect(result).toEqual([iv([5], [10], false, true)]);
  });

  it("handles multiple requested intervals", () => {
    const cached = [iv([3], [6])];
    const result = subtractIntervals(cached, [iv([1], [4]), iv([5], [8])]);
    expect(result).toEqual([
      iv([1], [3], true, false),
      iv([6], [8], false, true),
    ]);
  });

  it("request within single cached returns empty", () => {
    const cached = [iv([0], [10])];
    const result = subtractIntervals(cached, [iv([3], [7])]);
    expect(result).toEqual([]);
  });

  it("no overlap — cached before requested", () => {
    const cached = [iv([1], [3])];
    const result = subtractIntervals(cached, [iv([5], [7])]);
    expect(result).toEqual([iv([5], [7])]);
  });

  it("no overlap — cached after requested", () => {
    const cached = [iv([8], [10])];
    const result = subtractIntervals(cached, [iv([1], [3])]);
    expect(result).toEqual([iv([1], [3])]);
  });

  it("works with multi-element tuples", () => {
    const cached = [iv([1, MIN], [1, MAX])];
    const result = subtractIntervals(cached, [iv([0, MIN], [2, MAX])]);
    expect(result).toEqual([
      iv([0, MIN], [1, MIN], true, false),
      iv([1, MAX], [2, MAX], false, true),
    ]);
  });
});

describe("intervalToWhereClause", () => {
  it("converts basic interval to gte/lte clause", () => {
    const interval = iv([3, MIN], [7, MAX]);
    const result = intervalToWhereClause(interval, ["value"]);
    expect(result).toEqual({
      gte: [{ col: "value", val: 3 }],
      lte: [{ col: "value", val: 7 }],
    });
  });

  it("all-MIN lower produces no lower clause", () => {
    const interval = iv([MIN, MIN], [5, MAX]);
    const result = intervalToWhereClause(interval, ["value"]);
    expect(result).toEqual({
      lte: [{ col: "value", val: 5 }],
    });
  });

  it("all-MAX upper produces no upper clause", () => {
    const interval = iv([3, MIN], [MAX, MAX]);
    const result = intervalToWhereClause(interval, ["value"]);
    expect(result).toEqual({
      gte: [{ col: "value", val: 3 }],
    });
  });

  it("fully unbounded interval returns empty clause", () => {
    const interval = iv([MIN, MIN], [MAX, MAX]);
    const result = intervalToWhereClause(interval, ["value"]);
    expect(result).toEqual({});
  });

  it("id part MAX in lower → uses gt", () => {
    // lower = [3, MAX] means we're past value=3 entirely
    const interval = iv([3, MAX], [7, MAX], false, true);
    const result = intervalToWhereClause(interval, ["value"]);
    expect(result).toEqual({
      gt: [{ col: "value", val: 3 }],
      lte: [{ col: "value", val: 7 }],
    });
  });

  it("id part MIN in upper → uses lt", () => {
    // upper = [7, MIN] means we're before value=7 entirely
    const interval = iv([3, MIN], [7, MIN], true, false);
    const result = intervalToWhereClause(interval, ["value"]);
    expect(result).toEqual({
      gte: [{ col: "value", val: 3 }],
      lt: [{ col: "value", val: 7 }],
    });
  });

  it("handles multi-column baseCols", () => {
    // baseCols = ["projectId", "value"], indexCols = ["projectId", "value", "id"]
    const interval = iv(["p1", 1, MIN], ["p1", 5, MAX]);
    const result = intervalToWhereClause(interval, ["projectId", "value"]);
    expect(result).toEqual({
      gte: [
        { col: "projectId", val: "p1" },
        { col: "value", val: 1 },
      ],
      lte: [
        { col: "projectId", val: "p1" },
        { col: "value", val: 5 },
      ],
    });
  });

  it("mixed trailing values in lower → uses gte", () => {
    // lower = [3, "some-id"] — not all MAX, so use gte
    const interval = iv([3, "some-id"], [7, MAX]);
    const result = intervalToWhereClause(interval, ["value"]);
    expect(result).toEqual({
      gte: [{ col: "value", val: 3 }],
      lte: [{ col: "value", val: 7 }],
    });
  });

  it("mixed trailing values in upper → uses lte", () => {
    // upper = [7, "some-id"] — not all MIN, so use lte
    const interval = iv([3, MIN], [7, "some-id"]);
    const result = intervalToWhereClause(interval, ["value"]);
    expect(result).toEqual({
      gte: [{ col: "value", val: 3 }],
      lte: [{ col: "value", val: 7 }],
    });
  });
});
