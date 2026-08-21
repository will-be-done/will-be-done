import { expect, test } from "playwright/test";

import {
  createSpace,
  openSpace,
  openSpaceSettings,
  signupUser,
  uniqueE2EName,
} from "./helpers";

test("deletes a space from the spaces page", async ({ page }) => {
  await signupUser(page);

  const spaceName = uniqueE2EName("Space to delete");
  await createSpace(page, spaceName);

  const spaceCard = page.locator("[data-space-card]").filter({
    hasText: spaceName,
  });
  await expect(spaceCard).toBeVisible();

  const deleteButton = spaceCard.getByRole("button", { name: "Delete space" });
  await deleteButton.hover();
  const deleteIconBounds = await deleteButton.locator("svg").boundingBox();
  expect(deleteIconBounds).not.toBeNull();

  page.on("dialog", (dialog) => dialog.accept());
  await page.mouse.click(
    deleteIconBounds!.x + deleteIconBounds!.width - 2,
    deleteIconBounds!.y + deleteIconBounds!.height / 2,
  );

  await expect(spaceCard).toHaveCount(0);
  await expect(page).toHaveURL(/\/spaces\/?$/);
});

test("creates a space with a custom workday", async ({ page }) => {
  await signupUser(page);

  const spaceName = uniqueE2EName("Workday space");
  await createSpace(page, spaceName, {
    dayStart: "08:00",
    dayEnd: "17:00",
    breaks: [{ start: "12:00", end: "12:30" }],
  });

  await openSpace(page, spaceName);
  const settings = await openSpaceSettings(page);

  await expect(settings.getByLabel("Day starts at")).toHaveValue("08:00");
  await expect(settings.getByLabel("Day ends at")).toHaveValue("17:00");
  await expect(settings.getByLabel("Break starts at")).toHaveValue("12:00");
  await expect(settings.getByLabel("Break ends at")).toHaveValue("12:30");
});
