import { expect, test } from "bun:test";
import {
  clearTaskSchedule,
  createProjectSection,
  createSectionTask,
  deleteTask,
  getTask,
  listScheduledTasks,
  listTasks,
  moveTask,
  scheduleTask,
  updateTask,
} from "../generated/v1-client";
import {
  createAuthorization,
  createSectionFixture,
  expectResponseStatus,
} from "./harness";
import { coverOperation } from "./operationCoverage";

test("covers every task operation, including pagination and scheduling", async () => {
  const { space, project, projectSection, options } =
    await createSectionFixture(await createAuthorization());

  const created = await coverOperation(
    "createSectionTask",
    createSectionTask(
      space.id,
      projectSection.id,
      {
        title: "Task A",
        content: "Task content",
        nature: "red",
        placement: { kind: "last" },
      },
      options,
    ),
    201,
  );
  const taskA = created.data.task;
  const taskB = expectResponseStatus(
    await createSectionTask(
      space.id,
      projectSection.id,
      { title: "Task B" },
      options,
    ),
    201,
  ).data.task;
  const taskC = expectResponseStatus(
    await createSectionTask(
      space.id,
      projectSection.id,
      { title: "Task C" },
      options,
    ),
    201,
  ).data.task;

  const listed = await coverOperation(
    "listTasks",
    listTasks(space.id, { limit: 1 }, options),
    200,
  );
  expect(listed.data.tasks).toHaveLength(1);
  expect(listed.data.nextCursor).not.toBeNull();
  if (listed.data.nextCursor) {
    const nextPage = expectResponseStatus(
      await listTasks(
        space.id,
        { limit: 1, cursor: listed.data.nextCursor },
        options,
      ),
      200,
    );
    expect(nextPage.data.tasks[0]?.id).not.toBe(listed.data.tasks[0]?.id);
  }

  const fetched = await coverOperation(
    "getTask",
    getTask(space.id, taskA.id, options),
    200,
  );
  expect(fetched.data.task.content).toBe("Task content");

  const updated = await coverOperation(
    "updateTask",
    updateTask(
      space.id,
      taskA.id,
      { title: "Updated task", content: "Updated content", nature: "green" },
      options,
    ),
    200,
  );
  expect(updated.data.task).toMatchObject({
    title: "Updated task",
    content: "Updated content",
    nature: "green",
  });

  const destination = expectResponseStatus(
    await createProjectSection(
      space.id,
      project.id,
      { title: "Task destination" },
      options,
    ),
    201,
  ).data.section;
  const moved = await coverOperation(
    "moveTask",
    moveTask(
      space.id,
      taskA.id,
      {
        projectSectionId: destination.id,
        placement: { kind: "first" },
      },
      options,
    ),
    200,
  );
  expect(moved.data.task.projectSectionId).toBe(destination.id);

  const scheduled = await coverOperation(
    "scheduleTask",
    scheduleTask(space.id, taskA.id, { date: "2035-01-03" }, options),
    200,
  );
  expect(scheduled.data).toMatchObject({ date: "2035-01-03" });
  expect(scheduled.data.task.scheduledDate).toBe("2035-01-03");

  const upcoming = await coverOperation(
    "listScheduledTasks",
    listScheduledTasks(
      space.id,
      {
        scope: "upcoming",
        relativeTo: "2035-01-02",
        to: "2035-01-04",
        limit: 1,
      },
      options,
    ),
    200,
  );
  expect(upcoming.data.tasks.map(({ id }) => id)).toContain(taskA.id);

  await coverOperation(
    "clearTaskSchedule",
    clearTaskSchedule(space.id, taskA.id, options),
    204,
  );
  const unscheduled = expectResponseStatus(
    await getTask(space.id, taskA.id, options),
    200,
  );
  expect(unscheduled.data.task.scheduledDate).toBeNull();

  expectResponseStatus(
    await scheduleTask(space.id, taskA.id, { date: "2035-01-04" }, options),
    200,
  );
  expect(
    expectResponseStatus(await getTask(space.id, taskA.id, options), 200).data
      .task.scheduledDate,
  ).toBe("2035-01-04");

  await coverOperation(
    "deleteTask",
    deleteTask(space.id, taskC.id, options),
    204,
  );
  expect((await getTask(space.id, taskC.id, options)).status).toBe(404);
  expect(taskB.id).not.toBe(taskA.id);
});
