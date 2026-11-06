import { expect, test, type Locator, type Page } from "playwright/test";

import {
  createSpace,
  createTodayTask,
  openSpace,
  signupUser,
  uniqueE2EName,
} from "./helpers";

type Point = { x: number; y: number };

const node = (page: Page, title: string) =>
  page
    .locator("[data-mindmap-node]")
    .filter({ has: page.getByText(title, { exact: true }) });

// Tasks are made on the today page first, so they show in the project panel.
async function openNewMindmap(page: Page, name: string, tasks: string[] = []) {
  const spaceName = uniqueE2EName("E2E Mindmap Space");
  await signupUser(page);
  // The maps view shows in the navigation once enabled, read on load.
  await page.evaluate(() =>
    localStorage.setItem(
      "mindmaps-enabled",
      JSON.stringify({ state: { enabled: true }, version: 0 }),
    ),
  );
  await page.reload();
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  for (const task of tasks) await createTodayTask(page, task);
  // In-app navigation, as a reload could drop writes still being stored.
  if ((page.viewportSize()?.width ?? 1280) < 640) {
    await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
    await page.getByRole("link", { name: "Maps", exact: true }).click();
  } else {
    await page.getByRole("link", { name: "maps", exact: true }).click();
  }
  await page.getByRole("button", { name: "New mindmap" }).click();
  const dialog = page.getByRole("dialog", { name: "Mindmap name" });
  await dialog.getByRole("textbox").fill(name);
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog).toBeHidden();
  await expect(node(page, name)).toBeVisible();
}

