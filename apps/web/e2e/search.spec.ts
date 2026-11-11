import { expect, test, type Page } from "playwright/test";
import {
  createProject,
  createProjectTask,
  createSpace,
  createTodayTask,
  openSpace,
  openTaskActions,
  signupUser,
  taskItem,
  uniqueE2EName,
} from "./helpers";

const searchDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Search" });

async function openSearchWithSlash(page: Page) {
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("/");
  await expect(searchDialog(page)).toBeVisible();
}

async function search(page: Page, query: string) {
  await searchDialog(page)
    .getByPlaceholder("Search tasks, notes, and topics...")
    .fill(query);
}

const results = (page: Page) => searchDialog(page).locator("[cmdk-item]");

async function goToToday(page: Page) {
  await page.getByRole("link", { name: /today/i }).first().click();
  await expect(page).toHaveURL(/\/dates\//);
}

test("finds tasks in any script and opens their page", async ({ page }) => {
  const spaceName = uniqueE2EName("Search Space");
  const projectTitle = uniqueE2EName("Search Project");
  const titles = {
    japanese: "東京都に行く",
    apart: "東京と京都",
    chinese: "北京烤鸭食谱",
    korean: "서울 맛집 목록",
    thai: "ซื้อนมสด",
    halfWidth: "ｶﾞｲﾄﾞﾌﾞｯｸ",
    latin: "Groceries for the café",
  };

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createProject(page, projectTitle);
  await expect(page).toHaveURL(/\/projects\//);
  for (const title of Object.values(titles)) {
    await createProjectTask(page, title);
  }
  await goToToday(page);

  await openSearchWithSlash(page);
  for (const [query, title, bold] of [
    ["京", titles.apart, "京"],
    ["東京都", titles.japanese, "東京都"],
    ["鸭食", titles.chinese, "鸭食"],
    // A syllable still being typed, as a Korean IME shows it.
    ["마", titles.korean, "맛"],
    ["นมสด", titles.thai, "นมสด"],
    ["ガイド", titles.halfWidth, "ｶﾞｲﾄﾞ"],
    ["がいど", titles.halfWidth, "ｶﾞｲﾄﾞ"],
    ["groc cafe", titles.latin, "Groc"],
  ] as const) {
    await search(page, query);
    await expect(results(page).filter({ hasText: title })).toHaveCount(1);
    await expect(
      results(page).filter({ hasText: title }).locator("strong").first(),
    ).toHaveText(bold);
  }
  // Chinese and Japanese share Han characters, so 京 is in 北京 as well.
  await search(page, "京");
  await expect(results(page)).toHaveCount(3);
  // The pairs of 東京都 both occur in 東京と京都, but not as one run.
  await search(page, "東京都");
  await expect(results(page)).toHaveCount(1);
  // A selection that drops out of the results falls back to the first one.
  await search(page, "東京");
  await expect(results(page)).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await expect(results(page).nth(1)).toHaveAttribute("data-selected", "true");
  await expect(results(page).nth(1)).toContainText(titles.japanese);
  await search(page, "東京と");
  await expect(results(page)).toHaveCount(1);
  await expect(results(page).first()).toContainText(titles.apart);
  await expect(results(page).first()).toHaveAttribute("data-selected", "true");
  await search(page, "東京 nothing");
  await expect(searchDialog(page).getByText("Nothing found")).toBeVisible();

  await search(page, "北京");
  await expect(results(page)).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(searchDialog(page)).toBeHidden();
  await expect(page).toHaveURL(/\/tasks\/[^/?]+$/);
  await expect(page.getByTestId("task-title")).toHaveText(titles.chinese);
});

test("opens with / from a focused link and in any keyboard layout", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("Search Keys Space");
  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await goToToday(page);
  await expect(
    page.getByRole("link", { name: /today/i }).first(),
  ).toBeFocused();

  await page.keyboard.press("/");
  await expect(searchDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(searchDialog(page)).toBeHidden();

  // The physical / key types "." in the Russian layout, and "," with Shift.
  const pressSlashKey = (key: string, shiftKey: boolean) =>
    page.evaluate(
      ({ key, shiftKey }) =>
        (document.activeElement ?? document.body).dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            code: "Slash",
            shiftKey,
            bubbles: true,
            cancelable: true,
          }),
        ),
      { key, shiftKey },
    );
  await pressSlashKey(".", false);
  await expect(searchDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(searchDialog(page)).toBeHidden();
  await pressSlashKey(",", true);
  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
});

test("opens a note on its page", async ({ page }) => {
  const spaceName = uniqueE2EName("Search Note Space");
  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createProject(page, uniqueE2EName("Search Note Project"));
  await createProjectTask(page, "Packing list");
  await openTaskActions(page, "Packing list");
  await page.getByRole("menuitem", { name: "Convert to note" }).click();
  await goToToday(page);

  await openSearchWithSlash(page);
  await search(page, "pack");
  await results(page).filter({ hasText: "Packing list" }).click();

  await expect(page).toHaveURL(/\/notes\/[^/?]+$/);
  await expect(page.getByTestId("task-title")).toHaveText("Packing list");
});

test("jumps to a topic on its mindmap", async ({ page }) => {
  const spaceName = uniqueE2EName("Search Mindmap Space");
  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await page.getByRole("link", { name: "maps", exact: true }).click();
  await page.getByRole("button", { name: "New mindmap" }).click();
  const nameDialog = page.getByRole("dialog", { name: "Mindmap name" });
  await nameDialog.getByRole("textbox").fill("Travel");
  await nameDialog.getByRole("button", { name: "Confirm" }).click();

  const node = (title: string) =>
    page
      .locator("[data-mindmap-node]")
      .filter({ has: page.getByText(title, { exact: true }) });
  await node("Travel").click();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Edit topic")).toBeFocused();
  await page.keyboard.type("京都の旅行計画");
  await page.keyboard.press("Enter");
  await expect(node("京都の旅行計画")).toBeFocused();
  // So the topic's focus below comes from the search, not from before.
  await node("Travel").click();
  await expect(node("Travel")).toBeFocused();
  await page.getByRole("link", { name: "projects", exact: true }).click();
  await expect(page).toHaveURL(/\/dates\//);

  await openSearchWithSlash(page);
  await search(page, "旅行");
  const result = results(page).filter({ hasText: "京都の旅行計画" });
  await expect(result).toContainText("Travel");
  await expect(result.locator("strong")).toHaveText("旅行");
  await result.click();

  await expect(page).toHaveURL(/\/mindmaps\//);
  await expect(node("京都の旅行計画")).toBeFocused();
});

test("finds a task created in another tab", async ({ context, page }) => {
  const spaceName = uniqueE2EName("Search Tabs Space");
  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  const secondPage = await context.newPage();
  await secondPage.goto(page.url());
  await expect(
    secondPage.getByRole("button", { name: "Add task" }),
  ).toBeVisible();

  // Offline, so the second tab can only learn of it from the first one.
  await context.setOffline(true);
  await createTodayTask(page, "Kyoto 旅行 plans");
  await expect(taskItem(secondPage, "Kyoto 旅行 plans")).toBeVisible();

  await openSearchWithSlash(secondPage);
  await search(secondPage, "旅行 kyo");
  await expect(results(secondPage)).toHaveCount(1);
  await expect(results(secondPage)).toContainText("Kyoto 旅行 plans");
});
