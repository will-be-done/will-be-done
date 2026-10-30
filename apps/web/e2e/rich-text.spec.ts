import { expect, test } from "playwright/test";

import {
  createSpace,
  createTodayTask,
  openSpace,
  openTaskDetails,
  signupUser,
  taskItem,
  uniqueE2EName,
} from "./helpers";

test("formats titles and descriptions as markdown and keeps them after reload", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Rich Text Space");
  const taskTitle = uniqueE2EName("E2E rich task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  const item = await createTodayTask(page, taskTitle);

  await item.click();
  await expect(item).toBeFocused();
  await page.keyboard.press("Enter");
  const titleEditor = item.getByLabel("Edit task title");
  await expect(titleEditor).toBeFocused();
  await page.keyboard.type(" **urgent**");
  await expect(titleEditor.locator("strong")).toHaveText("urgent");
  await expect(titleEditor.locator(".rich-text-marker")).toHaveText([
    "**",
    "**",
  ]);
  await page.keyboard.type(" ");
  await expect(titleEditor.locator(".rich-text-marker")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(item.locator("strong")).toHaveText("urgent");

  const { description } = await openTaskDetails(page, taskTitle);
  await page.keyboard.type("## Plan");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- first *step*");
  await expect(description.locator("h2")).toHaveText("Plan");
  await expect(description.locator("li em")).toHaveText("step");
  await page.keyboard.press("Escape");

  const descriptionView = page.getByTestId("task-description");
  await expect(descriptionView.locator("h2")).toHaveText("Plan");

  await descriptionView.click();
  await expect(description).toBeFocused();
  await description.locator("h2").click({ clickCount: 3 });
  const bold = page.getByRole("button", { name: "Bold", exact: true });
  await bold.click();
  await expect(description.locator("h2 strong")).toHaveText("Plan");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ControlOrMeta+i");
  await expect(description.locator("h2 strong em")).toHaveText("Plan");
  await description.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "https://example.com/plan");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(description.locator("h2 a")).toHaveText("Plan");
  await page.keyboard.press("Escape");
  const planLink = descriptionView.getByRole("link", { name: "Plan" });
  await expect(planLink).toHaveAttribute("href", "https://example.com/plan");

  const checklistRows = page
    .getByTestId("item-details-panel")
    .locator("[data-checklist-item-id]");
  await page.getByRole("button", { name: "Add checklist item" }).click();
  const checklistEditor = page.getByRole("textbox", { name: "Checklist item" });
  await expect(checklistEditor).toBeFocused();
  await page.keyboard.type("Call **Bob** ");
  await expect(checklistEditor.locator("strong")).toHaveText("Bob");
  await page.keyboard.press("Enter");
  await expect(checklistRows).toHaveCount(2);
  await expect(checklistEditor).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(checklistRows).toHaveCount(1);
  await expect(checklistEditor).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(checklistRows.locator("strong")).toHaveText("Bob");

  await expect(
    page.getByRole("button", { name: "Sync status: All changes synced" }),
  ).toBeVisible();
  await page.reload();
  await expect(taskItem(page, taskTitle).locator("strong")).toHaveText([
    "urgent",
    "Bob",
  ]);
  await openTaskDetails(page, taskTitle);
  await page.keyboard.press("Escape");
  await expect(descriptionView.locator("h2")).toHaveText("Plan");
  await expect(descriptionView.locator("li em")).toHaveText("step");
  await expect(planLink.locator("strong, em").first()).toBeVisible();
  await expect(checklistRows.locator("strong")).toHaveText("Bob");
});
