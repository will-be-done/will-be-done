import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import { updateSpace as updateSpaceAction } from "@will-be-done/slices/user";
import { updateTask as updateTaskAction } from "@will-be-done/slices/space";
import { getHyperDB, getMainHyperDB } from "../db/db";
import { spaceDBConfig, userDBConfig } from "../db/configs";
import { getTokenById } from "../slices/authSlice";
import { expect, test } from "bun:test";
import {
  createSectionTask,
  createSpace,
  listSpaces,
  listTasks,
} from "../generated/v1-client";
import {
  createAuthorization,
  createSectionFixture,
  expectResponseStatus,
  requestOptions,
} from "./harness";

test("queues concurrent writes to the same user database", async () => {
  const authorization = await createAuthorization();
  const options = requestOptions(authorization);
  const names = ["Concurrent space A", "Concurrent space B"];
  const responses = await Promise.all(
    names.map((name) => createSpace({ name }, options)),
  );
  const spaces = responses.map(
    (response) => expectResponseStatus(response, 201).data.space,
  );
  expect(new Set(spaces.map((space) => space.id)).size).toBe(2);
  const token = await selectAsync(await getMainHyperDB(), {
    selector: getTokenById,
    args: { id: authorization.slice("Bearer ".length) },
  });
  const { db } = await getHyperDB(userDBConfig(token!.userId));
  // Start both dispatches in one turn so the transactions actually overlap.
  await Promise.all(
    spaces.map((space, i) =>
      asyncDispatch(
        db,
        updateSpaceAction({ id: space.id, name: `${names[i]} updated` }),
      ),
    ),
  );
  const listed = expectResponseStatus(await listSpaces(options), 200).data
    .spaces;
  expect(listed.map((space) => space.name).sort()).toEqual(
    names.map((name) => `${name} updated`),
  );
});

test("queues concurrent writes to the same space database", async () => {
  const { space, projectSection, options } = await createSectionFixture(
    await createAuthorization(),
  );
  const titles = ["Concurrent task A", "Concurrent task B"];
  const responses = await Promise.all(
    titles.map((title) =>
      createSectionTask(space.id, projectSection.id, { title }, options),
    ),
  );
  const tasks = responses.map(
    (response) => expectResponseStatus(response, 201).data.task,
  );
  expect(new Set(tasks.map((task) => task.id)).size).toBe(2);
  const { db } = await getHyperDB(spaceDBConfig(space.id));
  await Promise.all(
    tasks.map((task, i) =>
      asyncDispatch(
        db,
        updateTaskAction({
          id: task.id,
          task: { title: `${titles[i]} updated` },
        }),
      ),
    ),
  );
  const listed = expectResponseStatus(
    await listTasks(space.id, { limit: 10 }, options),
    200,
  ).data.tasks;
  expect(listed.map((task) => task.title).sort()).toEqual(
    titles.map((title) => `${title} updated`),
  );
});
