import { expect, test } from "bun:test";
import {
  convertNoteToTask,
  convertTaskToNote,
  createMindmap,
  createMindmapNode,
  createSectionTask,
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
  const { space, task, projectSection, options } = await createTaskFixture(
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
    parentId: mindmap.id,
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

  // The central topic is a node with the mindmap's ID; it can be renamed but
  // stays in the center.
  expectResponseStatus(
    await updateMindmapNode(
      space.id,
      mindmap.id,
      { title: "Ship it" },
      options,
    ),
    200,
  );
  expectResponseStatus(
    await moveMindmapNode(
      space.id,
      mindmap.id,
      { parentId: marketing.id, placement: { kind: "last" } },
      options,
    ),
    409,
  );
  expectResponseStatus(
    await deleteMindmapNode(space.id, mindmap.id, options),
    409,
  );
  expectResponseStatus(
    await updateMindmapNode(
      space.id,
      taskNode.id,
      { title: "Renamed" },
      options,
    ),
    409,
  );

  // Converting a note to a task elsewhere keeps its place on the map.
  const draft = expectResponseStatus(
    await createSectionTask(
      space.id,
      projectSection.id,
      { title: "Draft" },
      options,
    ),
    201,
  ).data.task;
  const note = expectResponseStatus(
    await convertTaskToNote(space.id, draft.id, options),
    200,
  ).data.note;
  const noteNode = expectResponseStatus(
    await createMindmapNode(
      space.id,
      mindmap.id,
      { noteId: note.id, parentId: marketing.id },
      options,
    ),
    201,
  ).data.node;
  expect(noteNode).toMatchObject({
    kind: "note",
    noteId: note.id,
    taskId: null,
    title: "Draft",
  });
  const draftTask = expectResponseStatus(
    await convertNoteToTask(space.id, note.id, options),
    200,
  ).data.task;

  // A floating topic sits at its own point and takes main branches too.
  const floating = expectResponseStatus(
    await createMindmapNode(
      space.id,
      mindmap.id,
      { title: "Ideas", position: { x: 400, y: -200 } },
      options,
    ),
    201,
  ).data.node;
  expect(floating).toMatchObject({
    parentId: null,
    position: { x: 400, y: -200 },
  });
  const idea = expectResponseStatus(
    await createMindmapNode(
      space.id,
      mindmap.id,
      { title: "Idea", parentId: floating.id },
      options,
    ),
    201,
  ).data.node;
  expect(
    expectResponseStatus(
      await moveMindmapNode(
        space.id,
        floating.id,
        { position: { x: 500, y: 0 } },
        options,
      ),
      200,
    ).data.node.position,
  ).toEqual({ x: 500, y: 0 });
  expectResponseStatus(
    await moveMindmapNode(
      space.id,
      taskNode.id,
      { position: { x: 0, y: 300 } },
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
    ["Ship it", null],
    ["Marketing", mindmap.id],
    ["Engineering", marketing.id],
    [task.title, engineering.id],
    ["Draft", marketing.id],
    ["Ideas", null],
    ["Idea", floating.id],
  ]);
  expect(fetched.data.mindmap.title).toBe("Launch plan");
  expect(fetched.data.nodes[4]).toMatchObject({
    id: noteNode.id,
    kind: "task",
    taskId: draftTask.id,
    noteId: null,
  });

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
  ).toEqual([mindmap.id, marketing.id, noteNode.id, floating.id, idea.id]);
  expectResponseStatus(await getTask(space.id, task.id, options), 200);

  await coverOperation(
    "deleteMindmap",
    deleteMindmap(space.id, mindmap.id, options),
    204,
  );
  expectResponseStatus(await getMindmap(space.id, mindmap.id, options), 404);
  expectResponseStatus(await getTask(space.id, task.id, options), 200);
});
