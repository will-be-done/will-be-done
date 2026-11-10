import { describe, expect, it } from "vitest";
import { pastedFiles } from "./filePaste";

const image = new File(["png"], "image.png", { type: "image/png" });

const clipboard = (types: Record<string, string>) => ({
  files: [image] as unknown as FileList,
  getData: (type: string) => types[type] ?? "",
});

describe("pastedFiles", () => {
  it.each([
    ["a copied file", { "text/plain": "image.png" }, 1],
    [
      "an image copied from a page",
      { "text/html": '<meta charset="utf-8"><img src="https://x.test/a.png">' },
      1,
    ],
    [
      "spreadsheet cells",
      {
        "text/plain": "Total\t42",
        "text/html":
          "<style>td{color:red}</style><!--StartFragment--><table><tr><td>Total</td><td>42</td></tr></table>",
      },
      0,
    ],
    [
      "an empty document fragment",
      {
        "text/html": "<html><body><p>&nbsp;</p><img src='a.png'></body></html>",
      },
      1,
    ],
  ])("%s", (_name, types, count) => {
    expect(pastedFiles(clipboard(types))).toHaveLength(count);
  });

  it("has nothing without a clipboard", () => {
    expect(pastedFiles(null)).toEqual([]);
  });
});
