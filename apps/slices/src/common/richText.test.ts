import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  RICH_TEXT_FRAGMENT,
  encodeRichTextDoc,
  loadRichTextDoc,
  markdownToRichTextNodes,
  mergeRichTextDocs,
  normalizeRichTextMarkdown,
  replaceRichTextDocMarkdown,
  richTextDocToMarkdown,
  richTextMarkdownToPlainText,
  seedRichTextDoc,
} from "./richText";

const editText = (
  encoded: string,
  edit: (text: Y.XmlText, doc: Y.Doc) => void,
  blockIndex = 0,
) => {
  const doc = loadRichTextDoc(encoded);
  const block = doc
    .getXmlFragment(RICH_TEXT_FRAGMENT)
    .get(blockIndex) as Y.XmlElement;
  doc.transact(() => edit(block.get(0) as Y.XmlText, doc));
  return encodeRichTextDoc(doc);
};

describe("rich text markdown", () => {
  it.each([
    "Plain text",
    "**bold** *italic* ~~strike~~ `code`",
    "# Heading\n\nParagraph with [a link](https://example.com)",
    "- one\n- two\n  - nested\n\n1. first\n2. second",
    "> quoted\n\n***\n\n```ts\nconst a = 1;\n```",
    "Literal \\*asterisks\\* and https://example.com",
    "Line one\\\nLine two",
  ])("round-trips content %j", (markdown) => {
    const normalized = normalizeRichTextMarkdown(markdown, "content");
    expect(normalizeRichTextMarkdown(normalized, "content")).toBe(normalized);
    expect(
      richTextDocToMarkdown(seedRichTextDoc(markdown, "content"), "content"),
    ).toBe(normalized);
  });

  it.each([
    ["Para\n\n\nPara", 1],
    ["```\nx\n```\n\n\n\n```\ny\n```", 2],
    ["\nLeading", 1],
    ["Trailing\n\n\n", 2],
    ["\n\n", 3],
  ])("keeps extra blank lines in %j as empty paragraphs", (markdown, empty) => {
    const nodes = markdownToRichTextNodes(markdown, "content");

    expect(nodes.filter((node) => !node.content?.length)).toHaveLength(empty);
    expect(normalizeRichTextMarkdown(markdown, "content")).toBe(markdown);
  });

  it.each([
    ["# 123 bug", "# 123 bug"],
    ["1. Call mom", "1. Call mom"],
    ["- buy milk", "- buy milk"],
    ["> quote", "> quote"],
    ["Buy **oat** milk", "Buy **oat** milk"],
    ["Fix `node_modules` path", "Fix `node_modules` path"],
    ["Two\nlines", "Two lines"],
  ])("keeps title %j as one inline line", (markdown, expected) => {
    expect(normalizeRichTextMarkdown(markdown, "title")).toBe(expected);
    expect(
      richTextDocToMarkdown(seedRichTextDoc(markdown, "title"), "title"),
    ).toBe(expected);
  });

  it("moves whitespace out of emphasis so it stays parseable", () => {
    const doc = new Y.Doc();
    const paragraph = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    text.applyDelta([
      { insert: "Buy" },
      { insert: " milk ", attributes: { bold: {} } },
      { insert: "now" },
    ]);
    paragraph.insert(0, [text]);
    doc.getXmlFragment(RICH_TEXT_FRAGMENT).insert(0, [paragraph]);

    expect(richTextDocToMarkdown(encodeRichTextDoc(doc), "title")).toBe(
      "Buy **milk** now",
    );
  });

  it("ends literal links before a backtick", () => {
    expect(
      markdownToRichTextNodes("Read \\`www.example.com/docs\\`.", "content"),
    ).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Read `" },
          {
            type: "text",
            text: "www.example.com/docs",
            marks: [
              { type: "link", attrs: { href: "https://www.example.com/docs" } },
            ],
          },
          { type: "text", text: "`" },
          { type: "text", text: "." },
        ],
      },
    ]);
  });

  it("links bare www. addresses securely and keeps them bare", () => {
    const markdown = "Visit www.example.com today";
    const [paragraph] = markdownToRichTextNodes(markdown, "content");

    expect(paragraph?.content?.[1]?.marks).toEqual([
      { type: "link", attrs: { href: "https://www.example.com" } },
    ]);
    expect(normalizeRichTextMarkdown(markdown, "content")).toBe(markdown);
  });

  it("keeps reference-style link definitions as text", () => {
    const markdown = "See [docs][1]\n\n[1]: https://example.com/docs";

    expect(markdownToRichTextNodes(markdown, "content")[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "See [docs][1]" }],
    });
    expect(richTextMarkdownToPlainText(markdown, "content")).toBe(
      "See [docs][1]\n[1]: https://example.com/docs",
    );
    expect(
      markdownToRichTextNodes("[docs](https://example.com)", "content")[0]
        ?.content?.[0]?.marks,
    ).toEqual([{ type: "link", attrs: { href: "https://example.com" } }]);
  });

  it("renders plain text without markdown syntax", () => {
    expect(richTextMarkdownToPlainText("Buy **oat** `milk`", "title")).toBe(
      "Buy oat milk",
    );
  });
});

