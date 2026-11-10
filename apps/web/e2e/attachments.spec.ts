import { deflateSync } from "node:zlib";
import { expect, test } from "playwright/test";
import {
  closeSpaceSettings,
  createSpace,
  createTodayTask,
  openSpace,
  openSpaceSettings,
  openTaskDetails,
  signInUser,
  signupUser,
  uniqueE2EName,
} from "./helpers";

// A solid 160x100 PNG, large enough to see in screenshots.
function solidPng(width: number, height: number) {
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

const png = solidPng(160, 100);

test("attaches, pastes, syncs, and lists files", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const spaceName = uniqueE2EName("Attachments");
  const taskTitle = uniqueE2EName("Task with files");
  const credentials = await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createTodayTask(page, taskTitle);
  const { description } = await openTaskDetails(page, taskTitle);

  const list = page.getByTestId("item-attachments");
  await page.getByTestId("attachment-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("meeting notes"),
  });
  await expect(list.getByText("notes.txt")).toBeVisible();

  await description.focus();
  await description.evaluate(
    (element, bytes) => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array(bytes)], "shot.png", { type: "image/png" }),
      );
      element.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true }),
      );
    },
    [...png],
  );
  await expect(list.getByText("shot.png")).toBeVisible();

  // Drag the corner handle to shrink the image to 100px.
  const image = description.locator('img[alt="shot.png"]');
  await image.hover();
  const handle = description.getByTestId("image-resize-handle");
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 60 + box.width / 2, box.y, { steps: 5 });
  await page.mouse.up();
  await expect(image).toHaveCSS("width", "100px");

  // Files pasted into the title show inline in the title and in the card.
  await page.getByTestId("task-title").click();
  const titleEditor = page.getByLabel("Edit task title");
  await titleEditor.evaluate(
    (element, bytes) => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array(bytes)], "title.png", { type: "image/png" }),
      );
      element.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true }),
      );
    },
    [...png],
  );
  const titleChip = { name: /title\.png/ };
  await expect(titleEditor.getByRole("button", titleChip)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    page.getByTestId("task-title").getByRole("button", titleChip),
  ).toBeVisible();
  await expect(
    page.locator("[data-rich-text-atom]", { hasText: "title.png" }),
  ).toHaveCount(2);
  await expect(list.getByText("title.png")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("title.png") });

  // Clicking the image previews it full screen, with a download button.
  await image.click();
  const preview = page.getByTestId("attachment-preview");
  await expect(preview.getByRole("img", { name: "shot.png" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("preview.png") });
  const downloadPromise = page.waitForEvent("download");
  await preview.getByRole("button", { name: "Download" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("shot.png");
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(description).toBeVisible();
  await expect(description.locator('img[alt="shot.png"]')).toBeVisible();

  const indicator = page.getByRole("button", { name: /^Sync status:/ });
  await expect(indicator).toHaveAttribute("data-sync-state", "synced", {
    timeout: 30_000,
  });
  await page.screenshot({ path: testInfo.outputPath("task-details.png") });

  const settings = await openSpaceSettings(page, "Files");
  const rows = settings.getByTestId("attachment-row");
  await expect(rows).toHaveCount(3);
  await expect(
    rows.first().getByRole("link", { name: taskTitle }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("settings-files.png") });
  await closeSpaceSettings(page);

  // Another device downloads the files from the server.
  const other = await browser.newPage({
    baseURL: testInfo.project.use.baseURL,
  });
  await signInUser(other, credentials);
  await openSpace(other, spaceName);
  const remote = await openTaskDetails(other, taskTitle);
  await expect(remote.description.locator('img[alt="shot.png"]')).toHaveCSS(
    "width",
    "100px",
    { timeout: 30_000 },
  );
  await expect(
    other.getByTestId("item-attachments").getByText("notes.txt"),
  ).toBeVisible();
  await other.screenshot({ path: testInfo.outputPath("other-device.png") });

  // A file dragged from the list lands inline in the description.
  await list
    .getByText("notes.txt")
    .dragTo(description, { targetPosition: { x: 200, y: 10 } });
  await expect(
    description.getByRole("button", { name: /notes\.txt/ }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("dropped.png") });

  // Removing the pasted file from the list removes it from the description.
  await list.getByRole("button", { name: "Remove shot.png" }).click({
    force: true,
  });
  await expect(description.locator('img[alt="shot.png"]')).toHaveCount(0);
  await expect(list.getByText("shot.png")).toHaveCount(0);
  await expect(list.getByText("notes.txt")).toBeVisible();
});
