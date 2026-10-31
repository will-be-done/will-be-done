import { expect, test } from "playwright/test";

import {
  createProject,
  createProjectTask,
  createSpace,
  openSpace,
  projectSidebarLink,
  projectTaskItem,
  signupUser,
  uniqueE2EName,
} from "./helpers";

for (const source of ["Inbox", "project"] as const) {
  for (const moveFrom of ["shortcut", "details"] as const) {
    test(`keeps task focus after moving from ${source} through ${moveFrom}`, async ({
      page,
    }) => {
      const spaceName = uniqueE2EName("E2E Move Focus Space");
      const sourceProject = uniqueE2EName("E2E Source Project");
      const destinationProject = uniqueE2EName("E2E Destination Project");
      const previousTitle = uniqueE2EName("E2E previous task");
      const movingTitle = uniqueE2EName("E2E moving task");
      const nextTitle = uniqueE2EName("E2E next task");

      await signupUser(page);
      await createSpace(page, spaceName);
      await openSpace(page, spaceName);
      await createProject(page, destinationProject);

      if (source === "Inbox") {
        await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
        await expect(
          page.getByRole("heading", { level: 1, name: "Inbox" }),
        ).toBeVisible();
      } else {
        await createProject(page, sourceProject);
        await projectSidebarLink(page, sourceProject).click();
      }

      await createProjectTask(page, previousTitle);
      for (const [siblingTitle, title] of [
        [previousTitle, movingTitle],
        [movingTitle, nextTitle],
      ]) {
        await projectTaskItem(page, siblingTitle).click();
        await page.keyboard.press("KeyO");
        await page.getByLabel("Edit task title").fill(title);
        await page.keyboard.press("Enter");
        await expect(projectTaskItem(page, title)).toBeVisible();
      }

      const previousItem = projectTaskItem(page, previousTitle);
      const nextItem = projectTaskItem(page, nextTitle);
      const sourceUrl = page.url();

      if (moveFrom === "details") {
        await page.keyboard.press("KeyV");
      }

      const moveTask = async (title: string) => {
        await projectTaskItem(page, title).click();
        if (moveFrom === "shortcut") {
          await page.keyboard.press("KeyM");
        } else {
          await page
            .getByTestId("item-details-panel")
            .getByRole("button", { name: "Move to project" })
            .click();
        }

        const dialog = page.getByRole("dialog", { name: "Choose project" });
        await dialog
          .getByPlaceholder("Search projects...")
          .fill(destinationProject);
        await expect(
          dialog.getByRole("button", { name: destinationProject }),
        ).toBeVisible();
        if (moveFrom === "shortcut") {
          await page.keyboard.press("Enter");
        } else {
          await dialog
            .getByRole("button", { name: destinationProject })
            .click();
        }
        await expect(dialog).toBeHidden();
        await expect(projectTaskItem(page, title)).toHaveCount(0);
        await expect(page).toHaveURL(sourceUrl);
      };

      await moveTask(movingTitle);
      await expect(nextItem).toHaveClass(/ring-2 ring-accent/);
      await expect(nextItem).toBeFocused();

      await page.keyboard.press("KeyK");
      await expect(previousItem).toBeFocused();
      await page.keyboard.press("KeyJ");
      await expect(nextItem).toBeFocused();

      await moveTask(nextTitle);
      await expect(previousItem).toHaveClass(/ring-2 ring-accent/);
      await expect(previousItem).toBeFocused();

      await moveTask(previousTitle);
      await expect(page.locator('[data-focusable-key^="task^^"]')).toHaveCount(
        0,
      );
      await projectSidebarLink(page, destinationProject, 3).click();
      for (const title of [previousTitle, movingTitle, nextTitle]) {
        await expect(projectTaskItem(page, title)).toBeVisible();
      }
    });
  }
}

test("creates projects and moves a task between them", async ({ page }) => {
  const spaceName = uniqueE2EName("E2E Project Space");
  const sourceProject = uniqueE2EName("E2E Source Project");
  const destinationProject = uniqueE2EName("E2E Destination Project");
  const taskTitle = uniqueE2EName("E2E project task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  await createProject(page, sourceProject);
  await createProject(page, destinationProject);

  await expect(projectSidebarLink(page, sourceProject)).toBeVisible();
  await expect(projectSidebarLink(page, destinationProject)).toBeVisible();

  await projectSidebarLink(page, sourceProject).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/projects\/[^/]+$/);
  await expect(
    page.getByRole("heading", { name: sourceProject }),
  ).toBeVisible();

  await createProjectTask(page, taskTitle);
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();
  await expect(projectSidebarLink(page, sourceProject, 1)).toBeVisible();
  await expect(projectSidebarLink(page, destinationProject, 1)).toHaveCount(0);

  await projectTaskItem(page, taskTitle).click();
  await page.keyboard.press("KeyV");

  const detailsPanel = page.getByTestId("item-details-panel");
  await expect(detailsPanel).toHaveAttribute("aria-hidden", "false");
  await expect(detailsPanel.getByText(sourceProject)).toBeVisible();

  await detailsPanel.getByRole("button", { name: "Move to project" }).click();

  const projectSearch = page.getByPlaceholder("Search projects...");
  await expect(projectSearch).toBeVisible();
  await projectSearch.fill(destinationProject);
  await page
    .getByRole("dialog", { name: "Choose project" })
    .getByRole("button", { name: destinationProject })
    .click();

  await expect(projectSearch).toHaveCount(0);
  await expect(projectTaskItem(page, taskTitle)).toHaveCount(0);
  await expect(projectSidebarLink(page, sourceProject, 1)).toHaveCount(0);
  await expect(projectSidebarLink(page, destinationProject, 1)).toBeVisible();

  await projectSidebarLink(page, destinationProject, 1).click();
  await expect(
    page.getByRole("heading", { name: destinationProject }),
  ).toBeVisible();
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();

  await page.reload();
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();
  await expect(projectSidebarLink(page, destinationProject, 1)).toBeVisible();
  await expect(projectSidebarLink(page, sourceProject, 1)).toHaveCount(0);
});
