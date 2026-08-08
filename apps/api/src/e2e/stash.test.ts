import { expect, test } from "bun:test";
import {
  createSectionTask,
  createStashTask,
  getTask,
  listStashTasks,
  putTaskInStash,
  removeTaskFromStash,
} from "../generated/v1-client";
import {
  createAuthorization,
  createSectionFixture,
  expectResponseStatus,
} from "./harness";
import { coverOperation } from "./operationCoverage";

test("covers every stash operation", async () => {
  const { space, projectSection, options } = await createSectionFixture(
    await createAuthorization(),
  );

  const created = await coverOperation(
    "createStashTask",
    createStashTask(
      space.id,
      {
        title: "Created in stash",
        content: "Stash content",
        nature: "green",
      },
      options,
    ),
    201,
  );
  const stashTask = created.data.task;

  const listed = await coverOperation(
    "listStashTasks",
    listStashTasks(space.id, { state: "todo" }, options),
    200,
  );
  expect(listed.data.tasks.map(({ id }) => id)).toContain(stashTask.id);

  const sectionTask = expectResponseStatus(
    await createSectionTask(
      space.id,
      projectSection.id,
      { title: "Put in stash" },
      options,
    ),
    201,
  ).data.task;
  const put = await coverOperation(
    "putTaskInStash",
    putTaskInStash(
      space.id,
      sectionTask.id,
      { placement: { kind: "first" } },
      options,
    ),
    200,
  );
  expect(put.data.task.id).toBe(sectionTask.id);
  const reordered = expectResponseStatus(
    await listStashTasks(space.id, { state: "todo" }, options),
    200,
  ).data.tasks;
  expect(reordered[0]?.id).toBe(sectionTask.id);

  await coverOperation(
    "removeTaskFromStash",
    removeTaskFromStash(space.id, sectionTask.id, options),
    204,
  );
  const afterRemoval = expectResponseStatus(
    await listStashTasks(space.id, { state: "todo" }, options),
    200,
  );
  expect(afterRemoval.data.tasks.map(({ id }) => id)).not.toContain(
    sectionTask.id,
  );
  expectResponseStatus(
    await putTaskInStash(space.id, sectionTask.id, {}, options),
    200,
  );
  expect(
    expectResponseStatus(
      await listStashTasks(space.id, { state: "todo" }, options),
      200,
    ).data.tasks.map(({ id }) => id),
  ).toContain(sectionTask.id);
  expect((await getTask(space.id, sectionTask.id, options)).status).toBe(200);
});