// Clipboard events go to the focused node, as from the keyboard.
const clipboardEvent = (
  page: Page,
  type: "copy" | "cut" | "paste",
  data: Record<string, string> = {},
) =>
  page.evaluate(
    ({ type, data }) => {
      const clipboardData = new DataTransfer();
      for (const [format, value] of Object.entries(data)) {
        clipboardData.setData(format, value);
      }
      document.activeElement?.dispatchEvent(
        new ClipboardEvent(type, {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      );
      return clipboardData.getData("text/plain");
    },
    { type, data },
  );

async function pasteUnder(
  page: Page,
  title: string,
  data: Record<string, string>,
) {
  await node(page, title).click();
  await clipboardEvent(page, "paste", data);
}

// A node's subtree, as the indented outline a copy writes.
async function outlineOf(page: Page, title: string) {
  await node(page, title).click();
  return clipboardEvent(page, "copy");
}

// A task in the project panel below the map, not a task node on it.
const panelTask = (page: Page, title: string) =>
  page
    .locator('[data-focusable-key^="task^^"]:not([data-mindmap-node])')
    .filter({ hasText: title });

// Drags as the browser would, dropping on the middle of the target.
async function dragOnto(page: Page, source: Locator, target: Locator) {
  await expect(source).toHaveAttribute("draggable", "true");
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  const box = (await target.boundingBox())!;
  const at = {
    dataTransfer,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
  };
  await target.dispatchEvent("dragover", at);
  // The drop applies the previewed placement, picked once per frame.
  await expect(page.locator("[data-drop-ghost]")).toBeVisible();
  await target.dispatchEvent("drop", at);
  await expect(page.locator("[data-drop-ghost]")).toHaveCount(0);
}

// Types a title into the open editor and leaves it, focusing the node.
async function enterTitle(page: Page, title: string) {
  await expect(page.getByLabel("Edit topic")).toBeFocused();
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await expect(node(page, title)).toBeFocused();
}

const centerOf = async (page: Page, title: string) => {
  const box = (await node(page, title).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test("pastes outlines from plain text, HTML lists and OPML as topics", async ({
  page,
}) => {
  await openNewMindmap(page, "Plan");
  await pasteUnder(page, "Plan", { "text/plain": "Markdown\nDocs\nOPML" });

  await pasteUnder(page, "Markdown", {
    "text/plain": "* node 1\n* node 2\n  * node 3\n  * node 4\n    * node 5",
  });
  await expect(node(page, "node 5")).toBeVisible();
  expect(await outlineOf(page, "Markdown")).toBe(
    "Markdown\n  node 1\n  node 2\n    node 3\n    node 4\n      node 5",
  );

  // Google Docs puts each level in its own list and drops the nesting from
  // the plain text. Item text stays literal.
  await pasteUnder(page, "Docs", {
    "text/plain": "Goals\nShip *v2*\nWrite docs\nHire",
    "text/html":
      '<b id="docs-internal-guid-1"><p dir="ltr"><span>Goals</span></p>' +
      '<ul><li aria-level="1"><p role="presentation"><span>Ship *v2*</span></p></li></ul>' +
      '<ul><li aria-level="2"><p role="presentation"><span>Write docs</span></p></li></ul>' +
      '<ul><li aria-level="1"><p role="presentation"><span>Hire</span></p></li></ul></b>',
  });
  await expect(node(page, "Hire")).toBeVisible();
  expect(await outlineOf(page, "Docs")).toBe(
    "Docs\n  Goals\n    Ship *v2*\n      Write docs\n    Hire",
  );

  await pasteUnder(page, "OPML", {
    "text/plain":
      '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>Trip</title></head>' +
      '<body><outline text="Trip"><outline text="Flights"/>' +
      '<outline text="Hotel &amp; car"><outline text="Book"/></outline>' +
      "</outline></body></opml>",
  });
  await expect(node(page, "Book")).toBeVisible();
  expect(await outlineOf(page, "OPML")).toBe(
    "OPML\n  Trip\n    Flights\n    Hotel & car\n      Book",
  );
});

test("builds and reshapes a map from the keyboard", async ({ page }) => {
  await openNewMindmap(page, "Plan");
  await node(page, "Plan").click();
  await page.keyboard.press("Tab");
  await enterTitle(page, "A");
  await page.keyboard.press("Tab");
  await enterTitle(page, "A1");
  await page.keyboard.press("Enter");
  await enterTitle(page, "A2");
  await page.keyboard.press("Shift+O");
  await enterTitle(page, "A0");
  expect(await outlineOf(page, "A")).toBe("A\n  A1\n  A0\n  A2");

  await node(page, "A2").click();
  await page.keyboard.press("Control+ArrowUp");
  expect(await outlineOf(page, "A")).toBe("A\n  A1\n  A2\n  A0");

  // A new topic left empty is discarded.
  await node(page, "A0").click();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Edit topic")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Edit topic")).toHaveCount(0);
  expect(await outlineOf(page, "A")).toBe("A\n  A1\n  A2\n  A0");

  await node(page, "A").click();
  await page.keyboard.press("Period");
  await expect(node(page, "A1")).toHaveCount(0);
  await page.keyboard.press("Period");
  await expect(node(page, "A1")).toBeVisible();

  // Removing a node takes its subtree and focuses what remains above it.
  await page.keyboard.press("Backspace");
  await expect(page.locator("[data-mindmap-node]")).toHaveCount(1);
  await expect(node(page, "Plan")).toBeFocused();
});

test("drops tasks onto topics and moves topics by dragging", async ({
  page,
}) => {
  await openNewMindmap(page, "Plan", ["Ship it"]);
  await pasteUnder(page, "Plan", { "text/plain": "A\nB" });
  await expect(node(page, "B")).toBeVisible();

  // A dropped task gets a node linked to it; the task stays in its list.
  await dragOnto(page, panelTask(page, "Ship it"), node(page, "A"));
  await expect(node(page, "Ship it")).toBeVisible();
  expect(await outlineOf(page, "A")).toBe("A\n  Ship it");
  await expect(panelTask(page, "Ship it")).toHaveCount(1);

  await dragOnto(page, node(page, "B"), node(page, "A"));
  expect(await outlineOf(page, "A")).toBe("A\n  Ship it\n  B");
});

test("a node's toolbar and menu act on its selection", async ({ page }) => {
  await openNewMindmap(page, "Plan");
  await pasteUnder(page, "Plan", { "text/plain": "A\nB\nC" });
  await node(page, "A").click();
  await node(page, "B").click({ modifiers: ["ControlOrMeta"] });

  await node(page, "A").hover();
  await node(page, "A").getByTitle("Convert to task").click();
  for (const [title, count] of [
    ["A", 1],
    ["B", 1],
    ["C", 0],
  ] as const) {
    await expect(node(page, title).getByRole("checkbox")).toHaveCount(count);
  }

  await node(page, "B").hover();
  await node(page, "B").getByRole("button", { name: "Node actions" }).click();
  await page.getByRole("menuitem", { name: "Schedule today" }).click();
  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  for (const title of ["A", "B"]) {
    await expect(node(page, title).getByTitle("Change date (s)")).toHaveText(
      today,
    );
  }
});

test("copies, cuts and pastes between lists and the map", async ({ page }) => {
  await openNewMindmap(page, "Plan", ["Ship it"]);
  await pasteUnder(page, "Plan", { "text/plain": "X\n  Y\nB" });
  await expect(node(page, "B")).toBeVisible();

  // A task copied in a list is placed on the map, not duplicated.
  await panelTask(page, "Ship it").click();
  const taskText = await clipboardEvent(page, "copy");
  await pasteUnder(page, "B", { "text/plain": taskText });
  await expect(node(page, "Ship it")).toBeVisible();
  expect(await outlineOf(page, "B")).toBe("B\n  Ship it");
  await expect(panelTask(page, "Ship it")).toHaveCount(1);

  // Pasting a topic into itself adds one copy of it each time, not of the
  // copies pasted before.
  const subtree = await outlineOf(page, "X");
  await clipboardEvent(page, "paste", { "text/plain": subtree });
  await expect(node(page, "X")).toHaveCount(2);
  await node(page, "X").first().click();
  await clipboardEvent(page, "paste", { "text/plain": subtree });
  await expect(node(page, "X")).toHaveCount(3);
  await expect(node(page, "Y")).toHaveCount(3);

  // A cut moves the node.
  await node(page, "Ship it").click();
  const cutText = await clipboardEvent(page, "cut");
  await pasteUnder(page, "Plan", { "text/plain": cutText });
  await expect(node(page, "Ship it")).toHaveCount(1);
  expect(await outlineOf(page, "B")).toBe("B");
});

test("the details panel's mindmap link reveals the task's node", async ({
  page,
}) => {
  await openNewMindmap(page, "Plan", ["Ship it"]);
  await pasteUnder(page, "Plan", { "text/plain": "A" });
  await dragOnto(page, panelTask(page, "Ship it"), node(page, "A"));

  await node(page, "A").click();
  await page.keyboard.press("Period");
  await expect(node(page, "Ship it")).toHaveCount(0);

  await panelTask(page, "Ship it").click();
  await page.keyboard.press("v");
  await page
    .getByTestId("item-details-panel")
    .getByRole("link", { name: "Plan", exact: true })
    .click();
  await expect(node(page, "Ship it")).toBeFocused();
  // The link's item ID is dropped, so following it again works.
  await expect(page).not.toHaveURL(/itemId=/);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("pans, pinches, edits on a second tap and adds a topic on a double tap", async ({
    page,
  }) => {
    await openNewMindmap(page, "Touch");
    const cdp = await page.context().newCDPSession(page);
    const touch = (
      type: "touchStart" | "touchMove" | "touchEnd",
      points: Point[],
    ) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map(({ x, y }, id) => ({ x, y, id })),
      });
    const swipe = async (from: Point[], to: Point[]) => {
      await touch("touchStart", from);
      for (let step = 1; step <= 5; step++) {
        await touch(
          "touchMove",
          from.map((point, index) => ({
            x: point.x + ((to[index]!.x - point.x) * step) / 5,
            y: point.y + ((to[index]!.y - point.y) * step) / 5,
          })),
        );
      }
      await touch("touchEnd", []);
    };

    // One finger on empty space pans.
    const start = await centerOf(page, "Touch");
    const empty = { x: start.x, y: start.y + 120 };
    await swipe([empty], [{ x: empty.x + 60, y: empty.y + 40 }]);
    const panned = await centerOf(page, "Touch");
    expect(panned.x - start.x).toBeCloseTo(60, 0);
    expect(panned.y - start.y).toBeCloseTo(40, 0);

    // Two fingers spreading twice as far zoom in twice, around them.
    await swipe(
      [
        { x: panned.x - 30, y: panned.y },
        { x: panned.x + 30, y: panned.y },
      ],
      [
        { x: panned.x - 60, y: panned.y },
        { x: panned.x + 60, y: panned.y },
      ],
    );
    await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText(
      "200%",
    );
    const zoomed = await centerOf(page, "Touch");
    expect(zoomed.x).toBeCloseTo(panned.x, 0);
    expect(zoomed.y).toBeCloseTo(panned.y, 0);

    // A tap focuses a node; a second tap edits it.
    await page.touchscreen.tap(zoomed.x, zoomed.y);
    await expect(node(page, "Touch")).toBeFocused();
    await page.touchscreen.tap(zoomed.x, zoomed.y);
    await expect(page.getByLabel("Edit central topic")).toBeFocused();
    await page.keyboard.press("Escape");

    // A tap on empty space deselects; a double tap there adds one topic.
    // The taps are far apart, so they do not make a double tap.
    const space = { x: zoomed.x, y: zoomed.y + 160 };
    await page.touchscreen.tap(space.x + 100, space.y);
    await expect(node(page, "Touch")).not.toBeFocused();
    await page.touchscreen.tap(space.x, space.y);
    await page.touchscreen.tap(space.x, space.y);
    await expect(page.getByLabel("Edit topic")).toBeFocused();
    await page.keyboard.type("Floating");
    await page.keyboard.press("Escape");
    await expect(node(page, "Floating")).toHaveCount(1);
    await expect(page.locator("[data-mindmap-node]")).toHaveCount(2);
  });

  test("a phone toolbar adds, edits and opens full-screen details", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openNewMindmap(page, "Phone");
    await node(page, "Phone").tap();
    await page.getByRole("button", { name: "Add branch" }).tap();
    await expect(page.getByLabel("Edit topic")).toBeFocused();
    await page.keyboard.type("Idea");
    await page.keyboard.press("Escape");
    await expect(node(page, "Idea")).toBeFocused();

    await page.getByRole("button", { name: "More" }).tap();
    await page.getByRole("menuitem", { name: "Convert to task" }).tap();
    await expect(
      node(page, "Idea").getByRole("checkbox").first(),
    ).toBeVisible();
    // The list toolbar stays away from map nodes.
    await expect(
      page.getByRole("button", { name: "Task details" }),
    ).not.toBeInViewport();

    await page.getByRole("button", { name: "Details", exact: true }).tap();
    await expect(page).toHaveURL(/\/item-details\//);
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
    await expect(page.getByText("Idea", { exact: true }).first()).toBeVisible();
  });
});
