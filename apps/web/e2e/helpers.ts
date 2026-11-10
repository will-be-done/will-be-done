import { deflateSync } from "node:zlib";
import { randomUUID } from "node:crypto";

import {
  expect,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "playwright/test";
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

export async function createSpace(page: Page, spaceName: string) {
  const createFirstSpaceButton = page.getByRole("button", {
    name: "Create your first space",
  });

  if (await createFirstSpaceButton.isVisible()) {
    await createFirstSpaceButton.click();
  } else {
    await page.getByRole("button", { name: "New Space" }).click();
  }

  const dialog = page.getByRole("dialog", { name: "Enter space name:" });
  await dialog.getByRole("textbox").fill(spaceName);
  await dialog.getByRole("button", { name: "Confirm" }).click();

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
  await page.getByLabel("Edit task title").fill(title);
  await page.keyboard.press("Enter");

  const item = taskItem(page, title);
  await expect(item).toBeVisible();

  return item;
}

export async function createProjectTask(page: Page, title: string) {
  await page
    .locator(
      '[data-column-model-type="projectSection"] [data-focus-placeholder]',
    )
    .first()
    .focus();
  await page.keyboard.press("KeyO");
  await page.getByLabel("Edit task title").fill(title);
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
    await description.focus();

    return { item, description };
  }

  const itemDetailsPanel = page.getByTestId("item-details-panel");
  const isAlreadyOpen =
    (await itemDetailsPanel.getAttribute("aria-hidden")) === "false";

  if (!isAlreadyOpen) {
    await page.keyboard.press("KeyV");
  }

  await expect(itemDetailsPanel).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByText("Item Details")).toBeVisible();
  await description.focus();

  return { item, description };
}

export async function openSpaceSettings(
  page: Page,
  section:
    | "General"
    | "Account"
    | "Calendars"
    | "API tokens"
    | "Files"
    | "Backup"
    | "Import" = "General",
) {
  await page.getByRole("link", { name: "Space settings" }).click();
  await page
    .getByRole("navigation", { name: "Settings" })
    .getByRole("link", { name: section, exact: true })
    .click();

  const settings = page.getByRole("main");
  await expect(
    settings.getByRole("heading", { level: 1, name: section }),
  ).toBeVisible();

  return settings;
}

export async function closeSpaceSettings(page: Page) {
  await page.getByRole("link", { name: "Back", exact: true }).click();
}

// A new space reaches the server with its first sync; server-side calls fail
// with "Space not found" before that.
export async function waitForSpaceOnServer(page: Page) {
  const spaceId = new URL(page.url()).pathname.split("/")[2];
  expect(spaceId).toBeTruthy();
  await expect(
    page
      .getByRole("button", { name: "Sync status: All changes synced" })
      .first(),
  ).toBeVisible({ timeout: 15_000 });
  const sessionToken = await page.evaluate(() =>
    localStorage.getItem("auth_token"),
  );
  expect(sessionToken).toBeTruthy();

  return {
    spaceId,
    authorization: { Authorization: `Bearer ${sessionToken}` },
  };
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
  return page.locator("[data-checklist-item-id]");
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

export async function signOutUser(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
}

export async function openAccountSettings(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Account settings" }).click();
}

// Resolves once the server commits a sync upload carrying `text`. Wait for it
// before a reload: a reload right after a write can drop it from IndexedDB.
export function waitForSyncedText(page: Page, text: string) {
  return new Promise<void>((resolve) => {
    const uploads = new Set<string>();
    const onRequest = (request: Request) => {
      if (
        request.method() === "PUT" &&
        request.url().includes("/api/sync/v4/") &&
        (request.postData() ?? "").includes(text)
      ) {
        uploads.add(new URL(request.url()).pathname.split("/chunks/")[0]);
      }
    };
    const onResponse = (response: Response) => {
      const path = new URL(response.url()).pathname;
      if (!response.ok() || !uploads.has(path.replace(/\/commit$/, ""))) {
        return;
      }
      page.off("request", onRequest);
      page.off("response", onResponse);
      resolve();
    };
    page.on("request", onRequest);
    page.on("response", onResponse);
  });
}

export function scrollViewport(container: Locator): Locator {
  return container.locator('[data-slot="scroll-area-viewport"]');
}

// Resolves with the viewport's scroll position at its next `scroll` event.
// Call before the action that should scroll it.
export async function nextScroll(viewport: Locator) {
  const pending = await viewport.evaluateHandle((el) => ({
    position: new Promise<{ top: number; left: number }>((resolve) =>
      el.addEventListener(
        "scroll",
        () => resolve({ top: el.scrollTop, left: el.scrollLeft }),
        { once: true },
      ),
    ),
  }));
  return () => pending.evaluate(({ position }) => position);
}

// A solid-color PNG, large enough to see in screenshots.
export function solidPng(width: number, height: number) {
  const crc = (bytes: Buffer) => {
    let c = ~0;
    for (const byte of bytes) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.alloc(width * 3, Buffer.from([220, 60, 60])),
  ]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
