import type { Row, ScanValue, Tuple, TupleScanOptions, WhereClause } from "./db";
import { MIN, MAX } from "./db";
import {
  compareTuple as compareTuples,
  normalizeTupleBounds,
} from "./drivers/tuple";

export type NormalizedInterval = {
  lower: Tuple;
  upper: Tuple;
  lowerInclusive: boolean;
  upperInclusive: boolean;
};

export function intervalContains(
  outer: NormalizedInterval,
  inner: NormalizedInterval,
): boolean {
  const lowerCmp = compareTuples(outer.lower, inner.lower);
  if (lowerCmp > 0) return false;
  if (lowerCmp === 0 && !outer.lowerInclusive && inner.lowerInclusive)
    return false;

  const upperCmp = compareTuples(outer.upper, inner.upper);
  if (upperCmp < 0) return false;
  if (upperCmp === 0 && !outer.upperInclusive && inner.upperInclusive)
    return false;

  return true;
}

export function intervalsOverlapOrAdjacent(
  a: NormalizedInterval,
  b: NormalizedInterval,
): boolean {
  const cmpAB = compareTuples(a.upper, b.lower);
  if (cmpAB < 0) return false;
  if (cmpAB === 0 && !a.upperInclusive && !b.lowerInclusive) return false;

  const cmpBA = compareTuples(b.upper, a.lower);
  if (cmpBA < 0) return false;
  if (cmpBA === 0 && !b.upperInclusive && !a.lowerInclusive) return false;

  return true;
}

function mergeTwo(
  a: NormalizedInterval,
  b: NormalizedInterval,
): NormalizedInterval {
  const lowerCmp = compareTuples(a.lower, b.lower);
  let lower: Tuple;
  let lowerInclusive: boolean;
  if (lowerCmp < 0) {
    lower = a.lower;
    lowerInclusive = a.lowerInclusive;
  } else if (lowerCmp > 0) {
    lower = b.lower;
    lowerInclusive = b.lowerInclusive;
  } else {
    lower = a.lower;
    lowerInclusive = a.lowerInclusive || b.lowerInclusive;
  }

  const upperCmp = compareTuples(a.upper, b.upper);
  let upper: Tuple;
  let upperInclusive: boolean;
  if (upperCmp > 0) {
    upper = a.upper;
    upperInclusive = a.upperInclusive;
  } else if (upperCmp < 0) {
    upper = b.upper;
    upperInclusive = b.upperInclusive;
  } else {
    upper = a.upper;
    upperInclusive = a.upperInclusive || b.upperInclusive;
  }

  return { lower, upper, lowerInclusive, upperInclusive };
}

export function mergeInterval(
  existing: NormalizedInterval[],
  newInterval: NormalizedInterval,
): NormalizedInterval[] {
  const all = [...existing, newInterval];
  all.sort((a, b) => {
    const cmp = compareTuples(a.lower, b.lower);
    if (cmp !== 0) return cmp;
    return a.lowerInclusive && !b.lowerInclusive ? -1 : 0;
  });

  const merged: NormalizedInterval[] = [all[0]];
  for (let i = 1; i < all.length; i++) {
    const last = merged[merged.length - 1];
    if (intervalsOverlapOrAdjacent(last, all[i])) {
      merged[merged.length - 1] = mergeTwo(last, all[i]);
    } else {
      merged.push(all[i]);
    }
  }
  return merged;
}

export function isFullyCovered(
  cached: NormalizedInterval[],
  requested: NormalizedInterval[],
): boolean {
  for (const req of requested) {
    let covered = false;
    for (const c of cached) {
      if (intervalContains(c, req)) {
        covered = true;
        break;
      }
    }
    if (!covered) return false;
  }
  return true;
}

export function tupleScanToNormalized(
  scan: TupleScanOptions,
  indexColCount: number,
): NormalizedInterval {
  const normalized = normalizeTupleBounds(scan, indexColCount);

  let lower: Tuple;
  let lowerInclusive: boolean;
  if (normalized.gte) {
    lower = normalized.gte;
    lowerInclusive = true;
  } else if (normalized.gt) {
    lower = normalized.gt;
    lowerInclusive = false;
  } else {
    lower = Array(indexColCount).fill(MIN);
    lowerInclusive = true;
  }

  let upper: Tuple;
  let upperInclusive: boolean;
  if (normalized.lte) {
    upper = normalized.lte;
    upperInclusive = true;
  } else if (normalized.lt) {
    upper = normalized.lt;
    upperInclusive = false;
  } else {
    upper = Array(indexColCount).fill(MAX);
    upperInclusive = true;
  }

  return { lower, upper, lowerInclusive, upperInclusive };
}

export function recordToTuple(record: Row, indexCols: string[]): Tuple {
  return indexCols.map((col) => record[col] as ScanValue);
}

/**
 * Subtract cached intervals from requested intervals, returning only the
 * uncovered sub-intervals that need to be fetched from primary.
 *
 * Both `cached` and `requested` are assumed sorted and non-overlapping.
 */
