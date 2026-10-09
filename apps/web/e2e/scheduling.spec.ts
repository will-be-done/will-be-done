import { expect, test } from "playwright/test";

import {
  createProjectTask,
  createSpace,
  dailyTaskItem,
  openSpace,
  openTaskActions,
  projectTaskItem,
  signupUser,
  uniqueE2EName,
} from "./helpers";

test("schedules an Inbox task for Today and clears the schedule", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Schedule Space");
  const taskTitle = uniqueE2EName("E2E scheduled task");
  const inboxWithOneTask = page.getByRole("link", { name: /^Inbox\s+1$/ });

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/projects\/[^/]+$/);

  await createProjectTask(page, taskTitle);
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();
  await expect(inboxWithOneTask).toBeVisible();

  await openTaskActions(page, taskTitle);
  await page.getByRole("menuitem", { name: /schedule today/i }).click();

  await page.getByRole("link", { name: /today/i }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/dates\/\d{4}-\d{2}-\d{2}$/);
  await expect(dailyTaskItem(page, taskTitle)).toBeVisible();

  await openTaskActions(page, taskTitle);
  await page.getByRole("menuitem", { name: /reset schedule/i }).click();

  await expect(dailyTaskItem(page, taskTitle)).toHaveCount(0);
  await expect(inboxWithOneTask).toBeVisible();

  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/projects\/[^/]+$/);
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();

  await page.reload();
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();
  await expect(inboxWithOneTask).toBeVisible();

  await page.getByRole("link", { name: /today/i }).click();
  await expect(dailyTaskItem(page, taskTitle)).toHaveCount(0);
});

test("keeps the date picker open while rapidly changing months", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Calendar Navigation Space");
  const taskTitle = uniqueE2EName("E2E calendar navigation task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await createProjectTask(page, taskTitle);
  await openTaskActions(page, taskTitle);
  await page.getByRole("menuitem", { name: /schedule date/i }).click();

  const calendar = page.locator('[data-slot="calendar"]');
  const datePicker = page.locator('[data-slot="popover-content"]', {
    has: calendar,
  });
  const nextMonth = calendar.getByRole("button", { name: /next month/i });
  const previousMonth = calendar.getByRole("button", {
    name: /previous month/i,
  });

  await expect(calendar).toBeVisible();
  await nextMonth.dblclick();
  await expect(datePicker).toHaveAttribute("data-state", "open");
  await previousMonth.dblclick();
  await expect(datePicker).toHaveAttribute("data-state", "open");
});
