import { randomUUID } from "node:crypto";

import { expect, type Locator, type Page } from "playwright/test";
import {
  dailyEntryType,
  stashEntryType,
} from "../../slices/src/space/tables.ts";

export const E2E_PASSWORD = "Playwright123!";

type UserOptions = {
  email?: string;
  password?: string;
};

type UserCredentials = {
  email: string;
  password: string;
};

export function uniqueE2EName(prefix: string) {
  return `${prefix} ${Date.now()} ${randomUUID().slice(0, 8)}`;
}

export async function signupUser(
  page: Page,
  options: UserOptions = {},
): Promise<UserCredentials> {
  const email =
    options.email ?? `e2e-${Date.now()}-${randomUUID()}@example.com`;
  const password = options.password ?? E2E_PASSWORD;

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

  return { email, password };
}

export async function signInUser(
  page: Page,
  { email, password }: UserCredentials,
) {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();

  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await expect(page).toHaveURL(/\/spaces\/?$/);
  await expect(
    page.getByRole("heading", { name: "Your Spaces" }),
  ).toBeVisible();
}

export async function createSpace(
  page: Page,
  spaceName: string,
  options: {
    dayStart?: string;
    dayEnd?: string;
    breaks?: { start: string; end: string }[];
  } = {},
) {
  const createFirstSpaceButton = page.getByRole("button", {
    name: "Create your first space",
  });

  if (await createFirstSpaceButton.isVisible()) {
    await createFirstSpaceButton.click();
  } else {
    await page.getByRole("button", { name: "New Space" }).click();
  }

  const dialog = page.getByRole("dialog", { name: "New space" });
  await dialog.getByLabel("Space name").fill(spaceName);
  await dialog.getByRole("button", { name: "Next" }).click();

  await expect(dialog.getByLabel("Day starts at")).toBeVisible();
  if (options.dayStart) {
    await dialog.getByLabel("Day starts at").fill(options.dayStart);
  }
  if (options.dayEnd) {
    await dialog.getByLabel("Day ends at").fill(options.dayEnd);
  }
  await dialog.getByRole("button", { name: "Next" }).click();

  await expect(dialog.getByRole("button", { name: "Add break" })).toBeVisible();
  for (const item of options.breaks ?? []) {
    await dialog.getByRole("button", { name: "Add break" }).click();
    const startInputs = dialog.getByLabel("Break starts at");
    const endInputs = dialog.getByLabel("Break ends at");
    const index = (await startInputs.count()) - 1;
    await startInputs.nth(index).fill(item.start);
    await endInputs.nth(index).fill(item.end);
  }
  await dialog.getByRole("button", { name: "Create space" }).click();

  await expect(page.getByText(spaceName, { exact: true })).toBeVisible();
}

export async function openSpace(page: Page, spaceName: string) {
  await page
    .getByRole("link", { name: new RegExp(escapeRegExp(spaceName)) })
    .click();

  await expect(page).toHaveURL(/\/spaces\/[^/]+\/dates\/\d{4}-\d{2}-\d{2}$/);
}

export async function createTodayTask(page: Page, title: string) {
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Task description").fill(title);
  await page.keyboard.press("Enter");

  const item = taskItem(page, title);
  await expect(item).toBeVisible();

  return item;
}

export async function createProjectTask(page: Page, title: string) {
  await page.locator("[data-focus-placeholder]").first().focus();
  await page.keyboard.press("KeyO");
  await page.getByLabel("Task description").fill(title);
  await page.keyboard.press("Enter");

  const item = projectTaskItem(page, title);
  await expect(item).toBeVisible();

  return item;
}

export async function createProject(page: Page, title: string) {
  await page.getByRole("button", { name: /add project/i }).click();

  const dialog = page.getByRole("dialog", { name: "Enter project title" });
  await dialog.getByRole("textbox").fill(title);
  await dialog.getByRole("button", { name: "Confirm" }).click();

  await expect(projectSidebarLink(page, title)).toBeVisible();
}

export async function openTaskActions(page: Page, title: string) {
  const item = taskItem(page, title);
  await expect(item).toBeVisible();
  await item.click();

  const actionsButton = item.getByRole("button", { name: "Task actions" });
  await expect(actionsButton).toBeVisible();
  await actionsButton.click();

  await expect(page.getByRole("menu")).toBeVisible();
}

export async function openTaskDetails(page: Page, title: string) {
  const item = taskItem(page, title);
  await expect(item).toBeVisible();
  await item.click();

  const detailsButton = page.getByRole("button", { name: "Task details" });
  const description = page.getByLabel("Edit task description");
  const hasDetailsRouteButton = await isVisibleInViewportSoon(
    page,
    detailsButton,
  );

  if (hasDetailsRouteButton) {
    await detailsButton.click();
    await expect(page).toHaveURL(/\/spaces\/[^/]+\/item-details\/[^/]+$/);
    await expect(description).toBeVisible();

    return { item, description };
  }

  const isAlreadyOpen = await description
    .waitFor({ state: "visible", timeout: 500 })
    .then(() => true)
    .catch(() => false);

  if (!isAlreadyOpen) {
    await page.keyboard.press("KeyV");
  }

  await expect(page.getByText("Item Details")).toBeVisible();
  await expect(description).toBeVisible();

  return { item, description };
}

export async function openSpaceSettings(page: Page) {
  await page.getByRole("button", { name: "Space settings" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Settings" })).toBeVisible();

  return dialog;
}

export function taskItem(page: Page, title: string): Locator {
  return page.locator("[data-focusable-key]").filter({ hasText: title });
}

export function dailyTaskItem(page: Page, title: string): Locator {
  return page
    .locator(`[data-focusable-key^="${dailyEntryType}^^"]`)
    .filter({ hasText: title });
}

export function projectTaskItem(page: Page, title: string): Locator {
  return page
    .locator('[data-focusable-key^="task^^"]')
    .filter({ hasText: title });
}

export function templateItem(page: Page, title: string): Locator {
  return page
    .locator('[data-focusable-key^="template^^"]')
    .filter({ hasText: title });
}

export function projectSidebarLink(
  page: Page,
  title: string,
  notDoneCount?: number,
): Locator {
  const name = notDoneCount
    ? new RegExp(`${escapeRegExp(title)}\\s+${notDoneCount}$`)
    : new RegExp(escapeRegExp(title));

  return page.getByRole("link", { name });
}

export function stashPanel(page: Page): Locator {
  return page.getByTestId("stash-panel");
}

export function stashTaskItem(page: Page, title: string): Locator {
  return stashPanel(page)
    .locator(`[data-focusable-key^="${stashEntryType}^^"]`)
    .filter({ hasText: title });
}

export function checklistItemRow(page: Page): Locator {
  return page
    .locator("[data-checklist-item-id]")
    .filter({ has: page.getByRole("textbox", { name: "Checklist item" }) });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function isVisibleInViewportSoon(page: Page, locator: Locator) {
  const isVisible = await locator
    .waitFor({ state: "visible", timeout: 500 })
    .then(() => true)
    .catch(() => false);

  if (!isVisible) return false;

  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  if (!box || !viewport) return false;

  return (
    box.x + box.width > 0 &&
    box.y + box.height > 0 &&
    box.x < viewport.width &&
    box.y < viewport.height
  );
}
