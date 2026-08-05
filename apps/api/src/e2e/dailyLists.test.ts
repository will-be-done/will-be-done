import { expect, test } from "bun:test";
import {
  listDailyListItems,
  listDailyLists,
  scheduleTask,
} from "../generated/v1-client";
import {
  createAuthorization,
  createTaskFixture,
  expectResponseStatus,
} from "./harness";
import { coverOperation } from "./operationCoverage";

test("covers every daily-list operation", async () => {
  const { space, task, options } = await createTaskFixture(
    createAuthorization(),
  );
  expectResponseStatus(
    await scheduleTask(space.id, task.id, { date: "2036-04-05" }, options),
    200,
  );

  const lists = await coverOperation(
    "listDailyLists",
    listDailyLists(
      space.id,
      { from: "2036-04-01", to: "2036-04-10", state: "todo" },
      options,
    ),
    200,
  );
  expect(lists.data.dailyLists).toContainEqual(
    expect.objectContaining({
      date: "2036-04-05",
      items: expect.arrayContaining([expect.objectContaining({ id: task.id })]),
    }),
  );

  const items = await coverOperation(
    "listDailyListItems",
    listDailyListItems(space.id, "2036-04-05", { state: "todo" }, options),
    200,
  );
  expect(items.data.items.map(({ id }) => id)).toContain(task.id);
});
