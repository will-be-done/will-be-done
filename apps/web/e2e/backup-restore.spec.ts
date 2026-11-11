import { readFile } from "node:fs/promises";
import { expect, test } from "playwright/test";

import {
  createSpace,
  createTodayTask,
  dailyTaskItem,
  openSpace,
  closeSpaceSettings,
  openSpaceSettings,
  openTaskDetails,
  projectSidebarLink,
  projectTaskItem,
  signupUser,
  solidPng,
  uniqueE2EName,
} from "./helpers";

test("restores a JSON backup through settings", async ({ page }) => {
  const spaceName = uniqueE2EName("E2E Backup Space");
  const projectTitle = uniqueE2EName("E2E Restored Project");
  const taskTitle = uniqueE2EName("E2E restored task");
  const taskDescription = uniqueE2EName("E2E restored description");
  const checklistItem = uniqueE2EName("E2E restored checklist item");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  const dateMatch = page.url().match(/\/dates\/(\d{4}-\d{2}-\d{2})$/);
  expect(dateMatch).not.toBeNull();
  const currentDate = dateMatch![1];

  const backup = createTinyBackup({
    date: currentDate,
    projectTitle,
    taskTitle,
    taskDescription,
    checklistItem,
  });

  const settings = await openSpaceSettings(page, "Backup");

  const restoreInput = page.getByTestId("backup-restore-input");
  const confirmationPromise = page.waitForEvent("dialog");
  const uploadPromise = restoreInput.setInputFiles({
    name: "will-be-done-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  const confirmation = await confirmationPromise;
  expect(confirmation.type()).toBe("confirm");
  expect(confirmation.message()).toContain("replace all existing data");
  await confirmation.accept();
  await uploadPromise;

  await expect(settings.getByText("Restored successfully")).toBeVisible();

  await closeSpaceSettings(page);

  await expect(projectSidebarLink(page, projectTitle, 1)).toBeVisible();
  await expect(dailyTaskItem(page, taskTitle)).toBeVisible();

  const details = await openTaskDetails(page, taskTitle);
  await expect(details.description).toHaveText(taskDescription);
  await expect(
    dailyTaskItem(page, taskTitle).getByText(checklistItem),
  ).toBeVisible();

  await projectSidebarLink(page, projectTitle, 1).click();
  await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();

  await page.reload();
  await expect(projectSidebarLink(page, projectTitle, 1)).toBeVisible();
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();

  await page.getByRole("link", { name: /today/i }).click();
  await expect(dailyTaskItem(page, taskTitle)).toBeVisible();
});

test("restores a ZIP backup with its files into another space", async ({
  page,
}) => {
  const sourceSpace = uniqueE2EName("E2E Archive Source");
  const targetSpace = uniqueE2EName("E2E Archive Target");
  const taskTitle = uniqueE2EName("E2E archived task");
  await signupUser(page);
  await createSpace(page, sourceSpace);
  await openSpace(page, sourceSpace);
  await createTodayTask(page, taskTitle);
  await openTaskDetails(page, taskTitle);
  await page.getByTestId("attachment-input").setInputFiles({
    name: "shot.png",
    mimeType: "image/png",
    buffer: solidPng(40, 30),
  });
  await expect(
    page
      .getByTestId("item-attachments")
      .getByRole("button", { name: "Open shot.png" }),
  ).toBeVisible();

  const source = await openSpaceSettings(page, "Backup");
  const downloadPromise = page.waitForEvent("download");
  await source.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const archive = await readFile(await download.path());
  await page.goto("/spaces");
  await createSpace(page, targetSpace);
  await openSpace(page, targetSpace);
  const target = await openSpaceSettings(page, "Backup");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("backup-restore-input").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/zip",
    buffer: archive,
  });
  await expect(target.getByText("Restored successfully")).toBeVisible();

  // The thumbnail shows only once the bytes are on this device.
  await page
    .getByRole("navigation", { name: "Settings" })
    .getByRole("link", { name: "Files", exact: true })
    .click();
  await expect(
    target.getByRole("button", { name: "Open shot.png" }).locator("img"),
  ).toBeVisible();
  await expect(target.getByRole("link", { name: taskTitle })).toBeVisible();
});

function createTinyBackup({
  date,
  projectTitle,
  taskTitle,
  taskDescription,
  checklistItem,
}: {
  date: string;
  projectTitle: string;
  taskTitle: string;
  taskDescription: string;
  checklistItem: string;
}) {
  const createdAt = Date.now();

  return {
    projects: [
      {
        id: "e2e-inbox-project",
        title: "Inbox",
        icon: "I",
        isInbox: true,
        orderToken: "a",
        createdAt,
      },
      {
        id: "e2e-restored-project",
        title: projectTitle,
        icon: "B",
        isInbox: false,
        orderToken: "b",
        createdAt,
      },
    ],
    projectSections: [
      {
        id: "e2e-inbox-section",
        title: "Miscellaneous",
        projectId: "e2e-inbox-project",
        orderToken: "a",
        createdAt,
      },
      {
        id: "e2e-restored-section",
        title: "Restored",
        projectId: "e2e-restored-project",
        orderToken: "a",
        createdAt,
      },
    ],
    tasks: [
      {
        id: "e2e-restored-task",
        title: taskTitle,
        content: taskDescription,
        state: "todo",
        projectSectionId: "e2e-restored-section",
        orderToken: "a",
        lastToggledAt: 0,
        createdAt,
        nature: "unknown",
        templateId: null,
        templateDate: null,
      },
    ],
    dailyLists: [
      {
        id: "e2e-today-list",
        date,
      },
    ],
    dailyListProjections: [
      {
        id: "e2e-restored-task",
        orderToken: "a",
        listId: "e2e-today-list",
        createdAt,
      },
    ],
    taskTemplates: [],
    checklistItems: [
      {
        id: "e2e-restored-checklist-item",
        parentId: "e2e-restored-task",
        parentType: "task",
        orderToken: "a",
        state: "todo",
        content: checklistItem,
        createdAt,
        checkedAt: null,
      },
    ],
  };
}
