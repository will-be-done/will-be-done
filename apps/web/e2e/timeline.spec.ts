import {
  addDays,
  differenceInCalendarMonths,
  format,
  parse,
  startOfWeek,
} from "date-fns";
import { expect, test, type Locator, type Page } from "playwright/test";

import { DAY_WIDTH } from "../src/components/DaysBoard/useInfiniteDays.ts";
import {
  createProject,
  createProjectTask,
  createSpace,
  openSpace,
  projectSidebarLink,
  projectTaskItem,
  signupUser,
  stashPanel,
  dailyTaskItem,
  uniqueE2EName,
  waitForSyncedText,
} from "./helpers";

const monday = startOfWeek(new Date(), { weekStartsOn: 1 });

test("opens on this week's Monday and fills the screen with days", async ({
  page,
}) => {
  await openTimeline(page);

  await expectFirstDay(page, monday);
  await expect(dayColumn(page, addDays(monday, 2))).toBeInViewport({
    ratio: 1,
  });
  await expect(dayColumn(page, addDays(monday, 3))).toBeInViewport();
  await expect(dayColumn(page, addDays(monday, 4))).not.toBeInViewport();

  await page.setViewportSize({ width: 2200, height: 720 });
  await expect(dayColumn(page, addDays(monday, 4))).toBeInViewport({
    ratio: 1,
  });
  await expectFirstDay(page, monday);

  // Any date opens with that day first.
  const wednesday = addDays(monday, 2);
  await openTimelineAt(page, wednesday);
  await expectFirstDay(page, wednesday);
});

test("scrolls without end both ways and renders only the days near the screen", async ({
  page,
}) => {
  await openTimeline(page);

  await scrollByDays(page, 60);
  await expectFirstDay(page, addDays(monday, 60));
  await expect.poll(() => renderedDayCount(page)).toBeLessThan(30);

  await scrollByDays(page, -120);
  await expectFirstDay(page, addDays(monday, -60));
  await expect.poll(() => renderedDayCount(page)).toBeLessThan(30);
});

test("steps day by day, including quick clicks and a partly scrolled day", async ({
  page,
}) => {
  await openTimeline(page);
  const next = page.getByRole("button", { name: "Next day" });
  const previous = page.getByRole("button", { name: "Previous day" });

  for (let i = 0; i < 3; i++) await next.click();
  await expectFirstDay(page, addDays(monday, 3));

  // Past the days rendered on the left.
  for (let i = 0; i < 15; i++) await previous.click();
  await expectFirstDay(page, addDays(monday, -12));

  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expectFirstDay(page, monday);

  // A cut first day is revealed before stepping back past it.
  await scrollByPixels(page, DAY_WIDTH * 1.5);
  await expect(navDate(page)).toHaveText(label(addDays(monday, 1)));
  await previous.click();
  await expectFirstDay(page, addDays(monday, 1));

  await scrollByPixels(page, DAY_WIDTH / 2);
  await next.click();
  await expectFirstDay(page, addDays(monday, 2));
});

test("jumps to picked dates near and far, and back to this week", async ({
  page,
}) => {
  await openTimeline(page);

  const nearby = addDays(monday, 9);
  await pickDate(page, monday, nearby);
  await expectFirstDay(page, nearby);

  const farAway = new Date(monday.getFullYear(), monday.getMonth() + 3, 15);
  await pickDate(page, nearby, farAway);
  await expectFirstDay(page, farAway);

  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expectFirstDay(page, monday);
});

test("adds tasks to far days, which load again after scrolling away", async ({
  page,
}) => {
  await openTimeline(page);
  const title = uniqueE2EName("E2E far timeline task");
  const farAway = new Date(monday.getFullYear(), monday.getMonth() + 2, 10);

  await pickDate(page, monday, farAway);
  await expectFirstDay(page, farAway);
  const synced = waitForSyncedText(page, title);
  await addTaskByEmptyDay(page, farAway, title);
  await expect(dayColumn(page, farAway)).toContainText(title);

  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expectFirstDay(page, monday);
  await expect(dailyTaskItem(page, title)).toHaveCount(0);

  await synced;
  await page.reload();
  await expectFirstDay(page, monday);
  await pickDate(page, monday, farAway);
  await expect(dayColumn(page, farAway)).toContainText(title);
});

