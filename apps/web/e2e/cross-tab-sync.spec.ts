import { expect, test } from "playwright/test";

import {
  createSpace,
  createTodayTask,
  openSpace,
  signupUser,
  taskItem,
  uniqueE2EName,
} from "./helpers";

test("shows a task created offline in another tab without reloading", async ({
  context,
  page,
}) => {
  const spaceName = uniqueE2EName("E2E cross-tab space");
  const taskTitle = uniqueE2EName("E2E cross-tab task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  const secondPage = await context.newPage();
  await secondPage.goto(page.url());
  await expect(
    secondPage.getByRole("button", { name: "Add task" }),
  ).toBeVisible();
  await expect(taskItem(secondPage, taskTitle)).toHaveCount(0);

  await context.setOffline(true);
  await createTodayTask(page, taskTitle);

  await expect(taskItem(secondPage, taskTitle)).toBeVisible();
});
