import { expect, test, type Page } from "playwright/test";

const createSpaceThroughUi = async (page: Page, spaceName: string) => {
  await page.getByRole("button", { name: "Create your first space" }).click();

  const dialog = page.getByRole("dialog", { name: "Enter space name:" });
  await dialog.getByRole("textbox").fill(spaceName);
  await dialog.getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByText(spaceName, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(spaceName) }).click();
  await expect(page).toHaveURL(/\/spaces\/[^/]+\/dates\/\d{4}-\d{2}-\d{2}$/);
};

const signUpThroughUi = async (page: Page, email: string, password: string) => {
  await page.goto("/signup");

  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();

  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/spaces\/?$/);
  await expect(
    page.getByRole("heading", { name: "Your Spaces" }),
  ).toBeVisible();
};

const getVisibleTaskCard = (page: Page, taskTitle: string) =>
  page
    .locator("[data-focusable-key]")
    .filter({ hasText: taskTitle })
    .filter({ visible: true });

const getCardBox = async (page: Page, taskTitle: string) => {
  const box = await getVisibleTaskCard(page, taskTitle).first().boundingBox();
  if (!box) {
    throw new Error(`Task card "${taskTitle}" is not visible`);
  }

  return box;
};

test("retains a focused task in its source day until focus leaves", async ({
  page,
}) => {
  const runId = `${Date.now()}-${test.info().workerIndex}`;
  const email = `e2e-retained-task-${runId}@example.com`;
  const password = "Playwright123!";
  const spaceName = `E2E Retained Task ${runId}`;
  const taskTitle = `Retained date move ${runId}`;

  await signUpThroughUi(page, email, password);
  await createSpaceThroughUi(page, spaceName);

  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Edit task title").fill(taskTitle);
  await page.keyboard.press("Enter");
  await expect(getVisibleTaskCard(page, taskTitle)).toHaveCount(1);
  await page.waitForTimeout(500);

  const dateUrlMatch = page
    .url()
    .match(/\/spaces\/([^/]+)\/dates\/(\d{4}-\d{2}-\d{2})$/);
  if (!dateUrlMatch) {
    throw new Error(`Expected date URL, got ${page.url()}`);
  }

  const [, spaceId, currentDate] = dateUrlMatch;
  await page.goto(`/spaces/${spaceId}/timeline/${currentDate}`);

  const taskCard = getVisibleTaskCard(page, taskTitle);
  await expect(taskCard).toHaveCount(1);
  await taskCard.click();

  const sourceBox = await getCardBox(page, taskTitle);
  const tomorrow = new Date(`${currentDate}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDayOfMonth = String(tomorrow.getDate());

  await page.keyboard.press("s");
  const calendar = page.getByRole("grid");
  await expect(calendar).toBeVisible();
  await calendar
    .locator("button")
    .filter({ hasText: new RegExp(`^${tomorrowDayOfMonth}$`) })
    .first()
    .click();

  await expect(taskCard).toHaveCount(1);
  await expect
    .poll(async () => {
      const box = await getCardBox(page, taskTitle);
      return Math.abs(box.x - sourceBox.x) + Math.abs(box.y - sourceBox.y);
    })
    .toBeLessThan(20);

  await page.keyboard.press("Shift+Tab");

  await expect(taskCard).toHaveCount(1);
  await expect
    .poll(async () => (await getCardBox(page, taskTitle)).x)
    .toBeGreaterThan(sourceBox.x + 30);
});
