import { bench, describe } from "vitest";
import { MAX, MIN, type ScanValue } from "../primitives";
import { compareTuple } from "./tuple";

const tupleCount = 10_000;
const stringTuples: [ScanValue[], ScanValue[]][] = Array.from(
  { length: tupleCount },
  (_, i) => [
    [`project-${i % 64}`, i % 3 === 0 ? "done" : "todo", i, `id-${i}`],
    [
      `project-${(i + 17) % 64}`,
      i % 5 === 0 ? "done" : "todo",
      i + 1,
      `id-${i + 1}`,
    ],
  ],
);

const sharedPrefixTuples: [ScanValue[], ScanValue[]][] = Array.from(
  { length: tupleCount },
  (_, i) => [
    [`project-${i % 64}`, i % 3 === 0 ? "done" : "todo", i, `id-${i}`],
    [
      `project-${i % 64}`,
      i % 3 === 0 ? "done" : "todo",
      i + 1,
      `id-${i + 1}`,
    ],
  ],
);

const mixedTuples: [ScanValue[], ScanValue[]][] = Array.from(
  { length: tupleCount },
  (_, i) => [
    [i % 4 === 0 ? null : i, i % 2 === 0, `title-${i % 128}`, MIN],
    [i % 7 === 0 ? null : i + 1, i % 3 === 0, `title-${(i + 3) % 128}`, MAX],
  ],
);

let _compareSink = 0;

describe("compareTuple", () => {
  bench(
    "string/number index tuples",
    () => {
      let result = 0;
      for (const [left, right] of stringTuples) {
        result += compareTuple(left, right);
      }
      _compareSink = result;
    },
    { time: 1000 },
  );

  bench(
    "shared-prefix index tuples",
    () => {
      let result = 0;
      for (const [left, right] of sharedPrefixTuples) {
        result += compareTuple(left, right);
      }
      _compareSink = result;
    },
    { time: 1000 },
  );

  bench(
    "mixed tuples with null/virtual values",
    () => {
      let result = 0;
      for (const [left, right] of mixedTuples) {
        result += compareTuple(left, right);
      }
      _compareSink = result;
    },
    { time: 1000 },
  );
});
