import { expect, test, type Page } from "playwright/test";
import { format } from "date-fns";
import {
  createProject,
  createSpace,
  dailyTaskItem,
  openSpace,
  projectTaskItem,
  signupUser,
  uniqueE2EName,
} from "./helpers";

const today = () => format(new Date(), "yyyy-MM-dd");

async function openQuickAdd(page: Page) {
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Control+KeyA");
  const dialog = page.getByRole("dialog", { name: "Quick add" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("quick add defaults to the current page's project and date", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("Quick Add Space");
  const projectTitle = uniqueE2EName("Quick Add Project");
  const projectTask = uniqueE2EName("Project task");
  const dailyTask = uniqueE2EName("Daily task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createProject(page, projectTitle);
  await expect(page).toHaveURL(/\/projects\//);

  let dialog = await openQuickAdd(page);
  await expect(dialog.getByRole("button", { name: "Project" })).toHaveText(
    new RegExp(projectTitle),
  );
  await expect(dialog.getByRole("button", { name: "No date" })).toBeVisible();
  await dialog.getByLabel("Task title").fill(projectTask);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(projectTaskItem(page, projectTask)).toBeVisible();

  await page.getByRole("link", { name: /today/i }).first().click();
  await expect(page).toHaveURL(/\/dates\//);
  dialog = await openQuickAdd(page);
  await expect(dialog.getByRole("button", { name: "Today" })).toBeVisible();
  await dialog.getByLabel("Task title").fill(dailyTask);
  await dialog.getByRole("button", { name: "Project" }).click();
  await page.getByPlaceholder("Search projects...").fill(projectTitle);
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("button", { name: "Project" })).toHaveText(
    new RegExp(projectTitle),
  );
  // Picking returns focus to the title, so Enter adds the task.
  await expect(dialog.getByLabel("Task title")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(dailyTaskItem(page, dailyTask)).toBeVisible();

  await page.getByRole("link", { name: new RegExp(projectTitle) }).click();
  await expect(projectTaskItem(page, dailyTask)).toBeVisible();
});

test("quick add opens from a focused calendar card", async ({ page }) => {
  const spaceName = uniqueE2EName("Quick Add Calendar Space");
  const title = uniqueE2EName("Calendar card");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await page.getByRole("link", { name: "calendar", exact: true }).click();

  await page
    .locator(`[data-calendar-untimed][data-calendar-date="${today()}"]`)
    .click({ position: { x: 5, y: 5 } });
  let dialog = page.getByRole("dialog", { name: "Quick add" });
  await dialog.getByLabel("Task title").fill(title);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();

  await page
    .locator("[data-calendar-untimed] [data-focusable-key]", { hasText: title })
    .focus();
  await page.keyboard.press("Control+KeyA");
  dialog = page.getByRole("dialog", { name: "Quick add" });
  await expect(dialog).toBeVisible();
});
