import { expect, test } from "playwright/test";

import {
  createSpace,
  createTodayTask,
  openSpace,
  signInUser,
  signupUser,
  taskItem,
  uniqueE2EName,
  signOutUser,
} from "./helpers";

test("signs up, signs in, creates a space, and keeps today's task after reload", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Space");
  const taskTitle = uniqueE2EName("E2E task");
  const user = await signupUser(page);

  await signOutUser(page);

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();

  await signInUser(page, user);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createTodayTask(page, taskTitle);
  await page.waitForTimeout(500);

  await page.reload();

  await expect(page).toHaveURL(/\/spaces\/[^/]+\/dates\/\d{4}-\d{2}-\d{2}$/);
  await expect(taskItem(page, taskTitle)).toBeVisible();
});
