import { expect, test } from "playwright/test";

import {
  createSpace,
  createTodayTask,
  openSpace,
  openSpaceSettings,
  signupUser,
  uniqueE2EName,
} from "./helpers";

test("shows new HyperDB actions when the devtool is enabled", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E HyperDB Devtool Space");
  const taskTitle = uniqueE2EName("E2E HyperDB Devtool task");

  await page.addInitScript(() => {
    localStorage.setItem("will-be-done:hyperdb-devtools-enabled", "false");
    localStorage.setItem("hyperdb-devtools-open", "false");
  });

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  const settings = await openSpaceSettings(page);
  const devtoolSwitch = settings.getByRole("switch", {
    name: "Enable HyperDB Devtool",
  });

  await expect(devtoolSwitch).toHaveAttribute("aria-checked", "false");
  await devtoolSwitch.click();
  await expect(devtoolSwitch).toHaveAttribute("aria-checked", "true");

  const devtool = page.getByText("HyperDB", { exact: true });
  await expect(devtool).toBeVisible();
  await settings.getByRole("button", { name: "Close settings" }).click();

  const databaseSelect = page.getByLabel("HyperDB database");
  const spaceDatabaseValue = await databaseSelect
    .locator("option")
    .evaluateAll((options) =>
      options
        .filter((option) => option.textContent === "persistent")
        .at(-1)
        ?.getAttribute("value"),
    );
  expect(spaceDatabaseValue).toBeTruthy();
  if (!spaceDatabaseValue) throw new Error("Space database is not registered");
  await databaseSelect.selectOption(spaceDatabaseValue);

  await page.getByRole("tab", { name: /act/i }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("0 traces", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: /sort direction descending/i })
    .click();

  await createTodayTask(page, taskTitle);

  await expect(
    page.getByRole("button", { name: /createTaskInList/ }),
  ).toBeVisible();
});
