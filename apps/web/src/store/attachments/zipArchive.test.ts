import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { makeZipWriter, readZip } from "./zipArchive";

const binary = Uint8Array.from({ length: 5000 }, (_, index) => index % 251);

describe("zip archive", () => {
  it("reads back the files it wrote", async () => {
    const writer = makeZipWriter();
    writer.add("backup.json", strToU8('{"tasks":[]}'.repeat(100)), {
      compress: true,
    });
    writer.add("attachments/a", binary);
    writer.add("attachments/empty", new Uint8Array());
    const zip = await readZip(writer.finish());

    expect(await (await zip.get("backup.json"))?.text()).toBe(
      '{"tasks":[]}'.repeat(100),
    );
    const stored = await zip.get("attachments/a", "image/png");
    expect(stored?.type).toBe("image/png");
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(binary);
    expect((await zip.get("attachments/empty"))?.size).toBe(0);
    expect(await zip.get("attachments/unknown")).toBeUndefined();
  });

  it("reads archives written by other tools", async () => {
    const archive = zipSync(
      { "backup.json": strToU8("{}"), "attachments/a": [binary, { level: 0 }] },
      { comment: "repacked" },
    );
    const zip = await readZip(new Blob([archive as BlobPart]));

    expect(await (await zip.get("backup.json"))?.text()).toBe("{}");
    expect(
      new Uint8Array(await (await zip.get("attachments/a"))!.arrayBuffer()),
    ).toEqual(binary);
  });

  it("rejects files that are not archives", async () => {
    await expect(readZip(new Blob(["not a zip"]))).rejects.toThrow(
      "Not a zip archive",
    );
  });
});

describe("damaged zip archives", () => {
  const archiveWith = (patch: (entry: DataView) => void) => {
    const writer = makeZipWriter();
    writer.add("attachments/a", binary);
    return writer
      .finish()
      .arrayBuffer()
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        const entry = bytes.findIndex(
          (byte, index) =>
            byte === 0x50 &&
            bytes[index + 1] === 0x4b &&
            bytes[index + 2] === 0x01 &&
            bytes[index + 3] === 0x02,
        );
        patch(new DataView(buffer, entry));
        return readZip(new Blob([buffer]));
      });
  };

  it.each([
    ["data past the end", (entry: DataView) => entry.setUint32(20, 1e6, true)],
    [
      "a header past the end",
      (entry: DataView) => entry.setUint32(42, 1e6, true),
    ],
    [
      "a header that is not one",
      (entry: DataView) => entry.setUint32(42, 1, true),
    ],
  ])("rejects an entry with %s", async (_name, patch) => {
    const zip = await archiveWith(patch);
    await expect(zip.get("attachments/a")).rejects.toThrow("damaged");
  });

  it("rejects unknown compression", async () => {
    const zip = await archiveWith((entry) => entry.setUint16(10, 12, true));
    await expect(zip.get("attachments/a")).rejects.toThrow("compression");
  });

  it("rejects a directory past the end", async () => {
    const writer = makeZipWriter();
    writer.add("attachments/a", binary);
    const bytes = new Uint8Array(await writer.finish().arrayBuffer());
    // Drops file data, so the directory offset points past the end.
    const truncated = new Blob([bytes.subarray(0, 100), bytes.subarray(-22)]);
    await expect(readZip(truncated)).rejects.toThrow("damaged");
  });
});
