import { expect, test, type Browser, type Page } from "playwright/test";

import {
  createSpace,
  createTodayTask,
  openSpace,
  signInUser,
  signupUser,
  taskItem,
  uniqueE2EName,
  waitForSyncedText,
} from "./helpers";

const syncIndicator = (page: Page) =>
  page.getByRole("button", { name: /^Sync status:/ });

const expectSyncRole = async (page: Page, role: "leader" | "follower") => {
  await syncIndicator(page).click();
  await expect(page.locator('[data-slot="tooltip-content"]')).toContainText(
    role === "leader"
      ? "This tab syncs for all open tabs."
      : "Another open tab syncs for this one.",
  );
  await page.keyboard.press("Escape");
};

const openSecondTab = async (page: Page) => {
  const secondPage = await page.context().newPage();
  await secondPage.goto(page.url());
  await expect(
    secondPage.getByRole("button", { name: "Add task" }),
  ).toBeVisible();
  await expect(syncIndicator(secondPage)).toHaveAttribute(
    "data-sync-state",
    "synced",
  );
  return secondPage;
};

const openOtherDevice = async (
  browser: Browser,
  page: Page,
  credentials: { email: string; password: string },
  spaceName: string,
) => {
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const other = await context.newPage();
  await signInUser(other, credentials);
  await openSpace(other, spaceName);
  await expect(syncIndicator(other)).toHaveAttribute(
    "data-sync-state",
    "synced",
  );
  return { context, page: other };
};

test("every open tab shows a change synced from another device", async ({
  browser,
  page,
}) => {
  const spaceName = uniqueE2EName("Multi-tab download space");
  const remoteTitle = uniqueE2EName("Remote device task");

  const credentials = await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await expect(syncIndicator(page)).toHaveAttribute(
    "data-sync-state",
    "synced",
  );
  const secondPage = await openSecondTab(page);

  const otherDevice = await openOtherDevice(
    browser,
    page,
    credentials,
    spaceName,
  );
  try {
    const synced = waitForSyncedText(otherDevice.page, remoteTitle);
    await createTodayTask(otherDevice.page, remoteTitle);
    await synced;

    await expect(taskItem(page, remoteTitle)).toBeVisible();
    await expect(taskItem(secondPage, remoteTitle)).toBeVisible();
  } finally {
    await otherDevice.context.close();
  }
});

test("a follower tab takes over sync when the leader tab closes", async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000);
  const spaceName = uniqueE2EName("Multi-tab handoff space");
  const followerTitle = uniqueE2EName("Follower task");
  const newLeaderTitle = uniqueE2EName("New leader task");

  const credentials = await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await expect(syncIndicator(page)).toHaveAttribute(
    "data-sync-state",
    "synced",
  );
  const secondPage = await openSecondTab(page);
  await expectSyncRole(page, "leader");
  await expectSyncRole(secondPage, "follower");

  // While the first tab leads, a follower write is uploaded by the leader.
  const uploadedByLeader = waitForSyncedText(page, followerTitle);
  await createTodayTask(secondPage, followerTitle);
  await expect(taskItem(page, followerTitle)).toBeVisible();
  await uploadedByLeader;
  await expect(syncIndicator(secondPage)).toHaveAttribute(
    "data-sync-state",
    "synced",
  );

  await page.close();
  await expectSyncRole(secondPage, "leader");

  // The remaining tab must be elected and upload its own writes itself.
  const uploadedByNewLeader = waitForSyncedText(secondPage, newLeaderTitle);
  await createTodayTask(secondPage, newLeaderTitle);
  await uploadedByNewLeader;
  await expect(syncIndicator(secondPage)).toHaveAttribute(
    "data-sync-state",
    "synced",
  );

  const otherDevice = await openOtherDevice(
    browser,
    secondPage,
    credentials,
    spaceName,
  );
  try {
    await expect(taskItem(otherDevice.page, followerTitle)).toBeVisible();
    await expect(taskItem(otherDevice.page, newLeaderTitle)).toBeVisible();
  } finally {
    await otherDevice.context.close();
  }

  // Reloading shows the persisted state once, without duplicates.
  await secondPage.reload();
  await expect(taskItem(secondPage, followerTitle)).toHaveCount(1);
  await expect(taskItem(secondPage, newLeaderTitle)).toHaveCount(1);
});

test("a new tab opened after a handoff syncs from the elected leader", async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000);
  const spaceName = uniqueE2EName("Multi-tab late tab space");
  const remoteTitle = uniqueE2EName("Remote after handoff task");

  const credentials = await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await expect(syncIndicator(page)).toHaveAttribute(
    "data-sync-state",
    "synced",
  );
  const secondPage = await openSecondTab(page);
  await page.close();

  // A third tab arrives while the second one is taking over leadership.
  const thirdPage = await openSecondTab(secondPage);

  const otherDevice = await openOtherDevice(
    browser,
    secondPage,
    credentials,
    spaceName,
  );
  try {
    const synced = waitForSyncedText(otherDevice.page, remoteTitle);
    await createTodayTask(otherDevice.page, remoteTitle);
    await synced;

    await expect(taskItem(secondPage, remoteTitle)).toBeVisible({
      timeout: 15_000,
    });
    await expect(taskItem(thirdPage, remoteTitle)).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await otherDevice.context.close();
  }
});
