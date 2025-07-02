import { strict as assert } from "assert";
import { describe, it } from "vitest";
import {
  insertAfter,
  insertBefore,
  orderedArray,
  searchFirst,
  searchLast,
} from "./ordered-array";

describe("ordered array", () => {
  const { search, insert, update, remove } = orderedArray<
    { key: number; value: number },
    number
  >((item) => item.key);

  it("works", () => {
    const array = [
      { key: 0, value: 0 },
      { key: 1, value: 1 },
      { key: 2, value: 2 },
      { key: 3, value: 3 },
      { key: 4, value: 4 },
    ];

    // Find key: 2
    let result = search(array, 2);
    assert.equal(result.found, 2);

    // Find key: 2.5
    result = search(array, 2.5);
    assert.equal(result.closest, 3);

    // Insert into the array.
    insert(array, { key: 2.5, value: 2.5 });
    assert.deepEqual(array, [
      { key: 0, value: 0 },
      { key: 1, value: 1 },
      { key: 2, value: 2 },
      { key: 2.5, value: 2.5 },
      { key: 3, value: 3 },
      { key: 4, value: 4 },
    ]);

    // Remove from the array.
    remove(array, 3);
    assert.deepEqual(array, [
      { key: 0, value: 0 },
      { key: 1, value: 1 },
      { key: 2, value: 2 },
      { key: 2.5, value: 2.5 },
      { key: 4, value: 4 },
    ]);

    // Update-replace an item in the array.
    update(array, 1, (item) => {
      if (item) return { ...item, value: item.value * 2 };
      else throw new Error("Broken.");
    });
    assert.deepEqual(array, [
      { key: 0, value: 0 },
      { key: 1, value: 2 },
      { key: 2, value: 2 },
      { key: 2.5, value: 2.5 },
      { key: 4, value: 4 },
    ]);

    // Update-insert an item in the array.
    update(array, 1.5, (item) => {
      if (item) throw new Error("Broken.");
      else return { key: 1.5, value: 3 };
    });
    assert.deepEqual(array, [
      { key: 0, value: 0 },
      { key: 1, value: 2 },
      { key: 1.5, value: 3 },
      { key: 2, value: 2 },
      { key: 2.5, value: 2.5 },
      { key: 4, value: 4 },
    ]);

    // Update-insert-if-does-not-exist an item in the array.
    update(array, 0.5, (item) => {
      if (item) throw new Error("Broken.");
      else return { key: 0.5, value: 1 };
    });
    assert.deepEqual(array, [
      { key: 0, value: 0 },
      { key: 0.5, value: 1 },
      { key: 1, value: 2 },
      { key: 1.5, value: 3 },
      { key: 2, value: 2 },
      { key: 2.5, value: 2.5 },
      { key: 4, value: 4 },
    ]);

    // Update-only-if-exists an item in the array.
    // Case 1: item exists
    update(array, 0.5, (item) => {
      if (item) return { ...item, value: item.value * 2 };
      else throw new Error("Broken.");
    });
    assert.deepEqual(array, [
      { key: 0, value: 0 },
      { key: 0.5, value: 2 },
      { key: 1, value: 2 },
      { key: 1.5, value: 3 },
      { key: 2, value: 2 },
      { key: 2.5, value: 2.5 },
      { key: 4, value: 4 },
    ]);
    // Case 2: item does not exist
    update(array, 0.25, (item) => {
      if (item) throw new Error("Broken.");
    });
    assert.deepEqual(array, [
      { key: 0, value: 0 },
      { key: 0.5, value: 2 },
      { key: 1, value: 2 },
      { key: 1.5, value: 3 },
      { key: 2, value: 2 },
      { key: 2.5, value: 2.5 },
      { key: 4, value: 4 },
    ]);
  });

  it("property test", () => {
    const numbers = randomNumbers(200);

    const a: { key: number; value: number }[] = [];
    const b: { key: number; value: number }[] = [];

    for (let i = 0; i < numbers.length; i++) {
      // insert
      const n = numbers[i];
      a.push({ key: n, value: n });
      a.sort((a, b) => a.key - b.key);
      insert(b, { key: n, value: n });
      assert.deepEqual(a, b);

      // For every other value currently in the array.
      for (let j = 0; j < i; j++) {
        const m = numbers[j];
        // search
        assert.equal(
          a.findIndex((x) => x.key === m),
          search(a, m).found,
        );
        assert.equal(
          a.findIndex((x) => x.key === m) + 1,
          search(a, m - 0.1).closest,
        );
        assert.equal(
          a.findIndex((x) => x.key === m),
          search(a, m + 0.1).closest,
        );

        // upsert - update
        let aa = a.map((x) => (x.key === m ? { key: m, value: m * 2 } : x));
        const bb = [...b];
        update(bb, m, (x) => {
          if (x) return { ...x, value: x.value * 2 };
          else throw new Error("Broken.");
        });
        assert.deepEqual(aa, bb);

        // remove
        aa = aa.filter((x) => x.key !== m);
        remove(bb, m);
        assert.deepEqual(aa, bb);

        // upsert - insert
        aa.push({ key: m, value: m * 3 });
        aa.sort((a, b) => a.key - b.key);
        update(bb, m, (x) => {
          if (x) throw new Error("Broken.");
          else return { key: m, value: m * 3 };
        });
        assert.deepEqual(aa, bb);
      }
    }
  });

  it("searchLast", () => {
    const log = [
      { key: 1, value: 1 },
      { key: 2, value: 1 },
      { key: 3, value: 1 },
    ];
    {
      const result = searchLast(log, 2, ({ key }) => key);
      log.splice(result.found! + 1, 0, { key: 2, value: 2 });
    }
    {
      const result = searchLast(log, 2, ({ key }) => key);
      log.splice(result.found! + 1, 0, { key: 2, value: 3 });
    }
    {
      const result = searchLast(log, 3, ({ key }) => key);
      log.splice(result.found! + 1, 0, { key: 3, value: 2 });
    }

    assert.deepEqual(log, [
      { key: 1, value: 1 },
      { key: 2, value: 1 },
      { key: 2, value: 2 },
      { key: 2, value: 3 },
      { key: 3, value: 1 },
      { key: 3, value: 2 },
    ]);
  });

  it("insertAfter", () => {
    const log = [
      { key: 1, value: 1 },
      { key: 2, value: 1 },
      { key: 3, value: 1 },
    ];
    insertAfter(log, { key: 2, value: 2 }, ({ key }) => key);
    insertAfter(log, { key: 2, value: 3 }, ({ key }) => key);
    insertAfter(log, { key: 3, value: 2 }, ({ key }) => key);

    assert.deepEqual(log, [
      { key: 1, value: 1 },
      { key: 2, value: 1 },
      { key: 2, value: 2 },
      { key: 2, value: 3 },
      { key: 3, value: 1 },
      { key: 3, value: 2 },
    ]);
  });

  it("searchLast", () => {
    const log = [
      { key: 1, value: 1 },
      { key: 2, value: 1 },
      { key: 3, value: 1 },
    ];
    {
      const result = searchFirst(log, 2, ({ key }) => key);
      log.splice(result.found!, 0, { key: 2, value: 2 });
    }
    {
      const result = searchFirst(log, 2, ({ key }) => key);
      log.splice(result.found!, 0, { key: 2, value: 3 });
    }
    {
      const result = searchFirst(log, 3, ({ key }) => key);
      log.splice(result.found!, 0, { key: 3, value: 2 });
    }

    assert.deepEqual(log, [
      { key: 1, value: 1 },
      { key: 2, value: 3 },
      { key: 2, value: 2 },
      { key: 2, value: 1 },
      { key: 3, value: 2 },
      { key: 3, value: 1 },
    ]);
  });

  it("insertBefore", () => {
    const log = [
      { key: 1, value: 1 },
      { key: 2, value: 1 },
      { key: 3, value: 1 },
    ];
    insertBefore(log, { key: 2, value: 2 }, ({ key }) => key);
    insertBefore(log, { key: 2, value: 3 }, ({ key }) => key);
    insertBefore(log, { key: 3, value: 2 }, ({ key }) => key);

    assert.deepEqual(log, [
      { key: 1, value: 1 },
      { key: 2, value: 3 },
      { key: 2, value: 2 },
      { key: 2, value: 1 },
      { key: 3, value: 2 },
      { key: 3, value: 1 },
    ]);
  });

  it("generic types", () => {
    const { insert } = orderedArray((item: { key: number }) => item.key);

    const list1: { key: number; value: string }[] = [];
    const list2: { key: number; id: string; value: number }[] = [];

    insert(list1, { key: 1, value: "" });
    insert(list2, { key: 1, value: 2, id: "" });
  });
});

const randomNumbers = (n: number) =>
  uniq(
    Array(n)
      .fill(0)
      .map(() => Math.floor(Math.random() * n * 2)),
  );

const uniq = (list: number[]) => {
  const seen = new Set<number>(list);
  return list.filter((n) => {
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
};
