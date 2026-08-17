import { expect, test } from "playwright/test";

import { createSpace, signupUser, uniqueE2EName } from "./helpers";

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
