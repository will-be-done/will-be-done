import { expect, test } from "playwright/test";

import {
  createProjectTask,
  createSpace,
  createTodayTask,
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
  const originalCalendarText = await calendar.innerText();

  await nextMonth.dblclick();
  await expect(datePicker).toHaveAttribute("data-state", "open");
  await expect.poll(() => calendar.innerText()).not.toBe(originalCalendarText);

  await previousMonth.dblclick();
  await expect(datePicker).toHaveAttribute("data-state", "open");
  await expect.poll(() => calendar.innerText()).toBe(originalCalendarText);
});

test("keeps a typed time when OK is pressed in the open time picker", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Time Space");
  const taskTitle = uniqueE2EName("E2E timed task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  const task = await createTodayTask(page, taskTitle);
  await task.click();
  await page.keyboard.press("KeyV");

  const time = page
    .getByTestId("item-details-panel")
    .getByLabel("Time", { exact: true });
  const ok = page.getByRole("button", { name: "OK", exact: true });
  await time.click();
  await page.getByRole("button", { name: "09", exact: true }).first().click();
  await ok.click();
  await expect(time).toHaveValue("9:00 AM");

  await time.click();
  await time.fill("11:30");
  await ok.click();
  await expect(time).toHaveValue("11:30 AM");

  // The keyboard opens the picker too, and comes back to the field.
  await time.focus();
  await page.keyboard.press("Enter");
  await expect(ok).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ok).toBeHidden();
  await expect(time).toBeFocused();

  // Clicking another field while it is open leaves focus where the user went.
  await page.keyboard.press("Enter");
  await expect(ok).toBeVisible();
  const panel = page.getByTestId("item-details-panel");
  await panel.getByTestId("task-title").click();
  await expect(ok).toBeHidden();
  await expect(panel.getByLabel("Edit task title")).toBeFocused();
});
