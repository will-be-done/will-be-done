import { expect, test, type Page } from "playwright/test";

import {
  checklistItemRow,
  createSpace,
  createTodayTask,
  openSpace,
  openTaskDetails,
  signupUser,
  taskItem,
  uniqueE2EName,
} from "./helpers";

async function createChecklistItemInTaskDetails(page: Page) {
  const spaceName = uniqueE2EName("E2E Checklist Space");
  const taskTitle = uniqueE2EName("E2E checklist task");
  const checklistItem = uniqueE2EName("E2E removable checklist item");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createTodayTask(page, taskTitle);
  await openTaskDetails(page, taskTitle);

  await page
    .locator("[data-checklist-container]")
    .getByText("Add checklist item", { exact: true })
    .click();

  const checklistInput = page.getByRole("textbox", {
    name: "Checklist item",
  });
  await checklistInput.fill(checklistItem);
  await checklistInput.blur();
  await expect(checklistInput).toHaveValue(checklistItem);

  return { checklistItem, row: checklistItemRow(page) };
}

test("edits task details and persists checklist items", async ({ page }) => {
  const spaceName = uniqueE2EName("E2E Details Space");
  const taskTitle = uniqueE2EName("E2E details task");
  const description = uniqueE2EName("E2E persisted description");
  const checklistItem = uniqueE2EName("E2E persisted checklist item");

  await page.setViewportSize({ width: 390, height: 844 });

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  await createTodayTask(page, taskTitle);

  const details = await openTaskDetails(page, taskTitle);
  await details.description.fill(description);

  await page
    .locator("[data-checklist-container]")
    .getByText("Add checklist item", { exact: true })
    .click();

  const checklistInput = page.getByRole("textbox", {
    name: "Checklist item",
  });
  await expect(checklistInput).toBeVisible();
  await checklistInput.fill(checklistItem);
  await checklistInput.blur();

  await expect(checklistInput).toHaveValue(checklistItem);

  const row = checklistItemRow(page);
  await expect(row).toBeVisible();
  await row.getByRole("checkbox").click();
  await expect(row.getByRole("checkbox")).toBeChecked();

  await page.waitForTimeout(500);

  await page.reload();

  await expect(page).toHaveURL(/\/spaces\/[^/]+\/item-details\/[^/]+$/);
  await expect(page.getByLabel("Edit task description")).toHaveValue(
    description,
  );

  await expect(
    page.getByRole("textbox", { name: "Checklist item" }),
  ).toHaveValue(checklistItem);

  const reloadedRow = checklistItemRow(page);
  await expect(reloadedRow).toBeVisible();
  await expect(reloadedRow.getByRole("checkbox")).toBeChecked();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/dates\/\d{4}-\d{2}-\d{2}$/);
  await expect(
    taskItem(page, taskTitle).getByText(checklistItem),
  ).toBeVisible();
});

test("deletes a checklist item with the desktop hover action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const { checklistItem, row } = await createChecklistItemInTaskDetails(page);
  const deleteButton = row.getByRole("button", {
    name: "Delete checklist item",
  });

  await page.mouse.move(0, 0);
  await expect(deleteButton).toHaveCSS("opacity", "0");
  await row.hover();
  await expect(deleteButton).toHaveCSS("opacity", "1");

  await deleteButton.click();
  await expect(row).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(checklistItem, { exact: true })).toHaveCount(0);
});

test.describe("touch checklist actions", () => {
  test.use({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });

  test("keeps the delete action visible and usable", async ({ page }) => {
    const { row } = await createChecklistItemInTaskDetails(page);
    const deleteButton = row.getByRole("button", {
      name: "Delete checklist item",
    });

    await expect(deleteButton).toHaveCSS("opacity", "1");
    await deleteButton.tap();
    await expect(row).toHaveCount(0);
  });
});
