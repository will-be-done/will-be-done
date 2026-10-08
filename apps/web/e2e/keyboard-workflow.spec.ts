import { expect, type Locator, test } from "playwright/test";

import {
  createProjectTask,
  createSpace,
  dailyTaskItem,
  openSpace,
  projectTaskItem,
  signupUser,
  stashPanel,
  stashTaskItem,
  uniqueE2EName,
} from "./helpers";

test("supports a keyboard-only planning loop", async ({ page }) => {
  const spaceName = uniqueE2EName("E2E Keyboard Space");
  const firstTitle = uniqueE2EName("E2E keyboard first task");
  const aboveTitle = uniqueE2EName("E2E keyboard above task");
  const belowTitle = uniqueE2EName("E2E keyboard below task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/projects\/[^/]+$/);

  const firstItem = await createProjectTask(page, firstTitle);
  await firstItem.click();
  await expectFocused(firstItem);

  await page.keyboard.press("KeyO");
  await page.getByLabel("Edit task title").fill(belowTitle);
  await page.keyboard.press("Enter");
  await expect(projectTaskItem(page, belowTitle)).toBeVisible();

  await projectTaskItem(page, belowTitle).click();
  await page.keyboard.down("Shift");
  await page.keyboard.press("KeyO");
  await page.keyboard.up("Shift");
  await page.getByLabel("Edit task title").fill(aboveTitle);
  await page.keyboard.press("Enter");
  await expect(projectTaskItem(page, aboveTitle)).toBeVisible();

  await projectTaskItem(page, firstTitle).click();
  await page.keyboard.press("KeyJ");
  await expectFocused(projectTaskItem(page, aboveTitle));

  await page.keyboard.press("KeyK");
  await expectFocused(projectTaskItem(page, firstTitle));

  await page.keyboard.press("Space");
  await expect(projectTaskItem(page, firstTitle)).toHaveAttribute(
    "data-ignore-drop",
    "true",
  );

  await projectTaskItem(page, aboveTitle).click();
  await page.keyboard.press("KeyT");

  await page.getByRole("link", { name: /today/i }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/dates\/\d{4}-\d{2}-\d{2}$/);
  await expect(dailyTaskItem(page, aboveTitle)).toBeVisible();

  await dailyTaskItem(page, aboveTitle).click();
  await page.keyboard.press("KeyR");
  await expect(dailyTaskItem(page, aboveTitle)).toHaveCount(0);

  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await expect(projectTaskItem(page, aboveTitle)).toBeVisible();

  await projectTaskItem(page, belowTitle).click();
  await page.keyboard.down("Shift");
  await page.keyboard.press("KeyS");
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("stash-count")).toHaveText("1");

  await page.keyboard.press("Backslash");
  await expect(stashPanel(page)).toHaveAttribute("aria-hidden", "false");
  await expect(stashTaskItem(page, belowTitle)).toBeVisible();

  await page.getByRole("link", { name: "timeline" }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/timeline\/\d{4}-\d{2}-\d{2}/);
  await expect(stashPanel(page)).toHaveAttribute("aria-hidden", "false");
  await stashTaskItem(page, belowTitle).click();
  await page.keyboard.press("KeyV");
  await expect(page.getByTestId("item-details-panel")).toHaveAttribute(
    "aria-hidden",
    "false",
  );

  await stashTaskItem(page, belowTitle).press("KeyZ");
  await expect(stashPanel(page)).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByTestId("item-details-panel")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});

async function expectFocused(item: Locator) {
  await expect(item).toHaveClass(/ring-2 ring-accent/);
}
