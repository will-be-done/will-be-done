import { plainTextToRichTextMarkdown } from "@will-be-done/slices/common";
import {
  type MindmapOutlineLine,
  parseMindmapOutline,
} from "@will-be-done/slices/space";

const lineOf = (text: string, indent: number): MindmapOutlineLine[] => {
  const plain = text.replace(/\s+/g, " ").trim();
  return plain
    ? [{ title: plainTextToRichTextMarkdown(plain, "title"), indent }]
    : [];
};

// OPML, the format outliners and mindmap apps export.
const opmlLines = (text: string) => {
  if (!/^\s*(<\?xml[^>]*>\s*)?<opml[\s>]/i.test(text)) return null;
  const body = new DOMParser()
    .parseFromString(text, "text/xml")
    .querySelector("opml > body");
  if (!body) return null;
  const visit = (parent: Element, depth: number): MindmapOutlineLine[] =>
    [...parent.children]
      .filter((child) => child.tagName === "outline")
      .flatMap((child) => [
        ...lineOf(child.getAttribute("text") ?? "", depth),
        ...visit(child, depth + 1),
      ]);
  return visit(body, 0);
};

// Lists in HTML, with paragraphs and headings between them. A list nests
// under the paragraph above it. Google Docs keeps nesting only in
// `aria-level`, with each level in its own flat list.
const htmlLines = (html: string) => {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const blocks = [
    ...body.querySelectorAll("li, p, h1, h2, h3, h4, h5, h6"),
  ].filter((block) => block.tagName === "LI" || !block.closest("li"));
  if (!blocks.some((block) => block.tagName === "LI")) return null;
  return blocks.flatMap((block) => {
    const own = block.cloneNode(true) as Element;
    own.querySelectorAll("ul, ol").forEach((list) => list.remove());
    let depth = 0;
    if (block.tagName === "LI") {
      for (let at = block.parentElement; at; at = at.parentElement) {
        if (at.tagName === "UL" || at.tagName === "OL") depth++;
      }
      depth = Number(block.getAttribute("aria-level")) || depth;
    }
    return lineOf(own.textContent ?? "", depth);
  });
};

/**
 * Reads pasted data as outline lines: OPML, then HTML lists when the plain
 * text lost their nesting, then the plain text itself.
 */
export function clipboardOutline(data: DataTransfer): MindmapOutlineLine[] {
  const text = data.getData("text/plain");
  const opml = opmlLines(text);
  if (opml) return opml;
  const html = data.getData("text/html");
  if (html && !/^[ \t]+\S/m.test(text)) {
    const lines = htmlLines(html);
    if (lines) return lines;
  }
  return parseMindmapOutline(text);
}
