import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { selectSync } from "@will-be-done/hyperdb";
import { taskById } from "@will-be-done/slices/space";
import { spaceDBConfig } from "../db/configs";
import { getHyperDB } from "../db/db";
import { createSectionTask, getTask } from "../generated/v1-client";
import {
  createAuthorization,
  createSectionFixture,
  expectResponseStatus,
  restartTestServer,
} from "./harness";

const databasePath = process.env.WBD_API_E2E_DB_PATH;
if (!databasePath) {
  throw new Error("API E2E database path was not initialized");
}

test("persists generated-client mutations in the real database across restart", async () => {
  const { space, projectSection, options } = await createSectionFixture(
    createAuthorization(),
  );
  const task = expectResponseStatus(
    await createSectionTask(
      space.id,
      projectSection.id,
      { title: "Persisted task" },
      options,
    ),
    201,
  ).data.task;

  const storedTask = selectSync(getHyperDB(spaceDBConfig(space.id)).db, {
    selector: taskById,
    args: { id: task.id },
  });
  expect(storedTask).toMatchObject({
    id: task.id,
    title: "Persisted task",
    projectSectionId: projectSection.id,
  });
  expect(existsSync(join(databasePath, `space-${space.id}.sqlite`))).toBe(true);

  await restartTestServer();

  const persisted = expectResponseStatus(
    await getTask(space.id, task.id, options),
    200,
  );
  expect(persisted.data.task).toMatchObject({
    id: task.id,
    title: "Persisted task",
    projectSectionId: projectSection.id,
  });
});
