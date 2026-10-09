import { expect, test } from "playwright/test";

import {
  createProject,
  createProjectTask,
  createSpace,
  createTodayTask,
  dailyTaskItem,
  openSpace,
  openTaskActions,
  openTaskDetails,
  projectTaskItem,
  projectSidebarLink,
  signupUser,
  stashPanel,
  stashTaskItem,
  uniqueE2EName,
} from "./helpers";

for (const view of ["project", "today", "timeline"] as const) {
  test(`focuses stash only while open in ${view}`, async ({ page }) => {
    const spaceName = uniqueE2EName("E2E Stash Focus Space");
    const stashedTitle = uniqueE2EName("E2E stash focus task");
    const mainTitle = uniqueE2EName("E2E main focus task");

    await signupUser(page);
    await createSpace(page, spaceName);
    await openSpace(page, spaceName);

    await createTodayTask(page, stashedTitle);
    await openTaskActions(page, stashedTitle);
    await page.getByRole("menuitem", { name: /stash task/i }).click();
    await expect(page.getByTestId("stash-count")).toHaveText("1");

    if (view === "project") {
      const projectTitle = uniqueE2EName("E2E Focus Project");
      await createProject(page, projectTitle);
      await projectSidebarLink(page, projectTitle).click();
      await createProjectTask(page, mainTitle);
    } else {
      await createTodayTask(page, mainTitle);
      if (view === "timeline") {
        // Start the timeline at Today so this task is adjacent to the stash.
        await page.goto(
          new URL(page.url()).pathname.replace("/dates/", "/timeline/"),
        );
        await expect(page).toHaveURL(
          /\/spaces\/[^/]+\/timeline\/\d{4}-\d{2}-\d{2}/,
        );
        await expect(
          page.locator(
            '[data-focus-region-direction="row"] [data-column-model-type="dailyList"]',
          ),
        ).toHaveCount(7);
      }
    }

    const mainTask =
      view === "project"
        ? projectTaskItem(page, mainTitle)
        : dailyTaskItem(page, mainTitle);
    const stashedTask = stashTaskItem(page, stashedTitle);
    const toggle = page.getByTestId("stash-toggle");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await mainTask.click();
    await expect(mainTask).toBeFocused();
    await page.keyboard.press("KeyH");
    await expect(mainTask).toBeFocused();
    await expect(stashedTask).not.toHaveClass(/ring-2 ring-accent/);

    await page.keyboard.press("Backslash");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("KeyH");
    await expect(stashedTask).toBeFocused();
    await expect(stashedTask).toHaveClass(/ring-2 ring-accent/);
    await page.keyboard.press("KeyL");
    await expect(mainTask).toBeFocused();

    await page.keyboard.press("KeyH");
    await expect(stashedTask).toBeFocused();
    await page.keyboard.press("Backslash");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(stashedTask).not.toBeFocused();
    await expect(stashedTask).not.toHaveClass(/ring-2 ring-accent/);

    // A closed panel must also reject direct DOM focus and Tab navigation.
    await stashedTask.evaluate((element: HTMLElement) => element.focus());
    await expect(stashedTask).not.toBeFocused();
    await toggle.focus();
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() =>
        stashPanel(page).evaluate((panel) =>
          panel.contains(document.activeElement),
        ),
      )
      .toBe(false);

    await mainTask.click();
    await page.keyboard.press("KeyH");
    await expect(mainTask).toBeFocused();

    await page.keyboard.press("Backslash");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("KeyH");
    await expect(stashedTask).toBeFocused();
  });

  test(`moves a task into an empty stash with Ctrl+h in ${view}`, async ({
    page,
  }) => {
    const spaceName = uniqueE2EName("E2E Empty Stash Space");
    const taskTitle = uniqueE2EName("E2E empty stash task");

    await signupUser(page);
    await createSpace(page, spaceName);
    await openSpace(page, spaceName);

    if (view === "project") {
      await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
      await createProjectTask(page, taskTitle);
    } else {
      await createTodayTask(page, taskTitle);
      if (view === "timeline") {
        await page.goto(
          new URL(page.url()).pathname.replace("/dates/", "/timeline/"),
        );
        await expect(
          page.locator(
            '[data-focus-region-direction="row"] [data-column-model-type="dailyList"]',
          ),
        ).toHaveCount(7);
      }
    }

    const mainTask =
      view === "project"
        ? projectTaskItem(page, taskTitle)
        : dailyTaskItem(page, taskTitle);
    const stashedTask = stashTaskItem(page, taskTitle);
    const emptyStash = stashPanel(page).locator("[data-focus-placeholder]");

    await expect(page.getByTestId("stash-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await mainTask.click();
    await page.keyboard.press("Control+KeyH");
    await expect(stashedTask).toHaveCount(0);
    await expect(mainTask).toBeFocused();

    await page.keyboard.press("Backslash");
    await expect(stashPanel(page)).toHaveAttribute("aria-hidden", "false");
    await page.keyboard.press("KeyH");
    await expect(emptyStash).toBeFocused();
    await page.keyboard.press("KeyL");
    await expect(mainTask).toBeFocused();
    await page.keyboard.press("Control+KeyH");
    await expect(stashedTask).toBeFocused();
    await expect(page.getByTestId("stash-count")).toHaveText("1");
    if (view !== "project") await expect(mainTask).toHaveCount(0);

    if (view === "timeline") {
      await page.keyboard.press("Control+KeyL");
      await expect(stashedTask).toHaveCount(0);
      await expect(mainTask).toBeFocused();
      await expect(page.getByTestId("stash-count")).toHaveCount(0);

      // The emptied stash remains a focus target and accepts another move.
      await page.keyboard.press("KeyH");
      await expect(emptyStash).toBeFocused();
      await page.keyboard.press("KeyL");
      await expect(mainTask).toBeFocused();
      await page.keyboard.press("Control+KeyH");
      await expect(stashedTask).toBeFocused();
      await expect(page.getByTestId("stash-count")).toHaveText("1");
    }
  });
}

test("shows details for a selected stashed task", async ({ page }) => {
  const spaceName = uniqueE2EName("E2E Stash Details Space");
  const taskTitle = uniqueE2EName("E2E stashed task with details");
  const description = uniqueE2EName("E2E stashed task description");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  const task = await createTodayTask(page, taskTitle);
  await task.click();
  await page.keyboard.press("Digit1");
  await expect(task.locator(".bg-nature-red")).toBeVisible();

  const details = await openTaskDetails(page, taskTitle);
  await details.description.fill(description);

  await openTaskActions(page, taskTitle);
  await page.getByRole("menuitem", { name: /stash task/i }).click();

  await page.keyboard.press("Backslash");
  await stashTaskItem(page, taskTitle).click();

  await expect(page.getByLabel("Edit task description")).toHaveValue(
    description,
  );
});

test("stashes a task and keeps it available across Today and Inbox", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Stash Space");
  const taskTitle = uniqueE2EName("E2E stashed task");
  const stashToggle = page.getByTestId("stash-toggle");
  const stashCount = page.getByTestId("stash-count");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  await createTodayTask(page, taskTitle);
  await expect(dailyTaskItem(page, taskTitle)).toBeVisible();
  await expect(stashToggle).toHaveAttribute("aria-expanded", "false");

  await openTaskActions(page, taskTitle);
  await page.getByRole("menuitem", { name: /stash task/i }).click();

  await expect(dailyTaskItem(page, taskTitle)).toHaveCount(0);
  await expect(stashCount).toHaveText("1");
  await expect(stashPanel(page)).toHaveAttribute("aria-hidden", "true");

  await page.keyboard.press("Backslash");
  await expect(stashToggle).toHaveAttribute("aria-expanded", "true");
  await expect(stashPanel(page)).toHaveAttribute("aria-hidden", "false");
  await expect(stashTaskItem(page, taskTitle)).toBeVisible();

  await page.keyboard.press("Backslash");
  await expect(stashToggle).toHaveAttribute("aria-expanded", "false");
  await expect(stashPanel(page)).toHaveAttribute("aria-hidden", "true");

  await page.keyboard.press("Backslash");
  await expect(stashToggle).toHaveAttribute("aria-expanded", "true");
  await expect(stashTaskItem(page, taskTitle)).toBeVisible();

  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/projects\/[^/]+$/);
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();
  await expect(stashTaskItem(page, taskTitle)).toBeVisible();
  await expect(stashCount).toHaveText("1");

  await page.reload();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/projects\/[^/]+$/);
  await expect(stashToggle).toHaveAttribute("aria-expanded", "true");
  await expect(stashTaskItem(page, taskTitle)).toBeVisible();
  await expect(stashCount).toHaveText("1");

  await page.getByRole("link", { name: /today/i }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/dates\/\d{4}-\d{2}-\d{2}$/);
  await expect(dailyTaskItem(page, taskTitle)).toHaveCount(0);
  await expect(stashTaskItem(page, taskTitle)).toBeVisible();
});
