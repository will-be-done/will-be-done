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
    await createAuthorization(),
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
      {
        title: "Project A",
        icon: "circle",
        backgroundImageUrl: "https://example.com/first.jpg",
        placement: { kind: "last" },
      },
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
  expect(fetched.data.project.backgroundImageUrl).toBe(
    "https://example.com/first.jpg",
  );

  const updated = await coverOperation(
    "updateProject",
    updateProject(
      space.id,
      projectA.id,
      {
        title: "Updated project",
        icon: "star",
        cardBackgroundColor: "#112233",
        accentColor: "#aabbcc",
        backgroundImageUrl: "https://example.com/second.jpg",
      },
      options,
    ),
    200,
  );
  expect(updated.data.project).toMatchObject({
    title: "Updated project",
    icon: "star",
    cardBackgroundColor: "#112233",
    accentColor: "#aabbcc",
    backgroundImageUrl: "https://example.com/second.jpg",
  });

  expect(
    (
      await updateProject(
        space.id,
        projectA.id,
        { backgroundImageUrl: "file:///image.jpg" },
        options,
      )
    ).status,
  ).toBe(400);
  const uploadedPhoto = "data:image/jpeg;base64,/9j/2Q==";
  expectResponseStatus(
    await updateProject(
      space.id,
      projectA.id,
      { backgroundImageUrl: uploadedPhoto },
      options,
    ),
    200,
  );
  expect(
    expectResponseStatus(await getProject(space.id, projectA.id, options), 200)
      .data.project.backgroundImageUrl,
  ).toBe(uploadedPhoto);

  const cleared = expectResponseStatus(
    await updateProject(
      space.id,
      projectA.id,
      { backgroundImageUrl: null },
      options,
    ),
    200,
  );
  expect(cleared.data.project.backgroundImageUrl).toBeNull();
  expect(cleared.data.project.cardBackgroundColor).toBe("#112233");
  const resetColors = expectResponseStatus(
    await updateProject(
      space.id,
      projectA.id,
      { cardBackgroundColor: null, accentColor: null },
      options,
    ),
    200,
  );
  expect(resetColors.data.project.accentColor).toBeNull();
  expect(
    (
      await updateProject(
        space.id,
        projectA.id,
        { accentColor: "red" },
        options,
      )
    ).status,
  ).toBe(400);
  expect(
    expectResponseStatus(await getProject(space.id, projectB.id, options), 200)
      .data.project.backgroundImageUrl,
  ).toBeUndefined();

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
