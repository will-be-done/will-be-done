import { bench, describe } from "vitest";
import { compareTuple } from "../core/query/tuple";
import type { ScanValue } from "../core/primitives";
import { InMemoryBinaryPlusTree } from "./bptree";

const rowCount = 5_000;
const orderedKeys: ScanValue[][] = Array.from({ length: rowCount }, (_, i) => [
  `project-${i % 64}`,
  i % 3 === 0 ? "done" : "todo",
  i,
  `id-${i}`,
]);
const shuffledKeys = orderedKeys
  .map((key, index) => ({ key, sort: (index * 48271) % rowCount }))
  .sort((a, b) => a.sort - b.sort)
  .map((item) => item.key);

const buildTree = (minSize: number, maxSize: number) => {
  const tree = new InMemoryBinaryPlusTree<ScanValue[], number>(
    minSize,
    maxSize,
    compareTuple,
  );
  for (let i = 0; i < shuffledKeys.length; i++) {
    tree.set(shuffledKeys[i], i);
  }
  return tree;
};

let _treeSink: unknown;

describe("InMemoryBinaryPlusTree insert", () => {
  for (const [minSize, maxSize] of [
    [10, 20],
    [32, 64],
    [64, 128],
  ] as const) {
    bench(
      `bulk insert ${rowCount} rows, node ${minSize}/${maxSize}`,
      () => {
        _treeSink = buildTree(minSize, maxSize);
      },
      { time: 1000 },
    );
  }
});

describe("InMemoryBinaryPlusTree lookup", () => {
  for (const [minSize, maxSize] of [
    [10, 20],
    [32, 64],
    [64, 128],
  ] as const) {
    const tree = buildTree(minSize, maxSize);

    bench(
      `get ${rowCount} rows, node ${minSize}/${maxSize}`,
      () => {
        let found = 0;
        for (const key of orderedKeys) {
          if (tree.get(key) !== undefined) found++;
        }
        _treeSink = found;
      },
      { time: 1000 },
    );
  }
});
