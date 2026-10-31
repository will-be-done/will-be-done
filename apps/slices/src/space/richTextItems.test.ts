import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  RICH_TEXT_FRAGMENT,
  encodeRichTextDoc,
  loadRichTextDoc,
  mergeRichTextDocs,
  richTextDocToMarkdown,
  seedRichTextDoc,
} from "../common/richText";
import { syncChecklistItemRichText, syncItemRichText } from "./richTextItems";

type Item = {
  title: string;
  content?: string;
  titleDoc?: string;
  contentDoc?: string;
};

describe("syncItemRichText", () => {
  it("derives text from a written doc", () => {
    const titleDoc = seedRichTextDoc("Buy **milk**", "title");

    expect(
      syncItemRichText({ title: "Buy milk" }, { title: "Buy milk", titleDoc }),
    ).toEqual({ title: "Buy **milk**", titleDoc });
  });

  it("turns a text write into an edit that merges with an editor's seed", () => {
    const current: Item = { title: "Task", content: "First\n\nSecond" };
    const api = syncItemRichText(current, {
      ...current,
      content: "First changed\n\nSecond",
    });
    const editor = loadRichTextDoc(
      seedRichTextDoc(current.content!, "content"),
    );
    const second = editor
      .getXmlFragment(RICH_TEXT_FRAGMENT)
      .get(1) as Y.XmlElement;
    (second.get(0) as Y.XmlText).insert(6, " edited");

    expect(api.titleDoc).toBeUndefined();
    expect(
      richTextDocToMarkdown(
        mergeRichTextDocs(api.contentDoc!, encodeRichTextDoc(editor)),
        "content",
      ),
    ).toBe("First changed\n\nSecond edited");
  });

  it("merges a written doc with edits only the stored doc has", () => {
    const seed = seedRichTextDoc("Buy milk", "title");
    const edit = (insertAt: number, text: string) => {
      const doc = loadRichTextDoc(seed);
      const paragraph = doc
        .getXmlFragment(RICH_TEXT_FRAGMENT)
        .get(0) as Y.XmlElement;
      (paragraph.get(0) as Y.XmlText).insert(insertAt, text);
      return encodeRichTextDoc(doc);
    };

    const result = syncItemRichText(
      { title: "Please Buy milk", titleDoc: edit(0, "Please ") },
      { title: "Please Buy milk", titleDoc: edit(8, " today") },
    );

    expect(result.title).toBe("Please Buy milk today");
  });

  it("omits cleared content", () => {
    const current: Item = { title: "Task", content: "Notes" };

    const result = syncItemRichText(current, { title: "Task" });

    expect(result).not.toHaveProperty("content");
    expect(richTextDocToMarkdown(result.contentDoc!, "content")).toBe("");
  });
});

describe("syncChecklistItemRichText", () => {
  it("keeps checklist content inline, like a title", () => {
    const result = syncChecklistItemRichText<{
      content: string;
      contentDoc?: string;
    }>({ content: "Old" }, { content: "# Ship **it**" });

    expect(result.content).toBe("# Ship **it**");
    expect(richTextDocToMarkdown(result.contentDoc!, "content")).toBe(
      "\\# Ship **it**",
    );
  });
});