test("outlines project tasks only while their day is on the screen", async ({
  page,
}) => {
  const projectTitle = uniqueE2EName("E2E Outline Project");
  const todayTask = uniqueE2EName("E2E task on Monday");
  const laterTask = uniqueE2EName("E2E task in ten days");
  await openTimeline(page, { projectTitle });
  const later = addDays(monday, 10);

  await addTaskByEmptyDay(page, monday, todayTask);
  await expect(projectTaskItem(page, todayTask)).toHaveClass(/outline-dashed/);

  await scrollByDays(page, 10);
  await expectFirstDay(page, later);
  await addTaskByEmptyDay(page, later, laterTask);
  await expect(projectTaskItem(page, laterTask)).toHaveClass(/outline-dashed/);
  await expect(projectTaskItem(page, todayTask)).not.toHaveClass(
    /outline-dashed/,
  );

  // Picking another project keeps the timeline where it is.
  await projectSidebarLink(page, projectTitle).click();
  await expect(page).toHaveURL(/projectId=/);
  await expectFirstDay(page, later);
  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();

  // Ten days on is still rendered past the screen edge, but not outlined.
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expectFirstDay(page, monday);
  await expect(projectTaskItem(page, todayTask)).toHaveClass(/outline-dashed/);
  await expect(projectTaskItem(page, laterTask)).not.toHaveClass(
    /outline-dashed/,
  );
});

test("scrolls while a dragged task is held at either edge", async ({
  page,
}) => {
  await openTimeline(page);
  const title = uniqueE2EName("E2E dragged timeline task");
  const source = await createProjectTask(page, title);
  const box = (await timeline(page).boundingBox())!;
  const atX = (x: number) => ({ clientX: x, clientY: box.y + box.height / 2 });

  await expect(source).toHaveAttribute("draggable", "true");
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });

  await timeline(page).dispatchEvent("dragover", {
    dataTransfer,
    ...atX(box.x + box.width - 5),
  });
  await expect.poll(() => firstDayOffset(page)).toBeGreaterThan(6);

  await timeline(page).dispatchEvent("dragover", {
    dataTransfer,
    ...atX(box.x + 5),
  });
  await expect.poll(() => firstDayOffset(page)).toBeLessThan(4);

  // Hovering a day stops the scroll; dropping schedules the task there.
  const target = addDays(monday, (await firstDayOffset(page)) + 1);
  const column = dayColumn(page, target);
  const columnBox = (await column.boundingBox())!;
  await column.dispatchEvent("dragover", {
    dataTransfer,
    ...atX(columnBox.x + columnBox.width / 2),
  });
  await column.dispatchEvent("drop", { dataTransfer });
  await dataTransfer.dispose();

  await expect(column).toContainText(title);
  await expect(projectTaskItem(page, title)).toHaveClass(/outline-dashed/);
});

