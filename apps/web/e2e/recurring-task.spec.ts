import { expect, test, type Page } from "playwright/test";
import { addDays, format } from "date-fns";

import {
  createProjectTask,
  createSpace,
  dailyTaskItem,
  openSpace,
  openTaskActions,
  projectTaskItem,
  signupUser,
  templateItem,
  uniqueE2EName,
} from "./helpers";

test("converts a task into a recurring template and persists it", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Recurring Space");
  const taskTitle = uniqueE2EName("E2E recurring task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/projects\/[^/]+$/);

  await createProjectTask(page, taskTitle);
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();
  await expect(templateItem(page, taskTitle)).toHaveCount(0);

  await openTaskActions(page, taskTitle);
  await page.getByRole("menuitem", { name: /convert to template/i }).click();

  await expect(page.getByRole("heading", { name: "Repeat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Daily" })).toBeVisible();
  await page.getByRole("button", { name: "Ok" }).click();

  await expect(templateItem(page, taskTitle)).toBeVisible();
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();

  const detailsPanel = await openTemplateDetails(page, taskTitle);
  await expect(
    detailsPanel.getByText("Repeat:", { exact: true }),
  ).toBeVisible();
  await expect(
    detailsPanel.getByRole("button", { name: "every day" }),
  ).toBeVisible();

  await page.reload();

  await expect(templateItem(page, taskTitle)).toBeVisible();
  await expect(projectTaskItem(page, taskTitle)).toBeVisible();

  const reloadedDetailsPanel = await openTemplateDetails(page, taskTitle);
  await expect(
    reloadedDetailsPanel.getByRole("button", { name: "every day" }),
  ).toBeVisible();
});

test("previews upcoming occurrences in the timeline and day views", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Recurring Preview Space");
  const taskTitle = uniqueE2EName("E2E previewed task");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
  const occurrence = page.locator(
    `[data-focusable-key^="template^^"][data-occurrence-date="${tomorrow}"]`,
    { hasText: taskTitle },
  );

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await createProjectTask(page, taskTitle);
  await openTaskActions(page, taskTitle);
  await page.getByRole("menuitem", { name: /convert to template/i }).click();
  await page.getByRole("button", { name: "Ok" }).click();
  await expect(templateItem(page, taskTitle)).toBeVisible();

  await page.getByRole("link", { name: "timeline", exact: true }).click();
  await expect(page).toHaveURL(/\/timeline\/\d{4}-\d{2}-\d{2}/);
  await expect(occurrence).toBeVisible();

  // Focusing the preview shows its template in item details.
  await occurrence.click();
  const detailsPanel = page.getByTestId("item-details-panel");
  if ((await detailsPanel.getAttribute("aria-hidden")) !== "false") {
    await page.keyboard.press("KeyV");
  }
  await expect(
    detailsPanel.getByRole("button", { name: "every day" }),
  ).toBeVisible();

  // "o" on a focused preview adds a task to its day.
  const addedTitle = uniqueE2EName("E2E task added from preview");
  await occurrence.click();
  await page.keyboard.press("KeyO");
  await page.getByLabel("Edit task title").fill(addedTitle);
  await page.keyboard.press("Enter");
  await expect(dailyTaskItem(page, addedTitle)).toBeVisible();

  await page.getByRole("link", { name: "projects", exact: true }).click();
  await page.getByRole("link", { name: "Next day" }).click();
  await expect(page).toHaveURL(new RegExp(`/dates/${tomorrow}`));
  await expect(occurrence).toBeVisible();
  await expect(dailyTaskItem(page, addedTitle)).toBeVisible();
});

async function openTemplateDetails(page: Page, title: string) {
  const detailsPanel = page.getByTestId("item-details-panel");

  await templateItem(page, title).click();

  if ((await detailsPanel.getAttribute("aria-hidden")) !== "false") {
    await page.keyboard.press("KeyV");
  }

  await expect(detailsPanel).toHaveAttribute("aria-hidden", "false");
  await expect(
    detailsPanel.getByRole("button", { name: "Convert to task" }),
  ).toBeVisible();

  return detailsPanel;
}
