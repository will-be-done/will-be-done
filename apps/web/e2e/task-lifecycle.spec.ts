import { expect, test } from "playwright/test";

import {
  createSpace,
  createTodayTask,
  openSpace,
  openTaskActions,
  signupUser,
  taskItem,
  uniqueE2EName,
} from "./helpers";

test("creates, edits, toggles, and deletes a task across Today and Inbox", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Lifecycle Space");
  const initialTitle = uniqueE2EName("E2E lifecycle task");
  const editedTitle = uniqueE2EName("E2E lifecycle edited");
  const inboxWithOneTask = page.getByRole("link", { name: /^Inbox\s+1$/ });

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  const createdItem = await createTodayTask(page, initialTitle);
  await expect(createdItem).toBeVisible();
  await expect(inboxWithOneTask).toBeVisible();
  const createdItemKey = await createdItem.getAttribute("data-focusable-key");
  expect(createdItemKey).not.toBeNull();
  const editedItem = page.locator(
    `[data-focusable-key="${createdItemKey as string}"]`,
  );

  await createdItem.dblclick();
  await createdItem.getByLabel("Edit task title").fill(editedTitle);
  await page.keyboard.press("Enter");

  expect(await editedItem.textContent()).toContain(editedTitle);
  expect(await editedItem.textContent()).not.toContain(initialTitle);
  await expect(taskItem(page, editedTitle)).toBeVisible();
  await expect(taskItem(page, initialTitle)).toHaveCount(0);
  await page.waitForTimeout(500);

  await page.reload();
  await expect(taskItem(page, editedTitle)).toBeVisible();
  await expect(inboxWithOneTask).toBeVisible();

  await openTaskActions(page, editedTitle);
  await page.getByRole("menuitem", { name: /mark as done/i }).click();

  const doneTodayItem = taskItem(page, editedTitle);
  await expect(doneTodayItem).toBeVisible();
  await expect(doneTodayItem).toHaveAttribute("data-ignore-drop", "true");
  await expect(inboxWithOneTask).toHaveCount(0);

  await page.getByRole("link", { name: /^Inbox$/ }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/projects\/[^/]+$/);
  await expect(taskItem(page, editedTitle)).toBeVisible();

  await openTaskActions(page, editedTitle);
  await expect(
    page.getByRole("menuitem", { name: /mark as todo/i }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await taskItem(page, editedTitle).getByRole("checkbox").first().click();

  const todoInboxItem = taskItem(page, editedTitle);
  await expect(todoInboxItem).toBeVisible();
  await expect(todoInboxItem).not.toHaveAttribute("data-ignore-drop", "true");
  await expect(inboxWithOneTask).toBeVisible();

  await page.getByRole("link", { name: /today/i }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/dates\/\d{4}-\d{2}-\d{2}$/);
  const todoTodayItem = taskItem(page, editedTitle);
  await expect(todoTodayItem).toBeVisible();

  await todoTodayItem.click();
  await page.keyboard.press("Control+Backspace");

  await expect(taskItem(page, editedTitle)).toHaveCount(0);
  await expect(inboxWithOneTask).toHaveCount(0);
  await page.waitForTimeout(500);

  await page.reload();
  await expect(taskItem(page, editedTitle)).toHaveCount(0);

  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await expect(taskItem(page, editedTitle)).toHaveCount(0);
});
