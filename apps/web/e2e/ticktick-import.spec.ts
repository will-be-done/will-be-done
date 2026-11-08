import { expect, test } from "playwright/test";

import {
  createSpace,
  dailyTaskItem,
  openSpace,
  closeSpaceSettings,
  openSpaceSettings,
  projectSidebarLink,
  projectTaskItem,
  signupUser,
  uniqueE2EName,
} from "./helpers";

test("imports a TickTick CSV through settings", async ({ page }) => {
  const spaceName = uniqueE2EName("E2E TickTick Space");
  const folderName = uniqueE2EName("E2E TickTick Folder");
  const listName = uniqueE2EName("E2E TickTick List");
  const projectTitle = `${folderName}/${listName}`;
  const taskTitle = uniqueE2EName("E2E TickTick task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  const dateMatch = page.url().match(/\/dates\/(\d{4}-\d{2}-\d{2})$/);
  expect(dateMatch).not.toBeNull();
  const currentDate = dateMatch![1];

  const csv = createTinyTickTickCSV({
    folderName,
    listName,
    taskTitle,
    dueDate: `${currentDate}T09:00:00+0000`,
  });

  const settings = await openSpaceSettings(page, "Import");

  const importInput = page.getByTestId("ticktick-import-input");
  const confirmationPromise = page.waitForEvent("dialog");
  const uploadPromise = importInput.setInputFiles({
    name: "ticktick-export.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  const confirmation = await confirmationPromise;
  expect(confirmation.type()).toBe("confirm");
  expect(confirmation.message()).toContain("replace all existing data");
  await confirmation.accept();
  await uploadPromise;

  await expect(settings.getByText("Imported successfully")).toBeVisible();

  await closeSpaceSettings(page);

  await expect(projectSidebarLink(page, projectTitle, 1)).toBeVisible();
  await expect(dailyTaskItem(page, taskTitle)).toBeVisible();

  await projectSidebarLink(page, projectTitle, 1).click();
  await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();

  await page.reload();
  await expect(projectSidebarLink(page, projectTitle, 1)).toBeVisible();
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();

  await page.getByRole("link", { name: /today/i }).click();
  await expect(dailyTaskItem(page, taskTitle)).toBeVisible();
});

function createTinyTickTickCSV({
  folderName,
  listName,
  taskTitle,
  dueDate,
}: {
  folderName: string;
  listName: string;
  taskTitle: string;
  dueDate: string;
}) {
  return [
    q("Date: 2026-03-08+0000"),
    q("Version: 7.1"),
    q("Status: \n0 Normal\n1 Completed\n2 Archived"),
    [
      "Folder Name",
      "List Name",
      "Title",
      "Kind",
      "Tags",
      "Content",
      "Is Check list",
      "Start Date",
      "Due Date",
      "Reminder",
      "Repeat",
      "Priority",
      "Status",
      "Created Time",
      "Completed Time",
      "Order",
      "Timezone",
      "Is All Day",
      "Is Floating",
      "Column Name",
      "Column Order",
      "View Mode",
      "taskId",
      "parentId",
    ]
      .map(q)
      .join(","),
    [
      folderName,
      listName,
      taskTitle,
      "TEXT",
      "",
      "",
      "N",
      "",
      dueDate,
      "",
      "",
      "0",
      "0",
      "2024-01-01T00:00:00+0000",
      "",
      "0",
      "UTC",
      "false",
      "false",
      "",
      "0",
      "list",
      "1",
      "",
    ]
      .map(q)
      .join(","),
  ].join("\n");
}

function q(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