test("scrolls with its own scrollbar, which has no ends", async ({ page }) => {
  await openTimeline(page);
  const thumb = page.getByRole("scrollbar", { name: "Scroll days" });
  const rest = (await thumb.boundingBox())!;

  // Like the app's other scrollbars, it shows on hover.
  await expect(thumb.locator("..")).toHaveCSS("opacity", "0");
  await timeline(page).hover();
  await expect(thumb.locator("..")).toHaveCSS("opacity", "1");
  const center = { x: rest.x + rest.width / 2, y: rest.y + rest.height / 2 };

  // The native scrollbar is hidden.
  expect(
    await timeline(page).evaluate(
      (el: HTMLElement) => el.offsetHeight - el.clientHeight,
    ),
  ).toBe(0);

  // The thumb stands for a screen within a track of four screens.
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x - DAY_WIDTH / 4, center.y, { steps: 4 });
  await expectFirstDay(page, addDays(monday, -1));

  // Held past the track's end, it keeps scrolling.
  await page.mouse.move(center.x + rest.width * 4, center.y, { steps: 4 });
  await expect.poll(() => firstDayOffset(page)).toBeGreaterThan(14);
  await page.mouse.up();
  await expect.poll(async () => (await thumb.boundingBox())!.x).toBe(rest.x);

  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expectFirstDay(page, monday);

  // Clicking the track pages by the days fully on screen.
  const fullDays = Math.floor((await timelineWidth(page)) / DAY_WIDTH);
  await page.mouse.click(rest.x + rest.width * 1.4, center.y);
  await expectFirstDay(page, addDays(monday, fullDays));
  await page.mouse.click(rest.x - rest.width * 0.4, center.y);
  await expectFirstDay(page, monday);

  // The wheel over the bar still reaches the days under it.
  await page.mouse.wheel(DAY_WIDTH, 0);
  await expectFirstDay(page, addDays(monday, 1));
});

test("keeps the first day on screen in the URL", async ({ page }) => {
  await openTimeline(page);
  const scrolled = addDays(monday, 5);
  await scrollByDays(page, 5);
  await expectFirstDay(page, scrolled);
  await expect(page).toHaveURL(new RegExp(`[?&]day=${ymd(scrolled)}`));

  // Reloading, or opening a shared link, shows the same days.
  await page.reload();
  await expectFirstDay(page, scrolled);

  // A picked date is a step that Back undoes.
  const farAway = new Date(monday.getFullYear(), monday.getMonth() + 2, 10);
  await pickDate(page, scrolled, farAway);
  await expectFirstDay(page, farAway);
  await expect(page).toHaveURL(new RegExp(`[?&]day=${ymd(farAway)}`));
  await page.goBack();
  await expectFirstDay(page, scrolled);
  await page.goForward();
  await expectFirstDay(page, farAway);

  await page.getByRole("link", { name: "timeline", exact: true }).click();
  await expectFirstDay(page, monday);
});

test("keeps the first day in place when days around it change width", async ({
  page,
}) => {
  await openTimeline(page);
  const header = (date: Date) =>
    dayColumn(page, date).getByRole("button", {
      name: new RegExp(`^${format(date, "dd MMM")}`),
    });

  await header(monday).click();
  await expect
    .poll(async () => (await dayColumn(page, monday).boundingBox())!.width)
    .toBeLessThan(DAY_WIDTH / 2);

  const folded = (await dayColumn(page, monday).boundingBox())!.width;
  await expect.poll(() => dayLeft(page, addDays(monday, 1))).toBe(folded);

  // Coming back from far right renders the folded day narrower than guessed.
  await scrollByDays(page, 30);
  await expect(navDate(page)).toHaveText(label(addDays(monday, 30)));
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expectFirstDay(page, monday);
  await expect.poll(() => dayLeft(page, addDays(monday, 1))).toBe(folded);

  // Scrolling back over the folded day from its right.
  await scrollByPixels(page, folded + DAY_WIDTH);
  await expectFirstDay(page, addDays(monday, 2));
  await scrollByPixels(page, -DAY_WIDTH - folded);
  await expectFirstDay(page, monday);

  await header(monday).click();
  await expect.poll(() => dayLeft(page, addDays(monday, 1))).toBe(DAY_WIDTH);
  await expectFirstDay(page, monday);
});