describe("rich text docs", () => {
  it("seeds the same markdown into identical documents", () => {
    const a = seedRichTextDoc("Buy **milk**", "title");
    const b = seedRichTextDoc("Buy **milk**", "title");

    expect(a).toBe(b);
    expect(richTextDocToMarkdown(mergeRichTextDocs(a, b), "title")).toBe(
      "Buy **milk**",
    );
  });

  it("merges concurrent edits from both sides", () => {
    const seed = seedRichTextDoc("Buy milk", "title");
    const left = editText(seed, (text) => text.insert(0, "Please "));
    const right = editText(seed, (text) => text.insert(8, " today"));

    const merged = mergeRichTextDocs(left, right);

    expect(richTextDocToMarkdown(merged, "title")).toBe(
      "Please Buy milk today",
    );
    expect(richTextDocToMarkdown(mergeRichTextDocs(right, left), "title")).toBe(
      "Please Buy milk today",
    );
  });

  it("keeps the exact bytes of a state that already contains the other", () => {
    const seed = seedRichTextDoc("Buy milk", "title");
    const left = editText(seed, (text) => text.insert(0, "Please "));
    const right = editText(seed, (text) => text.delete(0, 4));
    const merged = mergeRichTextDocs(left, right);

    expect(mergeRichTextDocs(merged, left)).toBe(merged);
    expect(mergeRichTextDocs(left, merged)).toBe(merged);
    expect(mergeRichTextDocs(seed, left)).toBe(left);
    expect(mergeRichTextDocs(merged, merged)).toBe(merged);
  });

  it("picks one encoding for semantically equal states", () => {
    const seed = seedRichTextDoc("Buy milk", "title");
    const left = editText(seed, (text) => text.insert(0, "Please "));
    const right = editText(seed, (text) => text.insert(8, "!"));
    const ab = mergeRichTextDocs(left, right);
    const ba = encodeRichTextDoc(loadRichTextDoc(left, loadRichTextDoc(right)));

    expect(mergeRichTextDocs(ab, ba)).toBe(mergeRichTextDocs(ba, ab));
  });

  it.each([
    ["Buy milk", "Buy oat milk", "Please Buy oat milk"],
    ["Buy milk", "Buy **milk**", "Please Buy **milk**"],
    ["Buy **milk**", "Buy milk now", "Please Buy milk now"],
    [
      "Buy milk",
      "Buy [milk](https://example.com)",
      "Please Buy [milk](https://example.com)",
    ],
    ["Buy 🥛 milk", "Buy 🥛🍪 milk", "Please Buy 🥛🍪 milk"],
    ["Buy milk", "milk", "Please milk"],
    [
      "Read [docs](https://a.com)",
      "Read [docs](https://b.com)",
      "Please Read [docs](https://b.com)",
    ],
    ["Use `npm` now", "Use `pnpm` now", "Please Use `pnpm` now"],
  ])(
    "merges a text write %j → %j with concurrent typing in the same line",
    (before, after, merged) => {
      const seed = seedRichTextDoc(before, "title");
      const api = replaceRichTextDocMarkdown(seed, after, "title");
      const editor = editText(seed, (text) => text.insert(0, "Please "));

      expect(richTextDocToMarkdown(api, "title")).toBe(after);
      expect(
        richTextDocToMarkdown(mergeRichTextDocs(api, editor), "title"),
      ).toBe(merged);
    },
  );

  it("edits a changed paragraph in place, keeping concurrent typing in it", () => {
    const seed = seedRichTextDoc("First line\n\n# Second", "content");
    const api = replaceRichTextDocMarkdown(
      seed,
      "First *edited* line\n\n# Second",
      "content",
    );
    const editor = editText(seed, (text) => text.insert(10, "!"));

    expect(
      richTextDocToMarkdown(mergeRichTextDocs(api, editor), "content"),
    ).toBe("First *edited* line!\n\n# Second");
  });

  it("replaces markdown without dropping concurrent edits elsewhere", () => {
    const seed = seedRichTextDoc("First\n\nSecond", "content");
    const api = replaceRichTextDocMarkdown(
      seed,
      "First **changed**\n\nSecond",
      "content",
    );
    const editor = editText(seed, (text) => text.insert(6, " edited"), 1);

    expect(
      richTextDocToMarkdown(mergeRichTextDocs(api, editor), "content"),
    ).toBe("First **changed**\n\nSecond edited");
    expect(
      replaceRichTextDocMarkdown(api, "First **changed**\n\nSecond", "content"),
    ).toBe(api);
  });

  it("keeps concurrent edits around a restructured paragraph", () => {
    const seed = seedRichTextDoc("First\n\nMiddle\n\nLast", "content");
    const api = replaceRichTextDocMarkdown(
      seed,
      "First\n\n- Middle\n\nLast",
      "content",
    );
    const before = editText(seed, (text) => text.insert(5, " edited"), 0);
    const after = editText(seed, (text) => text.insert(4, " edited"), 2);

    expect(
      richTextDocToMarkdown(
        mergeRichTextDocs(mergeRichTextDocs(api, before), after),
        "content",
      ),
    ).toBe("First edited\n\n- Middle\n\nLast edited");
  });
});
