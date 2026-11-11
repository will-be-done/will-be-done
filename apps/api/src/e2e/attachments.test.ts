import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import {
  createAttachment,
  createSectionTask,
  createItemAttachment,
  deleteAttachment,
  deleteItemAttachment,
  downloadAttachmentContent,
  getAttachment,
  getTask,
  listAttachments,
  listItemAttachments,
  updateTask,
  uploadAttachmentContent,
} from "../generated/v1-client";
import {
  createAuthorization,
  createTaskFixture,
  expectResponseStatus,
} from "./harness";
import { coverOperation } from "./operationCoverage";

const bytes = (text: string) => new Blob([new TextEncoder().encode(text)]);

test("covers every attachment operation", async () => {
  const { space, projectSection, task, options } = await createTaskFixture(
    await createAuthorization(),
  );
  const otherTask = expectResponseStatus(
    await createSectionTask(
      space.id,
      projectSection.id,
      { title: "Other task" },
      options,
    ),
    201,
  ).data.task;

  const created = await coverOperation(
    "createAttachment",
    createAttachment(
      space.id,
      bytes("hello"),
      {
        name: "hello.txt",
        mimeType: "text/plain",
        parentType: "task",
        parentId: task.id,
      },
      options,
    ),
    201,
  );
  const attachment = created.data.attachment;
  expect(attachment).toMatchObject({
    name: "hello.txt",
    mimeType: "text/plain",
    size: 5,
    sha256: createHash("sha256").update("hello").digest("hex"),
  });

  const downloaded = await coverOperation(
    "downloadAttachmentContent",
    downloadAttachmentContent(space.id, attachment.id, options),
    200,
  );
  expect(await downloaded.data.text()).toBe("hello");
  expect(downloaded.headers.get("content-security-policy")).toContain(
    "sandbox",
  );

  await coverOperation(
    "uploadAttachmentContent",
    uploadAttachmentContent(space.id, attachment.id, bytes("hello"), options),
    204,
  );
  expectResponseStatus(
    await uploadAttachmentContent(
      space.id,
      attachment.id,
      bytes("other"),
      options,
    ),
    400,
  );
  // The rejected bytes never replace the stored ones.
  expect(
    await expectResponseStatus(
      await downloadAttachmentContent(space.id, attachment.id, options),
      200,
    ).data.text(),
  ).toBe("hello");

  const linked = await coverOperation(
    "createItemAttachment",
    createItemAttachment(
      space.id,
      {
        attachmentId: attachment.id,
        parentType: "task",
        parentId: otherTask.id,
      },
      options,
    ),
    201,
  );
  expect(linked.data.itemAttachment.attachment.id).toBe(attachment.id);

  const listed = await coverOperation(
    "listItemAttachments",
    listItemAttachments(
      space.id,
      { parentType: "task", parentId: task.id },
      options,
    ),
    200,
  );
  expect(listed.data.itemAttachments.map((link) => link.attachmentId)).toEqual([
    attachment.id,
  ]);

  const fetched = await coverOperation(
    "getAttachment",
    getAttachment(space.id, attachment.id, options),
    200,
  );
  expect(
    fetched.data.attachment.usages.map((usage) => usage.parentId).sort(),
  ).toEqual([task.id, otherTask.id].sort());

  const page = await coverOperation(
    "listAttachments",
    listAttachments(space.id, { limit: 1 }, options),
    200,
  );
  expect(page.data.attachments.map(({ id }) => id)).toEqual([attachment.id]);
  expect(page.data.nextCursor).toBeNull();

  // Removing it from the last item deletes the file with the inline reference.
  expectResponseStatus(
    await updateTask(
      space.id,
      task.id,
      { content: `See ![hello](wbd-attachment:${attachment.id}) here` },
      options,
    ),
    200,
  );
  await coverOperation(
    "deleteItemAttachment",
    deleteItemAttachment(space.id, linked.data.itemAttachment.id, options),
    204,
  );
  expectResponseStatus(
    await getAttachment(space.id, attachment.id, options),
    200,
  );

  await coverOperation(
    "deleteAttachment",
    deleteAttachment(space.id, attachment.id, options),
    204,
  );
  expectResponseStatus(
    await getAttachment(space.id, attachment.id, options),
    404,
  );
  const updatedTask = expectResponseStatus(
    await getTask(space.id, task.id, options),
    200,
  ).data.task;
  expect(updatedTask.content).toBe("See  here");
});

test("inline references list the file under the item", async () => {
  const { space, task, options } = await createTaskFixture(
    await createAuthorization(),
  );
  const attachment = expectResponseStatus(
    await createAttachment(space.id, bytes("png"), { name: "a.png" }, options),
    201,
  ).data.attachment;

  expectResponseStatus(
    await updateTask(
      space.id,
      task.id,
      { content: `![a.png](wbd-attachment:${attachment.id})` },
      options,
    ),
    200,
  );

  const listed = expectResponseStatus(
    await listItemAttachments(
      space.id,
      { parentType: "task", parentId: task.id },
      options,
    ),
    200,
  );
  expect(listed.data.itemAttachments.map((link) => link.attachmentId)).toEqual([
    attachment.id,
  ]);
});

test("rejects unauthenticated uploads before reading their body", async () => {
  // An unsupported body type would fail parsing with 415 if parsing came first.
  const response = await fetch(
    `${process.env.WBD_API_BASE_URL}/api/v1/spaces/space/attachments/file/content`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/x-unsupported" },
      body: "bytes",
    },
  );
  expect(response.status).toBe(401);
});

test("rejects uploads over 50 MB with a documented error", async () => {
  const { space, options } = await createTaskFixture(
    await createAuthorization(),
  );

  const response = await createAttachment(
    space.id,
    new Blob([new Uint8Array(50 * 1024 * 1024 + 1)]),
    { name: "big.bin", mimeType: "application/octet-stream" },
    options,
  );

  expect(response.status).toBe(413);
  expect(response.data).toMatchObject({ code: "BAD_REQUEST" });
});

test("streams uploads larger than the default body limit", async () => {
  const { space, options } = await createTaskFixture(
    await createAuthorization(),
  );
  const content = new Uint8Array(3 * 1024 * 1024).map(
    (_, index) => index % 251,
  );

  const created = expectResponseStatus(
    await createAttachment(
      space.id,
      new Blob([content]),
      { name: "big.bin", mimeType: "application/octet-stream" },
      options,
    ),
    201,
  ).data.attachment;

  expect(created).toMatchObject({
    size: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
  expectResponseStatus(
    await uploadAttachmentContent(
      space.id,
      created.id,
      new Blob([content]),
      options,
    ),
    204,
  );
  const downloaded = expectResponseStatus(
    await downloadAttachmentContent(space.id, created.id, options),
    200,
  );
  expect(new Uint8Array(await downloaded.data.arrayBuffer())).toEqual(content);
});
