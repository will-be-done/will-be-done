import { readFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { expect, test as base } from "playwright/test";
import {
  type AttachmentStorageOptions,
  createSpace,
  createTodayTask,
  e2eAttachmentStorage,
  openSpace,
  openTaskDetails,
  signupUser,
  uniqueE2EName,
} from "./helpers";

const test = base.extend<AttachmentStorageOptions>({
  attachmentStorage: ["local", { option: true }],
});

const CONTENT_PATH = /\/spaces\/([^/]+)\/attachments\/([^/]+)\/content$/;

async function storedBytes(
  storage: AttachmentStorageOptions["attachmentStorage"],
  spaceId: string,
  id: string,
) {
  if (storage === "local") {
    return readFile(path.join(e2eAttachmentStorage.localRoot, spaceId, id));
  }
  const { endpoint, bucket, prefix, credentials } = e2eAttachmentStorage.s3;
  const client = new S3Client({
    endpoint,
    credentials,
    region: "us-east-1",
    forcePathStyle: true,
  });
  try {
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: `${prefix}${spaceId}/${id}` }),
    );
    return Buffer.from(await object.Body!.transformToByteArray());
  } finally {
    client.destroy();
  }
}

test("stores an uploaded file in the server's storage", async ({
  page,
  request,
  attachmentStorage,
}) => {
  const spaceName = uniqueE2EName("Stored files");
  const taskTitle = uniqueE2EName("Task with a file");
  const content = Buffer.from(`report ${uniqueE2EName("bytes")}`);
  await signupUser(page);
  await createSpace(page, spaceName);
  await openSpace(page, spaceName);
  await createTodayTask(page, taskTitle);
  await openTaskDetails(page, taskTitle);

  // A first attempt may be refused until the file's row has synced.
  const uploaded = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      CONTENT_PATH.test(new URL(response.url()).pathname) &&
      response.ok(),
  );
  await page.getByTestId("attachment-input").setInputFiles({
    name: "report.txt",
    mimeType: "text/plain",
    buffer: content,
  });
  const upload = await uploaded;
  const [, spaceId, id] = new URL(upload.url()).pathname.match(CONTENT_PATH)!;

  expect(await storedBytes(attachmentStorage, spaceId!, id!)).toEqual(content);

  // Reading the file back needs the owner's session.
  expect((await request.get(upload.url())).status()).toBe(401);
  const authorization = await upload.request().headerValue("authorization");
  const download = await request.get(upload.url(), {
    headers: { authorization: authorization! },
  });
  expect(download.status()).toBe(200);
  expect(await download.body()).toEqual(content);
});
