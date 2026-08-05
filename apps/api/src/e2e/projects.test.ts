import { expect, test } from "bun:test";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  moveProject,
  updateProject,
} from "../generated/v1-client";
import {
  createAuthorization,
  createSpaceFixture,
  expectResponseStatus,
} from "./harness";
import { coverOperation } from "./operationCoverage";

test("covers every project operation", async () => {
  const { space, options, inbox } = await createSpaceFixture(
    createAuthorization(),
  );

  const initiallyListed = await coverOperation(
    "listProjects",
    listProjects(space.id, options),
    200,
  );
  expect(initiallyListed.data.projects).toContainEqual(inbox);

  const created = await coverOperation(
    "createProject",
    createProject(
      space.id,
      { title: "Project A", icon: "circle", placement: { kind: "last" } },
      options,
    ),
    201,
  );
  const projectA = created.data.project;
  const projectB = expectResponseStatus(
    await createProject(space.id, { title: "Project B" }, options),
    201,
  ).data.project;

  const fetched = await coverOperation(
    "getProject",
    getProject(space.id, projectA.id, options),
    200,
  );
  expect(fetched.data.project.title).toBe("Project A");

  const updated = await coverOperation(
    "updateProject",
    updateProject(
      space.id,
      projectA.id,
      { title: "Updated project", icon: "star" },
      options,
    ),
    200,
  );
  expect(updated.data.project).toMatchObject({
    title: "Updated project",
    icon: "star",
  });

  await coverOperation(
    "moveProject",
    moveProject(
      space.id,
      projectA.id,
      { placement: { kind: "after", anchorId: projectB.id } },
      options,
    ),
    200,
  );
  const reordered = expectResponseStatus(
    await listProjects(space.id, options),
    200,
  ).data.projects;
  expect(reordered.findIndex(({ id }) => id === projectA.id)).toBeGreaterThan(
    reordered.findIndex(({ id }) => id === projectB.id),
  );

  await coverOperation(
    "deleteProject",
    deleteProject(space.id, projectA.id, options),
    204,
  );
  expect((await getProject(space.id, projectA.id, options)).status).toBe(404);
});
