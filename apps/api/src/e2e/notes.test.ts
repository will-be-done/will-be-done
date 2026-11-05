import { expect, test } from "bun:test";
import {
  convertNoteToTask,
  convertTaskToNote,
  createProjectSection,
  createSectionTask,
  deleteNote,
  getNote,
  listSectionItems,
  moveNote,
  scheduleTask,
  updateNote,
} from "../generated/v1-client";
import {
  createAuthorization,
  createSectionFixture,
  expectResponseStatus,
} from "./harness";
import { coverOperation } from "./operationCoverage";

test("covers every note operation and both conversions", async () => {
  const { space, project, projectSection, options } =
    await createSectionFixture(await createAuthorization());

  const task = expectResponseStatus(
    await createSectionTask(
      space.id,
      projectSection.id,
      { title: "Meeting notes", content: "Agenda" },
      options,
    ),
    201,
  ).data.task;

  const converted = await coverOperation(
    "convertTaskToNote",
    convertTaskToNote(space.id, task.id, options),
    200,
  );
  const note = converted.data.note;
  expect(note).toMatchObject({
    type: "note",
    title: "Meeting notes",
    content: "Agenda",
    projectSectionId: projectSection.id,
  });
  expect(note.id).not.toBe(task.id);

  const items = expectResponseStatus(
    await listSectionItems(space.id, projectSection.id, {}, options),
    200,
  ).data.items;
  expect(items.map((item) => [item.type, item.id])).toEqual([
    ["note", note.id],
  ]);

  const fetched = await coverOperation(
    "getNote",
    getNote(space.id, note.id, options),
    200,
  );
  expect(fetched.data.note).toEqual(note);

  const updated = await coverOperation(
    "updateNote",
    updateNote(space.id, note.id, { content: "Agenda and outcomes" }, options),
    200,
  );
  expect(updated.data.note).toMatchObject({
    title: "Meeting notes",
    content: "Agenda and outcomes",
  });

  const destination = expectResponseStatus(
    await createProjectSection(
      space.id,
      project.id,
      { title: "Note destination" },
      options,
    ),
    201,
  ).data.section;
  const moved = await coverOperation(
    "moveNote",
    moveNote(
      space.id,
      note.id,
      { projectSectionId: destination.id, placement: { kind: "first" } },
      options,
    ),
    200,
  );
  expect(moved.data.note.projectSectionId).toBe(destination.id);

  const backToTask = await coverOperation(
    "convertNoteToTask",
    convertNoteToTask(space.id, note.id, options),
    200,
  );
  expect(backToTask.data.task).toMatchObject({
    type: "task",
    state: "todo",
    title: "Meeting notes",
    content: "Agenda and outcomes",
    projectSectionId: destination.id,
  });
  expect((await getNote(space.id, note.id, options)).status).toBe(404);

  const noteToDelete = expectResponseStatus(
    await convertTaskToNote(space.id, backToTask.data.task.id, options),
    200,
  ).data.note;
  await coverOperation(
    "deleteNote",
    deleteNote(space.id, noteToDelete.id, options),
    204,
  );
  expect((await getNote(space.id, noteToDelete.id, options)).status).toBe(404);
});

test("drops a converted task's schedule and rejects scheduling a note", async () => {
  const { space, projectSection, options } = await createSectionFixture(
    await createAuthorization(),
  );
  const task = expectResponseStatus(
    await createSectionTask(
      space.id,
      projectSection.id,
      { title: "Scheduled" },
      options,
    ),
    201,
  ).data.task;
  expectResponseStatus(
    await scheduleTask(space.id, task.id, { date: "2200-01-01" }, options),
    200,
  );

  const note = expectResponseStatus(
    await convertTaskToNote(space.id, task.id, options),
    200,
  ).data.note;
  expect(
    (await scheduleTask(space.id, note.id, { date: "2200-01-01" }, options))
      .status,
  ).toBe(404);

  const task2 = expectResponseStatus(
    await convertNoteToTask(space.id, note.id, options),
    200,
  ).data.task;
  expect(task2.scheduledDate).toBeNull();
});