test("moves focus and tasks by keyboard across days past the screen edge", async ({
  page,
}) => {
  await openTimeline(page);
  const placeholder = (date: Date) =>
    dayColumn(page, date).locator("[data-focus-placeholder]");

  // Past the days rendered at first, there and back. Each key waits for its
  // day to load, which a held key's repeats leave time for.
  const press = async (key: string, date: Date) => {
    await expect(placeholder(date)).toBeAttached();
    await page.keyboard.press(key);
    await expect(placeholder(date)).toBeFocused();
  };
  await placeholder(monday).focus();
  for (let i = 1; i <= 20; i++) await press("KeyL", addDays(monday, i));
  await expect(dayColumn(page, addDays(monday, 20))).toBeInViewport({
    ratio: 1,
  });

  for (let i = 19; i >= -5; i--) await press("KeyH", addDays(monday, i));
  // A day comes in whole, header and all, at the edge it enters from.
  await expectFirstDay(page, addDays(monday, -5));

  // With the stash closed, a task on the first day moves to the day before.
  const title = uniqueE2EName("E2E task moved by keyboard");
  await page.keyboard.press("KeyI");
  await page.getByLabel("Edit task title").fill(title);
  await page.keyboard.press("Enter");
  await expect(dayColumn(page, addDays(monday, -5))).toContainText(title);
  await dailyTaskItem(page, title).click();
  await page.keyboard.press("Control+KeyH");
  await expect(dayColumn(page, addDays(monday, -6))).toContainText(title);
  await expectFirstDay(page, addDays(monday, -6));
  await page.keyboard.press("Control+KeyL");
  await expect(dayColumn(page, addDays(monday, -5))).toContainText(title);
});

test("keeps a task focused while the open stash covers its day", async ({
  page,
}) => {
  await openTimeline(page);
  const title = uniqueE2EName("E2E task behind the stash");
  await addTaskByEmptyDay(page, monday, title);
  const task = dailyTaskItem(page, title);
  await task.click();
  await page.keyboard.press("Backslash");
  await expect(stashPanel(page)).toHaveAttribute("aria-hidden", "false");

  await scrollByDays(page, 1);
  await expectFirstDay(page, addDays(monday, 1));
  await expect(task).toBeFocused();

  const tuesday = dayColumn(page, addDays(monday, 1)).locator(
    "[data-focus-placeholder]",
  );
  await page.keyboard.press("KeyL");
  await expect(tuesday).toBeFocused();
  // The covered day is passed over on the way back.
  await page.keyboard.press("KeyH");
  await expect(
    stashPanel(page).locator("[data-focus-placeholder]"),
  ).toBeFocused();
});

test("follows the scroll again after the days were squeezed to no width", async ({
  page,
}) => {
  await openTimeline(page);
  // The widest stash leaves a narrow window no room for days.
  await page.evaluate(() =>
    localStorage.setItem(
      "stash-size",
      JSON.stringify({ state: { width: 720 }, version: 0 }),
    ),
  );
  await page.reload();
  await expect(dayColumn(page, monday)).toBeVisible();
  await page.keyboard.press("Backslash");
  await page.setViewportSize({ width: 700, height: 720 });
  await expect.poll(() => timelineWidth(page)).toBe(0);

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(() => timelineWidth(page)).toBeGreaterThan(0);
  await scrollByDays(page, 30);
  await expectFirstDay(page, addDays(monday, 30));
});

test.describe("across calendar edges", () => {
  // Clocks change on 1 November 2026 here.
  test.use({ timezoneId: "America/New_York" });

  test("shows each day once through a clock change and a new year", async ({
    page,
  }) => {
    await setUpSpace(page);

    const friday = new Date(2026, 9, 30);
    await openTimelineAt(page, friday);
    await expectFirstDay(page, friday);
    for (let i = 1; i < 6; i++) {
      await expect(dayColumn(page, addDays(friday, i))).toHaveCount(1);
      await expect
        .poll(() => dayLeft(page, addDays(friday, i)))
        .toBe(i * DAY_WIDTH);
    }

    const lastWeek = new Date(2026, 11, 30);
    await openTimelineAt(page, lastWeek);
    await expectFirstDay(page, lastWeek);
    await page.getByRole("button", { name: "Next day" }).click();
    await page.getByRole("button", { name: "Next day" }).click();
    await expectFirstDay(page, new Date(2027, 0, 1));
  });
});

