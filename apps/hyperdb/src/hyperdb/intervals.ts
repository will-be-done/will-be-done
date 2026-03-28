import type { Row, ScanValue, Tuple, TupleScanOptions } from "./db";
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
