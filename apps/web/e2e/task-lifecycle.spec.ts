import { expect, test } from "playwright/test";

import {
  createSpace,
  createTodayTask,
  dailyTaskItem,
  openSpace,
  openTaskActions,
  projectTaskItem,
  signInUser,
  signupUser,
  taskItem,
  uniqueE2EName,
  waitForSyncedText,
} from "./helpers";

test("creates, edits, toggles, deletes, and restores a task across Today and Inbox", async ({
  page,
  browser,
}) => {
  // Signs in a second device to check the restore syncs.
  test.slow();
  const spaceName = uniqueE2EName("E2E Lifecycle Space");
  const initialTitle = uniqueE2EName("E2E lifecycle task");
  const editedTitle = uniqueE2EName("E2E lifecycle edited");
  const inboxWithOneTask = page.getByRole("link", { name: /^Inbox\s+1$/ });

  const credentials = await signupUser(page);
  const spaceSynced = waitForSyncedText(page, spaceName);
  await createSpace(page, spaceName);
  await spaceSynced;
  await openSpace(page, spaceName);

  const createdItem = await createTodayTask(page, initialTitle);
  await expect(createdItem).toBeVisible();
  await expect(inboxWithOneTask).toBeVisible();
  const createdItemKey = await createdItem.getAttribute("data-focusable-key");
  expect(createdItemKey).not.toBeNull();
  const editedItem = page.locator(
    `[data-focusable-key="${createdItemKey as string}"]`,
  );

  const editSynced = waitForSyncedText(page, editedTitle);
  await createdItem.dblclick();
  await createdItem.getByLabel("Edit task title").fill(editedTitle);
  await page.keyboard.press("Enter");

  expect(await editedItem.textContent()).toContain(editedTitle);
  expect(await editedItem.textContent()).not.toContain(initialTitle);
  await expect(taskItem(page, editedTitle)).toBeVisible();
  await expect(taskItem(page, initialTitle)).toHaveCount(0);
  await editSynced;

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
  await expect(projectTaskItem(page, editedTitle)).toBeVisible();

  await openTaskActions(page, editedTitle);
  await expect(
    page.getByRole("menuitem", { name: /mark as todo/i }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await projectTaskItem(page, editedTitle)
    .getByRole("checkbox")
    .first()
    .click();

  const todoInboxItem = projectTaskItem(page, editedTitle);
  await expect(todoInboxItem).toBeVisible();
  await expect(todoInboxItem).not.toHaveAttribute("data-ignore-drop", "true");
  await expect(inboxWithOneTask).toBeVisible();

  await page.getByRole("link", { name: /today/i }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/dates\/\d{4}-\d{2}-\d{2}$/);
  const todoTodayItem = dailyTaskItem(page, editedTitle);
  await expect(todoTodayItem).toBeVisible();

  await todoTodayItem.click();
  const deleteSynced = waitForSyncedText(page, "trashed_tasks");
  await page.keyboard.press("Control+Backspace");

  await expect(taskItem(page, editedTitle)).toHaveCount(0);
  await expect(inboxWithOneTask).toHaveCount(0);
  await deleteSynced;

  await page.reload();
  await expect(taskItem(page, editedTitle)).toHaveCount(0);

  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await expect(taskItem(page, editedTitle)).toHaveCount(0);

  await page.getByRole("link", { name: /^Trash$/ }).click();
  await expect(page.getByText(editedTitle)).toBeVisible();
  const restoreSynced = waitForSyncedText(page, "restoredAt");
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Trash is empty")).toBeVisible();

  await inboxWithOneTask.click();
  await expect(projectTaskItem(page, editedTitle)).toBeVisible();
  await restoreSynced;

  const otherDevice = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const other = await otherDevice.newPage();
    await signInUser(other, credentials);
    await openSpace(other, spaceName);
    await other.getByRole("link", { name: /^Inbox\s+1$/ }).click();
    await expect(projectTaskItem(other, editedTitle)).toBeVisible();
  } finally {
    await otherDevice.close();
  }
});
