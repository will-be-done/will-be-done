import { expect, test } from "playwright/test";

import { signInUser, signupUser, signOutUser } from "./helpers";

test("signs up, signs out, and signs in", async ({ page }) => {
  const user = await signupUser(page);

  await signOutUser(page);

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();

  await signInUser(page, user);

  await expect(page).toHaveURL(/\/spaces\/?$/);
  await expect(
    page.getByRole("heading", { name: "Your Spaces" }),
  ).toBeVisible();
});
