import { expect, test } from "playwright/test";
import {
  createSpace,
  createTodayTask,
  openSpace,
  signupUser,
  uniqueE2EName,
} from "./helpers";

test("shows sync stages, last success, offline recovery, and shared tab status", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(60_000);
  const spaceName = uniqueE2EName("Sync indicator");
  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);

  const indicator = page.getByRole("button", { name: /^Sync status:/ });
  const tooltip = page.locator('[data-slot="tooltip-content"]');
  await expect(indicator).toHaveAttribute("data-sync-state", "synced");
  await indicator.hover();
  await expect(tooltip).toContainText("All changes synced");
  await expect(tooltip.locator("time").first()).toHaveAttribute(
    "datetime",
    /\d{4}-/,
  );
  await expect(tooltip).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("synced.png") });
  await page.mouse.move(600, 300);

  const secondPage = await context.newPage();
  await secondPage.goto(page.url());
  const secondIndicator = secondPage.getByRole("button", {
    name: /^Sync status:/,
  });
  await expect(secondIndicator).toHaveAttribute("data-sync-state", "synced");

  let releaseUpload!: () => void;
  const uploadGate = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  const chunkUrl = "**/api/sync/v4/space/**/chunks/*";
  await page.route(chunkUrl, async (route) => {
    await uploadGate;
    await route.continue();
  });
  // A follower write must wake the leader and update both dots.
  await createTodayTask(secondPage, uniqueE2EName("Sync progress task"));
  await expect(indicator).toHaveAccessibleName("Sync status: Sending changes");
  await expect(secondIndicator).toHaveAccessibleName(
    "Sync status: Sending changes",
  );
  await indicator.hover();
  await expect(tooltip).toContainText("Transfer progress");
  await expect(tooltip.getByRole("progressbar").first()).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await expect(indicator.locator("span")).toHaveCSS("animation-name", "pulse");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(indicator.locator("span")).toHaveCSS("animation-name", "none");
  releaseUpload();
  await expect(indicator).toHaveAttribute("data-sync-state", "synced");
  await expect(secondIndicator).toHaveAttribute("data-sync-state", "synced");
  await page.unroute(chunkUrl);

  const sessionUrl = "**/api/sync/v4/space/**/sessions";
  await page.route(sessionUrl, (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await createTodayTask(page, uniqueE2EName("Interrupted sync task"));
  await expect(indicator).toHaveAccessibleName("Sync status: Sync interrupted");
  await indicator.hover();
  await expect(tooltip).toContainText(
    "The server could not complete sync (503).",
  );
  await expect(tooltip.locator("time").first()).toHaveAttribute(
    "datetime",
    /\d{4}-/,
  );
  await page.unroute(sessionUrl);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(indicator).toHaveAttribute("data-sync-state", "synced");

  await context.setOffline(true);
  await expect(indicator).toHaveAccessibleName("Sync status: Offline");
  await expect(secondIndicator).toHaveAccessibleName("Sync status: Offline");
  await indicator.hover();
  await expect(tooltip).toContainText("will sync when you reconnect");
  await createTodayTask(page, uniqueE2EName("Offline sync task"));
  await expect(indicator).toHaveAttribute("data-sync-state", "disconnected");
  await context.setOffline(false);
  await expect(indicator).toHaveAttribute("data-sync-state", "synced");
  await expect(secondIndicator).toHaveAttribute("data-sync-state", "synced");

  await page.mouse.move(600, 300);
  await indicator.focus();
  await expect(tooltip).toContainText("All changes synced");
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await indicator.click();
  await expect(tooltip).toBeVisible();
});
