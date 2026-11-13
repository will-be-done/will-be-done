import { expect, test } from "bun:test";
import {
  convertTaskToNote,
  createMindmap,
  createMindmapNode,
  createSectionTask,
  searchSpace,
  updateTask,
} from "../generated/v1-client";
import {
  createAuthorization,
  createSectionFixture,
  expectResponseStatus,
} from "./harness";
import { coverOperation } from "./operationCoverage";

test("searches tasks, notes and mindmap topics", async () => {
  const { space, projectSection, options } = await createSectionFixture(
    await createAuthorization(),
  );
  const createTask = async (title: string, content?: string) =>
    expectResponseStatus(
      await createSectionTask(
        space.id,
        projectSection.id,
        { title, ...(content ? { content } : {}) },
        options,
      ),
      201,
    ).data.task;

  const task = await createTask("Rocket launch", "Check the fuel");
  const note = expectResponseStatus(
    await convertTaskToNote(
      space.id,
      (await createTask("Fuel suppliers")).id,
      options,
    ),
    200,
  ).data.note;
  const mindmap = expectResponseStatus(
    await createMindmap(space.id, { title: "Plans" }, options),
    201,
  ).data.mindmap;
  const topic = expectResponseStatus(
    await createMindmapNode(space.id, mindmap.id, { title: "Fuel" }, options),
    201,
  ).data.node;

  const results = (
    await coverOperation(
      "searchSpace",
      searchSpace(space.id, { q: "fue" }, options),
      200,
    )
  ).data.results;
  expect(results.map((result) => [result.type, result.id])).toEqual([
    ["mindmapNode", topic.id],
    ["note", note.id],
    ["task", task.id],
  ]);
  expect(results[2]).toEqual(task);

  expectResponseStatus(
    await updateTask(space.id, task.id, { content: "Done" }, options),
    200,
  );
  const afterEdit = expectResponseStatus(
    await searchSpace(space.id, { q: "fuel check", limit: 5 }, options),
    200,
  ).data.results;
  expect(afterEdit).toEqual([]);

  expectResponseStatus(await searchSpace(space.id, { q: " " }, options), 400);

  const korean = await createTask("서울 맛집");
  expect(
    expectResponseStatus(
      await searchSpace(space.id, { q: "마" }, options),
      200,
    ).data.results.map((result) => result.id),
  ).toEqual([korean.id]);
  expect(
    expectResponseStatus(
      await searchSpace(space.id, { q: "마 " }, options),
      200,
    ).data.results,
  ).toEqual([]);
});