export function subtractIntervals(
  cached: NormalizedInterval[],
  requested: NormalizedInterval[],
): NormalizedInterval[] {
  const uncovered: NormalizedInterval[] = [];

  for (const req of requested) {
    // Current cursor position — starts at the beginning of the requested interval
    let cursorPos = req.lower;
    let cursorInclusive = req.lowerInclusive;

    for (const c of cached) {
      // Skip cached intervals entirely before cursor
      const cmpCursorToUpper = compareTuples(cursorPos, c.upper);
      if (cmpCursorToUpper > 0) continue;
      if (cmpCursorToUpper === 0 && (!cursorInclusive || !c.upperInclusive)) {
        // Cursor is at upper boundary but one side is exclusive — no overlap
        if (!c.upperInclusive) continue;
      }

      // Skip cached intervals entirely after the requested interval
      const cmpCachedLowerToReqUpper = compareTuples(c.lower, req.upper);
      if (cmpCachedLowerToReqUpper > 0) break;
      if (
        cmpCachedLowerToReqUpper === 0 &&
        (!c.lowerInclusive || !req.upperInclusive)
      )
        break;

      // There's overlap — check if there's a gap before this cached interval
      const cmpCursorToCachedLower = compareTuples(cursorPos, c.lower);
      if (
        cmpCursorToCachedLower < 0 ||
        (cmpCursorToCachedLower === 0 &&
          cursorInclusive &&
          !c.lowerInclusive)
      ) {
        // Gap from cursor to start of cached interval
        uncovered.push({
          lower: cursorPos,
          upper: c.lower,
          lowerInclusive: cursorInclusive,
          upperInclusive: !c.lowerInclusive, // flip: if cached is inclusive, gap is exclusive
        });
      }

      // Advance cursor past the cached interval
      cursorPos = c.upper;
      cursorInclusive = !c.upperInclusive; // flip inclusivity
    }

    // Emit remaining gap from cursor to end of requested interval
    const cmpCursorToReqUpper = compareTuples(cursorPos, req.upper);
    if (
      cmpCursorToReqUpper < 0 ||
      (cmpCursorToReqUpper === 0 && cursorInclusive && req.upperInclusive)
    ) {
      uncovered.push({
        lower: cursorPos,
        upper: req.upper,
        lowerInclusive: cursorInclusive,
        upperInclusive: req.upperInclusive,
      });
    }
  }

  return uncovered;
}

/**
 * Convert a NormalizedInterval (with full indexCols including "id") back to a
 * WhereClause that works with baseCols only. This is a lossy conversion —
 * we lose "id" precision, making the query broader.
 *
 * Returns an empty object `{}` for fully unbounded intervals (all MIN/MAX).
 */
export function intervalToWhereClause(
  interval: NormalizedInterval,
  baseCols: string[],
): WhereClause {
  const baseLen = baseCols.length;
  const lowerBase = interval.lower.slice(0, baseLen);
  const upperBase = interval.upper.slice(0, baseLen);
  const lowerTrailing = interval.lower.slice(baseLen); // the "id" part(s)
  const upperTrailing = interval.upper.slice(baseLen);

  const clause: WhereClause = {};

  // --- Lower bound ---
  const allLowerMin = lowerBase.every((v) => v === MIN);
  if (!allLowerMin) {
    // Strip trailing MIN from lowerBase to get the actual values
    let effectiveLen = baseLen;
    while (effectiveLen > 0 && lowerBase[effectiveLen - 1] === MIN) {
      effectiveLen--;
    }

    if (effectiveLen > 0) {
      // Check if all trailing (id) parts are MAX — means we're past this baseCols value
      const allTrailingMax =
        lowerTrailing.length > 0 && lowerTrailing.every((v) => v === MAX);

      if (allTrailingMax && !interval.lowerInclusive) {
        // We're exclusive at (baseVal, MAX) meaning we're strictly past baseVal → use gt
        clause.gt = lowerBase
          .slice(0, effectiveLen)
          .map((val, i) => ({ col: baseCols[i], val: val as string | number | boolean | null }));
      } else if (allTrailingMax && interval.lowerInclusive) {
        // Inclusive at (baseVal, MAX) — but MAX id means we're at the very end of baseVal, so gt
        clause.gt = lowerBase
          .slice(0, effectiveLen)
          .map((val, i) => ({ col: baseCols[i], val: val as string | number | boolean | null }));
      } else {
        // Trailing parts are MIN or mixed — use gte (we need records with this baseCols value)
        clause.gte = lowerBase
          .slice(0, effectiveLen)
          .map((val, i) => ({ col: baseCols[i], val: val as string | number | boolean | null }));
      }
    }
  }

  // --- Upper bound ---
  const allUpperMax = upperBase.every((v) => v === MAX);
  if (!allUpperMax) {
    // Strip trailing MAX from upperBase to get the actual values
    let effectiveLen = baseLen;
    while (effectiveLen > 0 && upperBase[effectiveLen - 1] === MAX) {
      effectiveLen--;
    }

    if (effectiveLen > 0) {
      // Check if all trailing (id) parts are MIN — means we're before this baseCols value
      const allTrailingMin =
        upperTrailing.length > 0 && upperTrailing.every((v) => v === MIN);

      if (allTrailingMin && !interval.upperInclusive) {
        // Exclusive at (baseVal, MIN) — strictly before baseVal → use lt
        clause.lt = upperBase
          .slice(0, effectiveLen)
          .map((val, i) => ({ col: baseCols[i], val: val as string | number | boolean | null }));
      } else if (allTrailingMin && interval.upperInclusive) {
        // Inclusive at (baseVal, MIN) — but MIN id means very start of baseVal, so lt
        clause.lt = upperBase
          .slice(0, effectiveLen)
          .map((val, i) => ({ col: baseCols[i], val: val as string | number | boolean | null }));
      } else {
        // Trailing parts are MAX or mixed — use lte
        clause.lte = upperBase
          .slice(0, effectiveLen)
          .map((val, i) => ({ col: baseCols[i], val: val as string | number | boolean | null }));
      }
    }
  }

  return clause;
}
