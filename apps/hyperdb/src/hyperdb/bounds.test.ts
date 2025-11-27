 

import { describe, expect, it } from "vitest";
import { convertWhereToBound } from "./bounds";
import { MAX, MIN } from "./db";

const cols = ["id", "title", "author"];

// when last col gte = uses MIN to fill remaining gaps if no other further columns present
// when last col gt = use MAX to fill remaining gaps if no other further columns present
// when last col lte = use MAX to fill remaining gaps if no other further columns present
// when last col lt = use MIN to fill remaining gaps if no other further columns present

describe("bounds", () => {
  // FIXED: Your original equality tests have wrong bounds
  it("works with eq", () => {
    expect(
      convertWhereToBound(cols, [
        {
          eq: [
            {
              col: "id",
              val: 1,
            },
          ],
          gte: [],
          gt: [],
          lte: [],
          lt: [],
        },
      ]),
    ).toEqual([
      {
        // FIXED: For equality, both gte and lte should be the same value
        gte: [1, MIN, MIN],
        lte: [1, MAX, MAX],
      },
    ]);

    expect(
      convertWhereToBound(
        ["id"],
        [
          {
            eq: [
              {
                col: "id",
                val: 1,
              },
            ],
            gte: [],
            gt: [],
            lte: [],
            lt: [],
          },
        ],
      ),
    ).toEqual([
      {
        gte: [1],
        lte: [1],
      },
    ]);

    expect(
      convertWhereToBound(
        ["id"],
        [
          {
            eq: [],
            gte: [
              {
                col: "id",
                val: 1,
              },
            ],
            gt: [],
            lte: [
              {
                col: "id",
                val: 1,
              },
            ],
            lt: [],
          },
        ],
      ),
    ).toEqual([
      {
        gte: [1],
        lte: [1],
      },
    ]);

    // This should error - can't use title without id
    expect(() =>
      convertWhereToBound(cols, [
        {
          eq: [
            {
              col: "title",
              val: "wow",
            },
          ],
          gte: [],
          gt: [],
          lte: [],
          lt: [],
        },
      ]),
    ).toThrow();
  });

  // FIXED: Your lt tests have issues
  it("works with lt", () => {
    expect(
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [],
          gt: [],
          lte: [],
          lt: [
            {
              col: "id",
              val: 1,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        // FIXED: For lt, should be MIN to exclude the value itself
        lt: [1, MIN, MIN],
      },
    ]);

    // This should error - can't use title without id
    expect(() =>
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [],
          gt: [],
          lte: [],
          lt: [
            {
              col: "title",
              val: "wow",
            },
          ],
        },
      ]),
    ).toThrow();
  });

  // NEW: Test gt conditions
  it("works with gt", () => {
    expect(
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [],
          gt: [
            {
              col: "id",
              val: 5,
            },
          ],
          lte: [],
          lt: [],
        },
      ]),
    ).toEqual([
      {
        gt: [5, MAX, MAX],
      },
    ]);
  });

  // NEW: Test gte conditions
  it("works with gte", () => {
    expect(
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [
            {
              col: "id",
              val: 5,
            },
          ],
          gt: [],
          lte: [],
          lt: [],
        },
      ]),
    ).toEqual([
      {
        gte: [5, MIN, MIN],
      },
    ]);
  });

  // NEW: Test lte conditions
  it("works with lte", () => {
    expect(
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [],
          gt: [],
          lte: [
            {
              col: "id",
              val: 10,
            },
          ],
          lt: [],
        },
      ]),
    ).toEqual([
      {
        lte: [10, MAX, MAX],
      },
    ]);
  });

  // NEW: Test prefix matching - equality conditions allow using next column
  it("works with equality prefix matching", () => {
    expect(
      convertWhereToBound(cols, [
        {
          eq: [
            {
              col: "id",
              val: 1,
            },
            {
              col: "title",
              val: "book",
            },
          ],
          gte: [],
          gt: [],
          lte: [],
          lt: [],
        },
      ]),
    ).toEqual([
      {
        gte: [1, "book", MIN],
        lte: [1, "book", MAX],
      },
    ]);
  });

  // NEW: Test mixed conditions with proper prefix usage
  it("works with mixed eq and range conditions", () => {
    expect(
      convertWhereToBound(cols, [
        {
          eq: [
            {
              col: "id",
              val: 1,
            },
          ],
          gte: [
            {
              col: "title",
              val: "A",
            },
          ],
          gt: [],
          lte: [
            {
              col: "title",
              val: "Z",
            },
          ],
          lt: [],
        },
      ]),
    ).toEqual([
      {
        gte: [1, "A", MIN],
        lte: [1, "Z", MAX],
      },
    ]);
  });

  // NEW: Test range conditions that terminate usable prefix
  it("handles range conditions that break prefix chain", () => {
    // Once id has a range condition, author conditions should be ignored
    // This should work - only use the id condition
    expect(
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [
            {
              col: "id",
              val: 5,
            },
          ],
          gt: [],
          lte: [],
          lt: [],
        },
      ]),
    ).toEqual([
      {
        gte: [5, MIN, MIN],
      },
    ]);

    // But this should error - can't skip title and go to author
    expect(() =>
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [
            {
              col: "id",
              val: 5,
            },
          ],
          gt: [],
          lte: [],
          lt: [
            {
              col: "author", // This should error - can't skip title
              val: "Smith",
            },
          ],
        },
      ]),
    ).toThrow();
  });

  // // NEW: Test impossible conditions
  // it("throws error for impossible conditions", () => {
  //   expect(() =>
  //     convertWhereToBound(cols, [
  //       {
  //         eq: [],
  //         gte: [
  //           {
  //             col: "id",
  //             val: "10",
  //           },
  //         ],
  //         gt: [],
  //         lte: [],
  //         lt: [
  //           {
  //             col: "id",
  //             val: "5",
  //           },
  //         ],
  //       },
  //     ]),
  //   ).toThrow(); // Should throw error for impossible conditions
  // });

  // NEW: Test same column with compatible range conditions
  it("handles same column with compatible ranges", () => {
    expect(
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [
            {
              col: "id",
              val: 5,
            },
          ],
          gt: [],
          lte: [
            {
              col: "id",
              val: 15,
            },
          ],
          lt: [],
        },
      ]),
    ).toEqual([
      {
        gte: [5, MIN, MIN],
        lte: [15, MAX, MAX],
      },
    ]);

    expect(
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [],
          gt: [
            {
              col: "id",
              val: 5,
            },
          ],
          lte: [],
          lt: [
            {
              col: "id",
              val: 15,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        gt: [5, MAX, MAX],
        lt: [15, MIN, MIN],
      },
    ]);
  });

  // NEW: Test gt and lt on same column
  it("handles gt and lt on same column", () => {
    expect(
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [],
          gt: [
            {
              col: "id",
              val: 5,
            },
          ],
          lte: [],
          lt: [
            {
              col: "id",
              val: 15,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        gt: [5, MAX, MAX],
        lt: [15, MIN, MIN],
      },
    ]);
  });

  // NEW: Test error cases - conditions that can't use index efficiently
  it("throws error for non-prefix column conditions", () => {
    // title condition without id condition should error
    expect(() =>
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [],
          gt: [],
          lte: [],
          lt: [
            {
              col: "title",
              val: "wow",
            },
          ],
        },
      ]),
    ).toThrow();

    // author condition without id/title conditions should error
    expect(() =>
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [],
          gt: [],
          lte: [
            {
              col: "author",
              val: "Smith",
            },
          ],
          lt: [],
        },
      ]),
    ).toThrow();

    // Mixed conditions that break prefix rule should error
    expect(() =>
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [],
          gt: [],
          lte: [
            {
              col: "author",
              val: "Sergey",
            },
          ],
          lt: [
            {
              col: "title",
              val: "wow",
            },
          ],
        },
      ]),
    ).toThrow();
  });

  // NEW: Test multiple WHERE clauses (OR conditions)
  it("handles multiple WHERE clauses", () => {
    expect(
      convertWhereToBound(cols, [
        {
          eq: [
            {
              col: "id",
              val: 1,
            },
          ],
          gte: [],
          gt: [],
          lte: [],
          lt: [],
        },
        {
          eq: [
            {
              col: "id",
              val: 2,
            },
          ],
          gte: [],
          gt: [],
          lte: [],
          lt: [],
        },
      ]),
    ).toEqual([
      {
        gte: [1, MIN, MIN],
        lte: [1, MAX, MAX],
      },
      {
        gte: [2, MIN, MIN],
        lte: [2, MAX, MAX],
      },
    ]);
  });

  // NEW: Test column not in index
  it("throws error for columns not in index", () => {
    expect(() =>
      convertWhereToBound(cols, [
        {
          eq: [
            {
              col: "nonexistent",
              val: "value",
            },
          ],
          gte: [],
          gt: [],
          lte: [],
          lt: [],
        },
      ]),
    ).toThrow(); // Should throw error since column not in index
  });

  // NEW: Test empty conditions
  // it("throws error for empty conditions", () => {
  //   expect(() =>
  //     convertWhereToBound(cols, [
  //       {
  //         eq: [],
  //         gte: [],
  //         gt: [],
  //         lte: [],
  //         lt: [],
  //       },
  //     ]),
  //   ).toThrow(); // Should throw error for empty conditions (can't use index)
  // });

  // NEW: Test valid prefix usage - can use subsequent columns after equality
  it("allows conditions on subsequent columns after equality", () => {
    // id = 1 AND title < "wow" should work
    expect(
      convertWhereToBound(cols, [
        {
          eq: [
            {
              col: "id",
              val: 1,
            },
          ],
          gte: [],
          gt: [],
          lte: [],
          lt: [
            {
              col: "title",
              val: "wow",
            },
          ],
        },
      ]),
    ).toEqual([
      {
        gte: [1, MIN, MIN],
        lt: [1, "wow", MIN],
      },
    ]);

    // id = 1 AND title = "book" AND author >= "A" should work
    expect(
      convertWhereToBound(cols, [
        {
          eq: [
            {
              col: "id",
              val: 1,
            },
            {
              col: "title",
              val: "book",
            },
          ],
          gte: [
            {
              col: "author",
              val: "A",
            },
          ],
          gt: [],
          lte: [],
          lt: [],
        },
      ]),
    ).toEqual([
      {
        gte: [1, "book", "A"],
        lte: [1, "book", MAX],
      },
    ]);
  });

  // NEW: Test conflicting conditions on same column
  it("throws error for conflicting equality conditions", () => {
    expect(() =>
      convertWhereToBound(cols, [
        {
          eq: [
            {
              col: "id",
              val: 1,
            },
          ],
          gte: [
            {
              col: "id",
              val: 5,
            },
          ],
          gt: [],
          lte: [],
          lt: [],
        },
      ]),
    ).toThrow(); // Should throw error - can't be equal to 1 AND >= 5
  });

  // NEW: Test range that spans multiple tuples
  it("handles wide range conditions", () => {
    expect(
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [
            {
              col: "id",
              val: 1,
            },
          ],
          gt: [],
          lte: [
            {
              col: "id",
              val: 100,
            },
          ],
          lt: [],
        },
      ]),
    ).toEqual([
      {
        gte: [1, MIN, MIN],
        lte: [100, MAX, MAX],
      },
    ]);
  });

  it("handles eq and lt/gt", () => {
    expect(() =>
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [
            {
              col: "title",
              val: 1,
            },
          ],
          gt: [],
          lte: [
            {
              col: "title",
              val: 100,
            },
          ],
          lt: [],
        },
      ]),
    ).toThrow();

    expect(() =>
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [],
          gt: [
            {
              col: "id",
              val: 1,
            },
            {
              col: "title",
              val: "hello",
            },
          ],
          lte: [],
          lt: [
            {
              col: "id",
              val: 100,
            },
          ],
        },
      ]),
    ).toThrow();

    expect(
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [
            {
              col: "id",
              val: 1,
            },
          ],
          gt: [],
          lt: [
            {
              col: "title",
              val: "hello",
            },
          ],
          lte: [
            {
              col: "id",
              val: 1,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        gte: [1, MIN, MIN],
        lt: [1, "hello", MIN],
      },
    ]);

    expect(
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [
            {
              col: "id",
              val: 1,
            },
          ],
          gt: [],
          lt: [],
          lte: [
            {
              col: "title",
              val: "hello",
            },
            {
              col: "id",
              val: 1,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        gte: [1, MIN, MIN],
        lte: [1, "hello", MAX],
      },
    ]);

    expect(() =>
      convertWhereToBound(cols, [
        {
          eq: [],
          gte: [
            {
              col: "id",
              val: 1,
            },
          ],
          gt: [],
          lt: [],
          lte: [
            {
              col: "title",
              val: "hello",
            },
            {
              col: "id",
              val: 1,
            },
            {
              col: "author",
              val: "kek",
            },
          ],
        },
      ]),
    ).toThrow();
  });
});
