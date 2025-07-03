import { test } from "vitest";

const scan = function* () {
  const a = yield {
    command: "doScan",
    args: {
      table: "tasks",
      index: "ids",
      options: {
        gte: ["1"],
        lte: ["1"],
      },
    },
  };
  console.log("a", a);
};

const genB = function* () {
  yield* scan();
  yield* scan();
  yield* scan();
  yield 2;
  yield 3;
};

const genA = function* () {
  yield* genB();
  yield 2;
  yield 3;
};

test("works with generators", () => {
  const gen = genA();
  let result = gen.next();

  while (!result.done) {
    if (result.value?.command === "doScan") {
      result = gen.next("123"); // Send value back to generator
    } else {
      result = gen.next(); // Continue without sending value
    }
  }
});
