import { expect, test } from "playwright/test";
import {
  createProject,
  createProjectTask,
  createSpace,
  openSpace,
  openTaskActions,
  openTaskDetails,
  projectTaskItem,
  signupUser,
  uniqueE2EName,
} from "./helpers";

test("opens a task page from its menu and edits the task there", async ({
  page,
}) => {
  const projectTitle = uniqueE2EName("Page Project");
  const spaceName = uniqueE2EName("Page Space");
  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createProject(page, projectTitle);
  await createProjectTask(page, "Write the report");

  await openTaskActions(page, "Write the report");
  await page.getByRole("menuitem", { name: "Open page" }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/?]+$/);
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText(projectTitle);

  await page.getByTestId("task-title").click();
  await page.getByLabel("Edit task title").fill("Write the final report");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-title")).toHaveText(
    "Write the final report",
  );
  const done = page.getByRole("checkbox").first();
  await done.click();
  await expect(done).toBeChecked();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/projects\//);
  await expect(
    projectTaskItem(page, "Write the final report").getByRole("checkbox"),
  ).toBeChecked();

  await openTaskActions(page, "Write the final report");
  await page.getByRole("menuitem", { name: "Open page" }).click();
  await expect(page).toHaveURL(/\/tasks\//);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/projects\//);
});

test("follows a task converted to a note and redirects old links", async ({
  page,
}) => {
  await signupUser(page);
  const spaceName = uniqueE2EName("Page Convert Space");
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createProject(page, uniqueE2EName("Page Convert Project"));
  await createProjectTask(page, "Trip ideas");

  await openTaskDetails(page, "Trip ideas");
  await page.getByRole("button", { name: "Open as page" }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/?]+$/);

  await page.getByRole("button", { name: "Convert to note" }).click();
  await expect(page).toHaveURL(/\/notes\/[^/?]+$/);
  await expect(page.getByTestId("task-title")).toHaveText("Trip ideas");
  const noteUrl = page.url();

  await page.goto(noteUrl.replace("/notes/", "/item-details/"));
  await expect(page).toHaveURL(noteUrl);
  await expect(page.getByTestId("task-title")).toHaveText("Trip ideas");

  await page.goto(noteUrl.replace(/\/notes\/.*/, "/tasks/missing"));
  await expect(
    page.getByText("This item was deleted or never existed."),
  ).toBeVisible();
});
