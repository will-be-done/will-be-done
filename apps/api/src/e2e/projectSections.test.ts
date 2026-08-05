import { expect, test } from "bun:test";
import {
  createProject,
  createProjectSection,
  createSectionTask,
  deleteProjectSection,
  getProjectSection,
  listProjectSections,
  listSectionItems,
  moveProjectSection,
  updateProjectSection,
} from "../generated/v1-client";
import {
  createAuthorization,
  createProjectFixture,
  expectResponseStatus,
} from "./harness";
import { coverOperation } from "./operationCoverage";

test("covers every project-section operation", async () => {
  const { space, project, options } = await createProjectFixture(
    createAuthorization(),
  );

  await coverOperation(
    "listProjectSections",
    listProjectSections(space.id, project.id, options),
    200,
  );

  const created = await coverOperation(
    "createProjectSection",
    createProjectSection(
      space.id,
      project.id,
      { title: "Section A", placement: { kind: "last" } },
      options,
    ),
    201,
  );
  const sectionA = created.data.section;
  const sectionB = expectResponseStatus(
    await createProjectSection(
      space.id,
      project.id,
      { title: "Section B" },
      options,
    ),
    201,
  ).data.section;

  const fetched = await coverOperation(
    "getProjectSection",
    getProjectSection(space.id, sectionA.id, options),
    200,
  );
  expect(fetched.data.section.title).toBe("Section A");

  const updated = await coverOperation(
    "updateProjectSection",
    updateProjectSection(
      space.id,
      sectionA.id,
      { title: "Updated section" },
      options,
    ),
    200,
  );
  expect(updated.data.section.title).toBe("Updated section");

  const targetProject = expectResponseStatus(
    await createProject(space.id, { title: "Section target" }, options),
    201,
  ).data.project;
  const moved = await coverOperation(
    "moveProjectSection",
    moveProjectSection(
      space.id,
      sectionA.id,
      { projectId: targetProject.id, placement: { kind: "last" } },
      options,
    ),
    200,
  );
  expect(moved.data.section.projectId).toBe(targetProject.id);

  const sectionTask = expectResponseStatus(
    await createSectionTask(
      space.id,
      sectionA.id,
      { title: "Section item" },
      options,
    ),
    201,
  ).data.task;
  const items = await coverOperation(
    "listSectionItems",
    listSectionItems(space.id, sectionA.id, { taskState: "todo" }, options),
    200,
  );
  expect(items.data.items.map(({ id }) => id)).toContain(sectionTask.id);

  await coverOperation(
    "deleteProjectSection",
    deleteProjectSection(space.id, sectionB.id, options),
    204,
  );
  expect((await getProjectSection(space.id, sectionB.id, options)).status).toBe(
    404,
  );
});
