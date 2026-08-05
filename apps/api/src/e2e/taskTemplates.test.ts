import { expect, test } from "bun:test";
import {
  convertTaskTemplateToTask,
  convertTaskToTemplate,
  createProjectSection,
  createSectionTask,
  createTaskTemplate,
  deleteTaskTemplate,
  getTaskTemplate,
  moveTaskTemplate,
  updateTaskTemplate,
} from "../generated/v1-client";
import {
  createAuthorization,
  createSectionFixture,
  expectResponseStatus,
} from "./harness";
import { coverOperation } from "./operationCoverage";

test("covers every task-template operation and both conversions", async () => {
  const { space, project, projectSection, options } =
    await createSectionFixture(await createAuthorization());
  const repeatRuleDtStart = Date.UTC(2200, 0, 1);

  const created = await coverOperation(
    "createTaskTemplate",
    createTaskTemplate(
      space.id,
      projectSection.id,
      {
        title: "Template A",
        content: "Template content",
        nature: "red",
        repeatRule: "FREQ=DAILY;INTERVAL=1",
        repeatRuleDtStart,
      },
      options,
    ),
    201,
  );
  const templateA = created.data.template;

  const fetched = await coverOperation(
    "getTaskTemplate",
    getTaskTemplate(space.id, templateA.id, options),
    200,
  );
  expect(fetched.data.template.title).toBe("Template A");

  const updated = await coverOperation(
    "updateTaskTemplate",
    updateTaskTemplate(
      space.id,
      templateA.id,
      {
        title: "Updated template",
        repeatRule: "FREQ=WEEKLY;INTERVAL=1",
      },
      options,
    ),
    200,
  );
  expect(updated.data.template).toMatchObject({
    title: "Updated template",
    repeatRule: "FREQ=WEEKLY;INTERVAL=1",
  });

  const destination = expectResponseStatus(
    await createProjectSection(
      space.id,
      project.id,
      { title: "Template destination" },
      options,
    ),
    201,
  ).data.section;
  const moved = await coverOperation(
    "moveTaskTemplate",
    moveTaskTemplate(
      space.id,
      templateA.id,
      {
        projectSectionId: destination.id,
        placement: { kind: "first" },
      },
      options,
    ),
    200,
  );
  expect(moved.data.template.projectSectionId).toBe(destination.id);

  const templateToConvert = expectResponseStatus(
    await createTaskTemplate(
      space.id,
      projectSection.id,
      {
        title: "Convert to task",
        repeatRule: "FREQ=DAILY;INTERVAL=1",
        repeatRuleDtStart,
      },
      options,
    ),
    201,
  ).data.template;
  const convertedTask = await coverOperation(
    "convertTaskTemplateToTask",
    convertTaskTemplateToTask(space.id, templateToConvert.id, options),
    200,
  );
  expect(convertedTask.data.task).toMatchObject({
    title: "Convert to task",
    type: "task",
  });
  expect(convertedTask.data.task.id).not.toBe(templateToConvert.id);

  const taskToConvert = expectResponseStatus(
    await createSectionTask(
      space.id,
      projectSection.id,
      { title: "Convert to template" },
      options,
    ),
    201,
  ).data.task;
  const convertedTemplate = await coverOperation(
    "convertTaskToTemplate",
    convertTaskToTemplate(
      space.id,
      taskToConvert.id,
      {
        title: "Converted template",
        repeatRule: "FREQ=MONTHLY;INTERVAL=1",
        repeatRuleDtStart,
      },
      options,
    ),
    200,
  );
  expect(convertedTemplate.data.template).toMatchObject({
    title: "Converted template",
    type: "template",
  });
  expect(convertedTemplate.data.template.id).not.toBe(taskToConvert.id);

  await coverOperation(
    "deleteTaskTemplate",
    deleteTaskTemplate(space.id, templateA.id, options),
    204,
  );
  expect((await getTaskTemplate(space.id, templateA.id, options)).status).toBe(
    404,
  );
});
