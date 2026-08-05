import { expect, test } from "bun:test";
import {
  createTaskChecklistItem,
  createTaskTemplate,
  createTaskTemplateChecklistItem,
  deleteChecklistItem,
  getChecklistItem,
  listTaskChecklistItems,
  listTaskTemplateChecklistItems,
  moveChecklistItem,
  updateChecklistItem,
} from "../generated/v1-client";
import {
  createAuthorization,
  createTaskFixture,
  expectResponseStatus,
} from "./harness";
import { coverOperation } from "./operationCoverage";

test("covers every checklist-item operation for tasks and templates", async () => {
  const { space, projectSection, task, options } = await createTaskFixture(
    await createAuthorization(),
  );
  const template = expectResponseStatus(
    await createTaskTemplate(
      space.id,
      projectSection.id,
      {
        title: "Checklist template",
        repeatRule: "FREQ=DAILY;INTERVAL=1",
        repeatRuleDtStart: Date.UTC(2200, 0, 1),
      },
      options,
    ),
    201,
  ).data.template;

  const taskItem = await coverOperation(
    "createTaskChecklistItem",
    createTaskChecklistItem(
      space.id,
      task.id,
      { content: "Task checklist A", placement: { kind: "last" } },
      options,
    ),
    201,
  );
  const taskChecklistItem = taskItem.data.checklistItem;
  const movableTaskItem = expectResponseStatus(
    await createTaskChecklistItem(
      space.id,
      task.id,
      { content: "Task checklist B" },
      options,
    ),
    201,
  ).data.checklistItem;

  const taskItems = await coverOperation(
    "listTaskChecklistItems",
    listTaskChecklistItems(space.id, task.id, options),
    200,
  );
  expect(taskItems.data.checklistItems.map(({ id }) => id)).toEqual(
    expect.arrayContaining([taskChecklistItem.id, movableTaskItem.id]),
  );

  const templateItem = await coverOperation(
    "createTaskTemplateChecklistItem",
    createTaskTemplateChecklistItem(
      space.id,
      template.id,
      { content: "Template checklist" },
      options,
    ),
    201,
  );
  const templateChecklistItem = templateItem.data.checklistItem;

  const templateItems = await coverOperation(
    "listTaskTemplateChecklistItems",
    listTaskTemplateChecklistItems(space.id, template.id, options),
    200,
  );
  expect(templateItems.data.checklistItems.map(({ id }) => id)).toContain(
    templateChecklistItem.id,
  );

  const fetched = await coverOperation(
    "getChecklistItem",
    getChecklistItem(space.id, taskChecklistItem.id, options),
    200,
  );
  expect(fetched.data.checklistItem.content).toBe("Task checklist A");

  const updated = await coverOperation(
    "updateChecklistItem",
    updateChecklistItem(
      space.id,
      taskChecklistItem.id,
      { content: "Updated checklist", state: "done" },
      options,
    ),
    200,
  );
  expect(updated.data.checklistItem).toMatchObject({
    content: "Updated checklist",
    state: "done",
  });
  expect(updated.data.checklistItem.checkedAt).not.toBeNull();

  const moved = await coverOperation(
    "moveChecklistItem",
    moveChecklistItem(
      space.id,
      movableTaskItem.id,
      {
        parentId: template.id,
        parentType: "template",
        placement: { kind: "before", anchorId: templateChecklistItem.id },
      },
      options,
    ),
    200,
  );
  expect(moved.data.checklistItem).toMatchObject({
    parentId: template.id,
    parentType: "template",
  });

  await coverOperation(
    "deleteChecklistItem",
    deleteChecklistItem(space.id, taskChecklistItem.id, options),
    204,
  );
  expect(
    (await getChecklistItem(space.id, taskChecklistItem.id, options)).status,
  ).toBe(404);
});
