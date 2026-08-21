import { expect, test } from "bun:test";
import {
  deleteDailyReport,
  getDailyReport,
  listDailyReports,
  putDailyReport,
  scheduleTask,
  updateTask,
} from "../generated/v1-client";
import {
  createAuthorization,
  createTaskFixture,
  expectResponseStatus,
} from "./harness";
import { coverOperation } from "./operationCoverage";

test("covers every daily-report operation", async () => {
  const { space, task, options } = await createTaskFixture(
    await createAuthorization(),
  );
  expectResponseStatus(
    await scheduleTask(space.id, task.id, { date: "2036-08-21" }, options),
    200,
  );
  expectResponseStatus(
    await updateTask(space.id, task.id, { state: "done" }, options),
    200,
  );

  const created = await coverOperation(
    "putDailyReport",
    putDailyReport(
      space.id,
      "2036-08-21",
      {
        notes: "Shipped the day",
        mood: 4,
        energy: 3,
        focus: 5,
        accomplishment: 4,
      },
      options,
    ),
    200,
  );
  expect(created.data.dailyReport).toMatchObject({
    date: "2036-08-21",
    notes: "Shipped the day",
    mood: 4,
    energy: 3,
    focus: 5,
    accomplishment: 4,
    completedTasks: [{ id: task.id, title: task.title }],
  });

  const fetched = await coverOperation(
    "getDailyReport",
    getDailyReport(space.id, "2036-08-21", options),
    200,
  );
  expect(fetched.data.dailyReport.notes).toBe("Shipped the day");

  expectResponseStatus(
    await putDailyReport(
      space.id,
      "2036-08-20",
      { notes: "Earlier day", mood: 2 },
      options,
    ),
    200,
  );

  const listed = await coverOperation(
    "listDailyReports",
    listDailyReports(
      space.id,
      {
        from: "2036-08-01",
        to: "2036-08-31",
        limit: 1,
      },
      options,
    ),
    200,
  );
  expect(listed.data.dailyReports).toEqual([
    expect.objectContaining({ date: "2036-08-21" }),
  ]);
  expect(listed.data.nextCursor).not.toBeNull();
  const nextPage = expectResponseStatus(
    await listDailyReports(
      space.id,
      {
        from: "2036-08-01",
        to: "2036-08-31",
        limit: 1,
        cursor: listed.data.nextCursor!,
      },
      options,
    ),
    200,
  );
  expect(nextPage.data.dailyReports).toEqual([
    expect.objectContaining({ date: "2036-08-20" }),
  ]);
  expect(nextPage.data.nextCursor).toBeNull();

  await coverOperation(
    "deleteDailyReport",
    deleteDailyReport(space.id, "2036-08-21", options),
    204,
  );
  expectResponseStatus(
    await getDailyReport(space.id, "2036-08-21", options),
    404,
  );
});
