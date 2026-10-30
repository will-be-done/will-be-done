import { expect, test, type Page } from "playwright/test";

import {
  checklistItemRow,
  createSpace,
  createTodayTask,
  openSpace,
  openTaskDetails,
  signupUser,
  taskItem,
  uniqueE2EName,
} from "./helpers";

async function createChecklistItemInTaskDetails(page: Page) {
  const spaceName = uniqueE2EName("E2E Checklist Space");
  const taskTitle = uniqueE2EName("E2E checklist task");
  const checklistItem = uniqueE2EName("E2E removable checklist item");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createTodayTask(page, taskTitle);
  await openTaskDetails(page, taskTitle);

  await page
    .locator("[data-checklist-container]")
    .getByText("Add checklist item", { exact: true })
    .click();

  const checklistInput = page.getByRole("textbox", {
    name: "Checklist item",
  });
  await checklistInput.fill(checklistItem);
  await checklistInput.blur();
  await expect(checklistItemRow(page)).toContainText(checklistItem);

  return { checklistItem, row: checklistItemRow(page) };
}

test("edits task details and persists checklist items", async ({ page }) => {
  const spaceName = uniqueE2EName("E2E Details Space");
  const taskTitle = uniqueE2EName("E2E details task");
  const description = uniqueE2EName("E2E persisted description");
  const checklistItem = uniqueE2EName("E2E persisted checklist item");

  await page.setViewportSize({ width: 390, height: 844 });

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  await createTodayTask(page, taskTitle);

  const details = await openTaskDetails(page, taskTitle);
  await details.description.fill(description);

  await page
    .locator("[data-checklist-container]")
    .getByText("Add checklist item", { exact: true })
    .click();

  const checklistInput = page.getByRole("textbox", {
    name: "Checklist item",
  });
  await expect(checklistInput).toBeVisible();
  await checklistInput.fill(checklistItem);
  await checklistInput.blur();

  const row = checklistItemRow(page);
  await expect(row).toBeVisible();
  await expect(row).toContainText(checklistItem);
  await row.getByRole("checkbox").click();
  await expect(row.getByRole("checkbox")).toBeChecked();

  await page.waitForTimeout(500);

  await page.reload();

  await expect(page).toHaveURL(/\/spaces\/[^/]+\/item-details\/[^/]+$/);
  await expect(page.getByTestId("task-description")).toHaveText(description);

  const reloadedRow = checklistItemRow(page);
  await expect(reloadedRow).toBeVisible();
  await expect(reloadedRow).toContainText(checklistItem);
  await expect(reloadedRow.getByRole("checkbox")).toBeChecked();
  await reloadedRow.getByText(checklistItem, { exact: true }).click();
  await expect(
    reloadedRow.getByRole("textbox", { name: "Checklist item" }),
  ).toHaveText(checklistItem);

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/dates\/\d{4}-\d{2}-\d{2}$/);
  await expect(
    taskItem(page, taskTitle).getByText(checklistItem),
  ).toBeVisible();
});

