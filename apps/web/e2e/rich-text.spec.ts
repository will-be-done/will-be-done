import { createHash, randomUUID } from "node:crypto";
import { CURRENT_SYNC_VERSION, formatHlc } from "@will-be-done/slices/common";
import { expect, test, type Locator, type Page } from "playwright/test";

import {
  createSpace,
  createTodayTask,
  openSpace,
  openTaskDetails,
  signupUser,
  taskItem,
  uniqueE2EName,
  waitForSyncedText,
} from "./helpers";

const pasteText = (editor: Locator, text: string) =>
  editor.evaluate((element, value) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", value);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);

test("formats titles and descriptions as markdown and keeps them after reload", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Rich Text Space");
  const taskTitle = uniqueE2EName("E2E rich task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  const item = await createTodayTask(page, taskTitle);

  await item.click();
  await expect(item).toBeFocused();
  await page.keyboard.press("Enter");
  const titleEditor = item.getByLabel("Edit task title");
  await expect(titleEditor).toBeFocused();
  await page.keyboard.type(" **urgent**");
  await expect(titleEditor.locator("strong")).toHaveText("urgent");
  await expect(titleEditor.locator(".rich-text-marker")).toHaveText([
    "**",
    "**",
  ]);
  await page.keyboard.type(" ");
  await expect(titleEditor.locator(".rich-text-marker")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(item.locator("strong")).toHaveText("urgent");

  const { description } = await openTaskDetails(page, taskTitle);
  await page.keyboard.type("## Plan");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- first *step*");
  await expect(description.locator("h2")).toHaveText("Plan");
  await expect(description.locator("li em")).toHaveText("step");
  await page.keyboard.press("Escape");

  const descriptionView = page.getByTestId("task-description");
  await expect(descriptionView.locator("h2")).toHaveText("Plan");

  await descriptionView.click();
  await expect(description).toBeFocused();
  await description.locator("h2").click({ clickCount: 3 });
  const bold = page.getByRole("button", { name: "Bold", exact: true });
  await bold.click();
  await expect(description.locator("h2 strong")).toHaveText("Plan");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ControlOrMeta+b");
  await expect(description.locator("h2 strong")).toHaveCount(0);
  await expect(page.locator('[data-sidebar="trigger"]')).toHaveAttribute(
    "data-open",
    "true",
  );
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+i");
  await expect(description.locator("h2 strong em")).toHaveText("Plan");
  await pasteText(description, "https://example.com/plan");
  await expect(description.locator("h2 a")).toHaveText("Plan");
  await page.keyboard.press("Escape");
  const planLink = descriptionView.getByRole("link", { name: "Plan" });
  await expect(planLink).toHaveAttribute("href", "https://example.com/plan");

  const checklistRows = page
    .getByTestId("item-details-panel")
    .locator("[data-checklist-item-id]");
  await page.getByRole("button", { name: "Add checklist item" }).click();
  const checklistEditor = page.getByRole("textbox", { name: "Checklist item" });
  await expect(checklistEditor).toBeFocused();
  await page.keyboard.type("Call **Bob** ");
  await expect(checklistEditor.locator("strong")).toHaveText("Bob");
  await page.keyboard.press("Enter");
  await expect(checklistRows).toHaveCount(2);
  await expect(checklistEditor).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(checklistRows).toHaveCount(1);
  await expect(checklistEditor).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(checklistRows.locator("strong")).toHaveText("Bob");

  await expect(
    page.getByRole("button", { name: "Sync status: All changes synced" }),
  ).toBeVisible();
  await page.reload();
  await expect(taskItem(page, taskTitle).locator("strong")).toHaveText([
    "urgent",
    "Bob",
  ]);
  await openTaskDetails(page, taskTitle);
  await page.keyboard.press("Escape");
  await expect(descriptionView.locator("h2")).toHaveText("Plan");
  await expect(descriptionView.locator("li em")).toHaveText("step");
  await expect(planLink.locator("strong, em").first()).toBeVisible();
  await expect(checklistRows.locator("strong")).toHaveText("Bob");
});

test("pastes markdown as formatting", async ({ page }) => {
  const spaceName = uniqueE2EName("E2E Markdown Paste Space");
  const taskTitle = uniqueE2EName("E2E paste task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createTodayTask(page, taskTitle);

  const { description } = await openTaskDetails(page, taskTitle);
  await pasteText(
    description,
    [
      "## Text formatting",
      "",
      "Type Markdown and it turns into formatting:",
      "**`bold`** and *italic*. See",
      "[shortcuts](https://example.com/keys).",
      "",
      "- one",
      "- two",
      "",
      "Read [the docs](/docs/keys) and [no script](javascript:alert(1)).",
    ].join("\n"),
  );
  await expect(description.locator("h2")).toHaveText("Text formatting");
  await expect(description.locator("p").first()).toHaveText(
    "Type Markdown and it turns into formatting:bold and italic. Seeshortcuts.",
  );
  await expect(description.locator("p").first().locator("br")).toHaveCount(2);
  await expect(description.locator("code")).toHaveText("bold");
  await expect(description.locator("em")).toHaveText("italic");
  await expect(
    description.getByRole("link", { name: "shortcuts" }),
  ).toHaveAttribute("href", "https://example.com/keys");
  await expect(description.locator("li")).toHaveText(["one", "two"]);
  await expect(
    description.getByRole("link", { name: "the docs" }),
  ).toHaveAttribute("href", "/docs/keys");
  await expect(description.getByText("no script")).not.toHaveAttribute(
    "href",
    /javascript/,
  );

  await page
    .context()
    .route("https://example.com/keys", (route) =>
      route.fulfill({ contentType: "text/html", body: "Keys" }),
    );
  const popupPromise = page.waitForEvent("popup");
  await description.getByRole("link", { name: "shortcuts" }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL("https://example.com/keys");
  await popup.close();
  await page.keyboard.press("Escape");
  await expect(description).not.toBeFocused();

  await page.getByTestId("task-title").click();
  const titleEditor = page.getByLabel("Edit task title");
  await expect(titleEditor).toBeFocused();
  await pasteText(titleEditor, " see [docs](https://example.com/docs)");
  await expect(titleEditor.getByRole("link", { name: "docs" })).toHaveAttribute(
    "href",
    "https://example.com/docs",
  );
  await page.keyboard.press("Enter");
  await expect(
    taskItem(page, taskTitle).getByRole("link", { name: "docs" }),
  ).toHaveAttribute("href", "https://example.com/docs");
});

test("opens single-line editors with the caret where the text was clicked", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Rich Caret Space");
  const taskTitle = uniqueE2EName("E2E caret task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  const item = await createTodayTask(page, taskTitle);

  await item.click();
  await page.keyboard.press("Enter");
  const titleEditor = item.getByLabel("Edit task title");
  await expect(titleEditor).toBeFocused();
  await page.keyboard.type(" **now** later");
  await page.keyboard.press("Enter");
  await item.locator("strong").dblclick({ position: { x: 1, y: 5 } });
  await expect(titleEditor).toBeFocused();
  await page.keyboard.type("X");
  await page.keyboard.press("Enter");
  await expect(item.locator("[data-rich-text-view]")).toHaveText(
    `${taskTitle} Xnow later`,
  );

  await openTaskDetails(page, taskTitle);
  await page.getByRole("button", { name: "Add checklist item" }).click();
  const checklistEditor = page.getByRole("textbox", { name: "Checklist item" });
  await expect(checklistEditor).toBeFocused();
  await page.keyboard.type("Call **Bob** now");
  await page.keyboard.press("Escape");
  const checklistRow = page
    .getByTestId("item-details-panel")
    .locator("[data-checklist-item-id]");
  await checklistRow.locator("strong").click({ position: { x: 1, y: 5 } });
  await expect(checklistEditor).toBeFocused();
  await page.keyboard.type("Y");
  await page.keyboard.press("Escape");
  await expect(checklistRow.locator("[data-rich-text-view]")).toHaveText(
    "Call YBob now",
  );
});

test("shows a title changed back in another tab", async ({ context, page }) => {
  const spaceName = uniqueE2EName("E2E Rich Revert Space");
  const taskTitle = uniqueE2EName("E2E revert task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  const item = await createTodayTask(page, taskTitle);
  await item.click();
  await page.keyboard.press("Enter");
  await expect(item.getByLabel("Edit task title")).toBeFocused();
  await page.keyboard.type(" edited");
  await page.keyboard.press("Enter");
  await expect(item).toContainText(`${taskTitle} edited`);

  const otherPage = await context.newPage();
  await otherPage.goto(page.url());
  const key = await item.getAttribute("data-focusable-key");
  const otherItem = otherPage.locator(`[data-focusable-key="${key}"]`);
  await otherItem.click();
  await otherPage.keyboard.press("Enter");
  await expect(otherItem.getByLabel("Edit task title")).toBeFocused();
  for (let i = 0; i < " edited".length; i++) {
    await otherPage.keyboard.press("Backspace");
  }
  await otherPage.keyboard.press("Enter");
  await expect(otherItem.locator("[data-rich-text-view]")).toHaveText(
    taskTitle,
  );

  await expect(item.locator("[data-rich-text-view]")).toHaveText(taskTitle);
});

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

type SyncChange = { id: string; entityId: string } & Record<string, unknown>;
type SyncRow = { id: string } & Record<string, unknown>;
type SyncChangeset = {
  tableName: string;
  data: Array<{ change: SyncChange; row?: SyncRow }>;
};

// Syncs as an app that predates rich text docs: it writes the Markdown text
// and keeps the doc it was sent, or none.
async function syncAsOldApp(
  page: Page,
  spaceId: string,
  changesets: SyncChangeset[],
  cursor: { clock: string; changeId: string } | null = null,
) {
  const token = await page.evaluate(() => localStorage.getItem("auth_token"));
  const headers = { Authorization: `Bearer ${token}` };
  const sessionsUrl = `/api/sync/v4/space/${spaceId}/sessions`;
  const sessionResponse = await page.request.post(sessionsUrl, {
    headers,
    data: {
      syncVersion: CURRENT_SYNC_VERSION,
      dbId: spaceId,
      dbType: "space",
      clientId: `e2e-old-app-${randomUUID()}`,
      expectedAcceptedClientCursor: null,
      coveredClientCursor: cursor,
      expectedAcknowledgedServerRevision: 0,
      appliedServerRevision: 0,
    },
  });
  await expect(sessionResponse).toBeOK();
  const { uploadId } = (await sessionResponse.json()) as { uploadId: string };

  const checksums: string[] = [];
  if (changesets.length > 0) {
    const payload = JSON.stringify(changesets);
    const checksum = sha256(payload);
    checksums.push(checksum);
    await expect(
      await page.request.put(`${sessionsUrl}/${uploadId}/chunks/0`, {
        headers,
        data: { checksum, payload },
      }),
    ).toBeOK();
  }

  const commitResponse = await page.request.post(
    `${sessionsUrl}/${uploadId}/commit`,
    {
      headers,
      data: {
        chunkCount: checksums.length,
        changeCount: changesets.reduce((n, { data }) => n + data.length, 0),
        throughCursor: cursor,
        checksum: sha256(checksums.join("\n")),
      },
    },
  );
  await expect(commitResponse).toBeOK();
  const { download } = (await commitResponse.json()) as {
    download: { type: "inline"; changesets: SyncChangeset[] };
  };
  expect(download.type).toBe("inline");
  return download.changesets;
}

test("shows a description an older app changed while it is open", async ({
  page,
}) => {
  const spaceName = uniqueE2EName("E2E Old App Space");
  const taskTitle = uniqueE2EName("E2E old app task");

  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  const indicator = page.getByRole("button", { name: /^Sync status:/ });
  await createTodayTask(page, taskTitle);
  await expect(indicator).toHaveAttribute("data-sync-state", "synced");
  const { description } = await openTaskDetails(page, taskTitle);
  const spaceId = new URL(page.url()).pathname.split("/")[2];

  const tasks = (await syncAsOldApp(page, spaceId, [])).find(
    ({ tableName }) => tableName === "tasks",
  );
  const task = tasks?.data.find(({ row }) => row?.title === taskTitle);
  expect(task?.row).toBeTruthy();
  expect(task?.row).not.toHaveProperty("contentDoc");

  const clientId = `e2e-old-app-${randomUUID()}`;
  const clock = formatHlc({
    physical: Date.now(),
    logical: 0,
    actorId: clientId,
  });
  const change = {
    ...task!.change,
    updatedAt: clock,
    clientId,
    changes: { ...(task!.change.changes as object), content: clock },
  };
  await syncAsOldApp(
    page,
    spaceId,
    [
      {
        tableName: "tasks",
        data: [{ change, row: { ...task!.row!, content: "From the old app" } }],
      },
    ],
    { clock, changeId: change.id },
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(description).toHaveText("From the old app");

  const synced = waitForSyncedText(page, "and this one");
  await description.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and this one");
  await description.blur();
  await synced;

  const stored = (await syncAsOldApp(page, spaceId, []))
    .find(({ tableName }) => tableName === "tasks")
    ?.data.find(({ row }) => row?.id === task!.row!.id);
  expect(stored?.row?.content).toBe("From the old app and this one");
});
