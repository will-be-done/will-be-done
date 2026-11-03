import { expect, test } from "bun:test";
import {
  createMindmap,
  createMindmapNode,
  deleteMindmap,
  deleteMindmapNode,
  getMindmap,
  getTask,
  listMindmaps,
  moveMindmapNode,
  updateMindmap,
  updateMindmapNode,
} from "../generated/v1-client";
import {
  createAuthorization,
  createTaskFixture,
  expectResponseStatus,
} from "./harness";
import { coverOperation } from "./operationCoverage";

test("covers every mindmap operation", async () => {
  const { space, task, options } = await createTaskFixture(
    await createAuthorization(),
  );

  const mindmap = (
    await coverOperation(
      "createMindmap",
      createMindmap(space.id, { title: "Launch" }, options),
      201,
    )
  ).data.mindmap;
  const listed = await coverOperation(
    "listMindmaps",
    listMindmaps(space.id, options),
    200,
  );
  expect(listed.data.mindmaps.map(({ id }) => id)).toEqual([mindmap.id]);

  const renamed = await coverOperation(
    "updateMindmap",
    updateMindmap(space.id, mindmap.id, { title: "Launch plan" }, options),
    200,
  );
  expect(renamed.data.mindmap.title).toBe("Launch plan");

  const marketing = (
    await coverOperation(
      "createMindmapNode",
      createMindmapNode(
        space.id,
        mindmap.id,
        { title: "Marketing", side: "left" },
        options,
      ),
      201,
    )
  ).data.node;
  expect(marketing).toMatchObject({
    parentId: null,
    kind: "topic",
    side: "left",
  });
  const engineering = expectResponseStatus(
    await createMindmapNode(
      space.id,
      mindmap.id,
      {
        title: "Engineering",
        placement: { kind: "before", anchorId: marketing.id },
      },
      options,
    ),
    201,
  ).data.node;
  const taskNode = expectResponseStatus(
    await createMindmapNode(
      space.id,
      mindmap.id,
      { taskId: task.id, parentId: marketing.id },
      options,
    ),
    201,
  ).data.node;
  expect(taskNode).toMatchObject({
    kind: "task",
    taskId: task.id,
    title: task.title,
    parentId: marketing.id,
  });

  // A task appears once per mindmap; adding it again moves its node.
  const readded = expectResponseStatus(
    await createMindmapNode(
      space.id,
      mindmap.id,
      { taskId: task.id, parentId: engineering.id },
      options,
    ),
    201,
  ).data.node;
  expect(readded).toMatchObject({ id: taskNode.id, parentId: engineering.id });

  const moved = await coverOperation(
    "moveMindmapNode",
    moveMindmapNode(
      space.id,
      engineering.id,
      { parentId: marketing.id, placement: { kind: "last" } },
      options,
    ),
    200,
  );
  expect(moved.data.node.parentId).toBe(marketing.id);
  expectResponseStatus(
    await moveMindmapNode(
      space.id,
      marketing.id,
      { parentId: taskNode.id, placement: { kind: "last" } },
      options,
    ),
    409,
  );

  const collapsed = await coverOperation(
    "updateMindmapNode",
    updateMindmapNode(space.id, marketing.id, { collapsed: true }, options),
    200,
  );
  expect(collapsed.data.node.collapsed).toBe(true);
  expectResponseStatus(
    await updateMindmapNode(
      space.id,
      taskNode.id,
      { title: "Renamed" },
      options,
    ),
    409,
  );

  const fetched = await coverOperation(
    "getMindmap",
    getMindmap(space.id, mindmap.id, options),
    200,
  );
  expect(
    fetched.data.nodes.map(({ title, parentId }) => [title, parentId]),
  ).toEqual([
    ["Marketing", null],
    ["Engineering", marketing.id],
    [task.title, engineering.id],
  ]);

  await coverOperation(
    "deleteMindmapNode",
    deleteMindmapNode(space.id, engineering.id, options),
    204,
  );
  expect(
    expectResponseStatus(
      await getMindmap(space.id, mindmap.id, options),
      200,
    ).data.nodes.map(({ id }) => id),
  ).toEqual([marketing.id]);
  expectResponseStatus(await getTask(space.id, task.id, options), 200);

  await coverOperation(
    "deleteMindmap",
    deleteMindmap(space.id, mindmap.id, options),
    204,
  );
  expectResponseStatus(await getMindmap(space.id, mindmap.id, options), 404);
  expectResponseStatus(await getTask(space.id, task.id, options), 200);
});