async function setUpSpace(page: Page) {
  const spaceName = uniqueE2EName("E2E Timeline Space");
  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
}

async function openTimeline(
  page: Page,
  { projectTitle }: { projectTitle?: string } = {},
) {
  await setUpSpace(page);
  if (projectTitle) await createProject(page, projectTitle);
  await page.getByRole("link", { name: "timeline", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/timeline/${ymd(monday)}`));
  await expect(dayColumn(page, monday)).toBeVisible();
}

async function openTimelineAt(page: Page, date: Date) {
  await page.goto(
    page.url().replace(/\/(dates|timeline)\/[^?]+/, `/timeline/${ymd(date)}`),
  );
  await expect(dayColumn(page, date)).toBeVisible();
}

function timeline(page: Page) {
  return page.locator("#timeline-days");
}

function navDate(page: Page) {
  return page.getByText(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
}

// Loaded columns only: a day still loading renders a placeholder.
function dayColumn(page: Page, date: Date): Locator {
  return timeline(page)
    .locator('[data-column-model-type="dailyList"]')
    .filter({
      has: page.getByRole("button", {
        name: new RegExp(`^${format(date, "dd MMM")}`),
      }),
    });
}

async function renderedDayCount(page: Page) {
  return timeline(page).locator("[data-day]").count();
}

async function timelineWidth(page: Page) {
  return timeline(page).evaluate((el) => el.clientWidth);
}

async function dayLeft(page: Page, date: Date) {
  const [column, scroller] = await Promise.all([
    dayColumn(page, date).boundingBox(),
    timeline(page).boundingBox(),
  ]);
  return column && scroller ? Math.round(column.x - scroller.x) : null;
}

async function expectFirstDay(page: Page, date: Date) {
  await expect(navDate(page)).toHaveText(label(date));
  await expect.poll(() => dayLeft(page, date)).toBe(0);
}

// Days from this week's Monday to the first day on screen.
async function firstDayOffset(page: Page) {
  const shown = parse(await navDate(page).innerText(), "dd MMM yyyy", monday);
  return Math.round((shown.getTime() - monday.getTime()) / 86_400_000);
}

async function scrollByPixels(page: Page, pixels: number) {
  const box = (await timeline(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const step = Math.sign(pixels) * DAY_WIDTH * 2;
  for (let left = pixels; left !== 0; ) {
    const delta = Math.abs(left) > Math.abs(step) ? step : left;
    const shown = await navDate(page).innerText();
    await page.mouse.wheel(delta, 0);
    left -= delta;
    // A wheel past the scrollable end is lost, so wait for days to follow.
    if (delta === step) await expect(navDate(page)).not.toHaveText(shown);
  }
}

async function scrollByDays(page: Page, days: number) {
  await scrollByPixels(page, days * DAY_WIDTH);
}

async function pickDate(page: Page, shown: Date, date: Date) {
  await navDate(page).click();
  const calendar = page.locator('[data-slot="calendar"]');
  await expect(calendar).toBeVisible();
  const months = differenceInCalendarMonths(date, shown);
  for (let i = 0; i < months; i++) {
    await calendar.getByRole("button", { name: /next month/i }).click();
  }
  await calendar
    .getByRole("button", { name: new RegExp(format(date, "PPPP")) })
    .click();
  await expect(calendar).toBeHidden();
}

async function addTaskByEmptyDay(page: Page, date: Date, title: string) {
  await dayColumn(page, date)
    .getByRole("button", { name: /Nothing planned/ })
    .click();
  await page.getByLabel("Edit task title").fill(title);
  await page.keyboard.press("Enter");
  await expect(dayColumn(page, date)).toContainText(title);
}

function label(date: Date) {
  return format(date, "dd MMM yyyy");
}

function ymd(date: Date) {
  return format(date, "yyyy-MM-dd");
}