test("makes links in task text and checklist items clickable", async ({
  page,
}) => {
  await page
    .context()
    .route(/^https:\/\/(www\.)?example\.com\//, (route) =>
      route.fulfill({ contentType: "text/html", body: "Link destination" }),
    );
  const spaceName = uniqueE2EName("E2E Linked Text Space");
  const originalTitle = uniqueE2EName("E2E linked text task");
  const linkedTitle = `${originalTitle} https://example.com/title`;

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createTodayTask(page, originalTitle);

  const details = await openTaskDetails(page, originalTitle);
  await details.description.fill("Read `www.example.com/docs`.");
  await details.description.blur();

  const detailsPanel = page.getByTestId("item-details-panel");
  const descriptionLink = detailsPanel
    .getByTestId("task-description")
    .getByRole("link", { name: "www.example.com/docs" });
  await expect(descriptionLink).toHaveAttribute(
    "href",
    "https://www.example.com/docs",
  );
  await expect(descriptionLink).toHaveAttribute("target", "_blank");

  await detailsPanel
    .locator("[data-checklist-container]")
    .getByText("Add checklist item", { exact: true })
    .click();
  const checklistEditor = detailsPanel.getByRole("textbox", {
    name: "Checklist item",
  });
  await checklistEditor.fill("Review https://example.com/checklist.");
  await checklistEditor.blur();

  const detailsChecklistLink = detailsPanel
    .locator("[data-checklist-item-id]")
    .getByRole("link", { name: "https://example.com/checklist" });
  await expect(detailsChecklistLink).toHaveAttribute(
    "href",
    "https://example.com/checklist",
  );
  await expect(detailsChecklistLink).toHaveAttribute("target", "_blank");

  await detailsPanel.getByTestId("task-title").click();
  const titleEditor = detailsPanel.getByLabel("Edit task title");
  await titleEditor.fill(linkedTitle);
  await titleEditor.press("Enter");

  const detailsTitleLink = detailsPanel
    .getByTestId("task-title")
    .getByRole("link", { name: "https://example.com/title" });
  await expect(detailsTitleLink).toHaveAttribute(
    "href",
    "https://example.com/title",
  );
  await expect(detailsTitleLink).toHaveAttribute("target", "_blank");

  const taskTitleLink = taskItem(page, linkedTitle).getByRole("link", {
    name: "https://example.com/title",
  });
  await expect(taskTitleLink).toHaveAttribute(
    "href",
    "https://example.com/title",
  );
  await expect(taskTitleLink).toHaveAttribute("target", "_blank");

  const taskChecklistLink = taskItem(page, linkedTitle).getByRole("link", {
    name: "https://example.com/checklist",
  });
  await expect(taskChecklistLink).toHaveAttribute(
    "href",
    "https://example.com/checklist",
  );
  await expect(taskChecklistLink).toHaveAttribute("target", "_blank");

  const task = taskItem(page, linkedTitle);
  const originalUrl = page.url();
  for (const { link, destination, readView, editor } of [
    {
      link: descriptionLink,
      destination: "https://www.example.com/docs",
      readView: detailsPanel.getByTestId("task-description"),
      editor: detailsPanel.getByLabel("Edit task description"),
    },
    {
      link: detailsChecklistLink,
      destination: "https://example.com/checklist",
      readView: detailsPanel.getByText("Review", { exact: false }),
      editor: checklistEditor,
    },
    {
      link: detailsTitleLink,
      destination: "https://example.com/title",
      readView: detailsPanel.getByTestId("task-title"),
      editor: titleEditor,
    },
    {
      link: taskTitleLink,
      destination: "https://example.com/title",
      readView: taskTitleLink,
      editor: task.getByLabel("Edit task title"),
    },
    {
      link: taskChecklistLink,
      destination: "https://example.com/checklist",
      readView: taskChecklistLink,
      editor: task.getByRole("textbox", { name: "Checklist item" }),
    },
  ]) {
    const popupPromise = page.waitForEvent("popup");
    await link.click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(destination);
    await expect(popup.locator("body")).toHaveText("Link destination");
    await popup.close();
    await expect(page).toHaveURL(originalUrl);
    await expect(readView).toBeVisible();
    await expect(editor).toHaveCount(0);
  }
});

for (const field of ["title", "description", "checklist"] as const) {
  test(`suppresses destructive task shortcuts in the focused ${field} read view`, async ({
    page,
  }) => {
    const taskTitle = uniqueE2EName("E2E protected task");
    const checklistText = "Protected checklist item";
    await signupUser(page);
    const spaceName = uniqueE2EName("E2E Protected Fields Space");
    await createSpace(page, spaceName);
    await openSpace(page, spaceName);
    await createTodayTask(page, taskTitle);
    const details = await openTaskDetails(page, taskTitle);
    await details.description.fill("Protected task description");
    await details.description.blur();
    const detailsPanel = page.getByTestId("item-details-panel");
    await detailsPanel
      .getByRole("button", { name: "Add checklist item" })
      .click();
    const checklistEditor = detailsPanel.getByRole("textbox", {
      name: "Checklist item",
    });
    await checklistEditor.fill(checklistText);
    await checklistEditor.blur();

    const readView =
      field === "checklist"
        ? detailsPanel
            .locator("[data-checklist-item-id] [data-disable-task-shortcuts]")
            .filter({ hasText: checklistText })
        : detailsPanel.getByTestId(`task-${field}`);
    for (const key of ["d", "x", "Backspace"]) {
      // Keep the task selected while keyboard focus belongs to a read view.
      await taskItem(page, taskTitle).focus();
      await readView.focus();
      await expect(readView).toBeFocused();
      await page.keyboard.press(key);
      await expect(readView).toBeFocused();
      await expect(taskItem(page, taskTitle)).toBeVisible();
      await page.reload();
      await expect(taskItem(page, taskTitle)).toBeVisible();
      const reloadedDetails = await openTaskDetails(page, taskTitle);
      await reloadedDetails.description.blur();
      await expect(detailsPanel.getByTestId("task-description")).toHaveText(
        "Protected task description",
      );
      await expect(
        detailsPanel.getByText(checklistText, { exact: true }),
      ).toBeVisible();
    }
  });
}

test("deletes a checklist item with the desktop hover action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const { checklistItem, row } = await createChecklistItemInTaskDetails(page);
  const deleteButton = row.getByRole("button", {
    name: "Delete checklist item",
  });

  await page.mouse.move(0, 0);
  await expect(deleteButton).toHaveCSS("opacity", "0");
  await row.hover();
  await expect(deleteButton).toHaveCSS("opacity", "1");

  await deleteButton.click();
  await expect(row).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(checklistItem, { exact: true })).toHaveCount(0);
});

test.describe("touch checklist actions", () => {
  test.use({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });

  test("keeps the delete action visible and usable", async ({ page }) => {
    const { row } = await createChecklistItemInTaskDetails(page);
    const deleteButton = row.getByRole("button", {
      name: "Delete checklist item",
    });

    await expect(deleteButton).toHaveCSS("opacity", "1");
    await deleteButton.tap();
    await expect(row).toHaveCount(0);
  });
});
