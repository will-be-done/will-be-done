import { expect, test } from "bun:test";
import {
  createSectionTask,
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
  const { space, projectSection, task, options } = await createTaskFixture(
    await createAuthorization(),
  );
  expectResponseStatus(
    await scheduleTask(space.id, task.id, { date: "2036-04-05" }, options),
    200,
  );
  const secondTask = expectResponseStatus(
    await createSectionTask(
      space.id,
      projectSection.id,
      { title: "Second scheduled task" },
      options,
    ),
    201,
  ).data.task;
  expectResponseStatus(
    await scheduleTask(
      space.id,
      secondTask.id,
      { date: "2036-04-06" },
      options,
    ),
    200,
  );

  const lists = await coverOperation(
    "listDailyLists",
    listDailyLists(
      space.id,
      {
        from: "2036-04-01",
        to: "2036-04-10",
        state: "todo",
        limit: 1,
      },
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
  expect(lists.data.nextCursor).not.toBeNull();
  const nextLists = expectResponseStatus(
    await listDailyLists(
      space.id,
      {
        from: "2036-04-01",
        to: "2036-04-10",
        state: "todo",
        limit: 1,
        cursor: lists.data.nextCursor!,
      },
      options,
    ),
    200,
  );
  expect(nextLists.data.dailyLists).toContainEqual(
    expect.objectContaining({
      date: "2036-04-06",
      items: expect.arrayContaining([
        expect.objectContaining({ id: secondTask.id }),
      ]),
    }),
  );
  expect(nextLists.data.nextCursor).toBeNull();

  const items = await coverOperation(
    "listDailyListItems",
    listDailyListItems(space.id, "2036-04-05", { state: "todo" }, options),
    200,
  );
  expect(items.data.items.map(({ id }) => id)).toContain(task.id);
});
