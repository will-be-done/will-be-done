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
