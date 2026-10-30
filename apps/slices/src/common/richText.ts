import * as Y from "yjs";
import { fromBase64, toBase64 } from "lib0/buffer";
import { fromMarkdown } from "mdast-util-from-markdown";
import { defaultHandlers, toMarkdown } from "mdast-util-to-markdown";
import {
  gfmStrikethroughFromMarkdown,
  gfmStrikethroughToMarkdown,
} from "mdast-util-gfm-strikethrough";
import {
  gfmAutolinkLiteralFromMarkdown,
  gfmAutolinkLiteralToMarkdown,
} from "mdast-util-gfm-autolink-literal";
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough";
import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal";
import type {
  BlockContent,
  ListItem,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";

// Rich text is stored twice: a Yjs document (the source of truth once it
// exists) and its markdown rendering, which lists, the API, and old clients
// read. The Yjs layout matches what Tiptap's Collaboration extension writes.

export type RichTextKind = "title" | "content";

export type RichTextMarkType = "bold" | "italic" | "strike" | "code" | "link";

export type RichTextMark = {
  type: RichTextMarkType;
  attrs?: { href: string };
};

export type RichTextNode = {
  type: string;
  attrs?: Record<string, string | number>;
  content?: RichTextNode[];
  text?: string;
  marks?: RichTextMark[];
};

export const RICH_TEXT_FRAGMENT = "default";

const MARK_ORDER: RichTextMarkType[] = ["link", "strike", "bold", "italic"];
const EMPHASIS_MARKS = new Set<RichTextMarkType>(["strike", "bold", "italic"]);
const LINK_ATTRS = {
  target: "_blank",
  rel: "noopener noreferrer nofollow",
  class: null,
  title: null,
};

// Titles are a single inline line: block syntax stays literal text.
const TITLE_DISABLED_CONSTRUCTS = [
  "blockQuote",
  "codeFenced",
  "codeIndented",
  "definition",
  "headingAtx",
  "htmlFlow",
  "list",
  "setextUnderline",
  "thematicBreak",
];

// Bump when seed output changes for the same markdown; old and new seeds then
// get different Yjs client IDs instead of colliding.
const SEED_VERSION = 1;

const parseMarkdown = (markdown: string, kind: RichTextKind): Root =>
  fromMarkdown(markdown, {
    extensions: [
      gfmStrikethrough({ singleTilde: false }),
      gfmAutolinkLiteral(),
      ...(kind === "title"
        ? [{ disable: { null: TITLE_DISABLED_CONSTRUCTS } }]
        : []),
    ],
    mdastExtensions: [
      gfmStrikethroughFromMarkdown(),
      gfmAutolinkLiteralFromMarkdown(),
    ],
  });

// ─── markdown → rich text nodes ──────────────────────────────────────────────

const textNode = (text: string, marks: RichTextMark[]): RichTextNode =>
  marks.length > 0 ? { type: "text", text, marks } : { type: "text", text };

const phrasingToNodes = (
  nodes: PhrasingContent[],
  marks: RichTextMark[],
  kind: RichTextKind,
): RichTextNode[] =>
  nodes.flatMap((node): RichTextNode[] => {
    switch (node.type) {
      case "text":
      case "html": {
        const text =
          kind === "title" ? node.value.replace(/\n/g, " ") : node.value;
        return text ? [textNode(text, marks)] : [];
      }
      case "inlineCode":
        return node.value ? [textNode(node.value, [{ type: "code" }])] : [];
      case "break":
        return kind === "title"
          ? [textNode(" ", marks)]
          : [{ type: "hardBreak" }];
      case "strong":
        return phrasingToNodes(
          node.children,
          [...marks, { type: "bold" }],
          kind,
        );
      case "emphasis":
        return phrasingToNodes(
          node.children,
          [...marks, { type: "italic" }],
          kind,
        );
      case "delete":
        return phrasingToNodes(
          node.children,
          [...marks, { type: "strike" }],
          kind,
        );
      case "link": {
        const [child] = node.children;
        // Literal URLs stop before a backtick, as linkified text did before
        // markdown.
        const tail =
          node.children.length === 1 &&
          child?.type === "text" &&
          node.url.endsWith(child.value)
            ? /`.*$/s.exec(child.value)?.[0]
            : undefined;
        if (child?.type === "text" && tail) {
          const text = child.value.slice(0, -tail.length);
          const url = node.url.slice(0, -tail.length);
          return [
            ...(text
              ? phrasingToNodes(
                  [{ ...node, url, children: [{ type: "text", value: text }] }],
                  marks,
                  kind,
                )
              : []),
            textNode(tail, marks),
          ];
        }
        // Bare www. links get a secure scheme.
        const href =
          child?.type === "text" &&
          child.value.startsWith("www.") &&
          node.url === `http://${child.value}`
            ? `https://${child.value}`
            : node.url;
        return phrasingToNodes(
          node.children,
          [
            ...marks.filter((mark) => mark.type !== "link"),
            { type: "link", attrs: { href } },
          ],
          kind,
        );
      }
      case "image": {
        const text = node.alt || node.url;
        return text
          ? [
              textNode(text, [
                ...marks,
                { type: "link", attrs: { href: node.url } },
              ]),
            ]
          : [];
      }
      default:
        return "value" in node && typeof node.value === "string" && node.value
          ? [textNode(node.value, marks)]
          : [];
    }
  });

const paragraph = (content: RichTextNode[]): RichTextNode =>
  content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };

const emptyParagraphs = (count: number) =>
  Array.from({ length: Math.max(0, count) }, () => paragraph([]));

const isEmptyParagraph = (node: RichTextNode) =>
  node.type === "paragraph" && !node.content?.length;

const listItemToNode = (item: ListItem): RichTextNode => {
  const content = blocksToNodes(item.children);
  // Tiptap list items must start with a paragraph.
  if (content[0]?.type !== "paragraph") content.unshift(paragraph([]));
  return { type: "listItem", content };
};

const blocksToNodes = (nodes: (RootContent | BlockContent)[]): RichTextNode[] =>
  nodes.flatMap((node): RichTextNode[] => {
    switch (node.type) {
      case "paragraph":
        return [paragraph(phrasingToNodes(node.children, [], "content"))];
      case "heading": {
        const content = phrasingToNodes(node.children, [], "content");
        return [
          content.length > 0
            ? { type: "heading", attrs: { level: node.depth }, content }
            : { type: "heading", attrs: { level: node.depth } },
        ];
      }
      case "list": {
        const items = node.children.map(listItemToNode);
        return [
          node.ordered
            ? {
                type: "orderedList",
                attrs: { start: node.start ?? 1 },
                content: items,
              }
            : { type: "bulletList", content: items },
        ];
      }
      case "code":
        return [
          {
            type: "codeBlock",
            ...(node.lang ? { attrs: { language: node.lang } } : {}),
            ...(node.value
              ? { content: [{ type: "text", text: node.value }] }
              : {}),
          },
        ];
      case "blockquote": {
        const content = blocksToNodes(node.children);
        return [
          {
            type: "blockquote",
            content: content.length > 0 ? content : [paragraph([])],
          },
        ];
      }
      case "thematicBreak":
        return [{ type: "horizontalRule" }];
      case "html":
        return [paragraph(node.value ? [textNode(node.value, [])] : [])];
      default:
        return [];
    }
  });

export const markdownToRichTextNodes = (
  markdown: string,
  kind: RichTextKind,
): RichTextNode[] => {
  const root = parseMarkdown(markdown, kind);
  if (kind === "title") {
    const inline = root.children
      .filter((node) => node.type === "paragraph")
      .flatMap((node, index) => [
        ...(index > 0 ? [textNode(" ", [])] : []),
        ...phrasingToNodes(node.children, [], "title"),
      ]);
    return [paragraph(inline)];
  }
  // Markdown has no empty paragraphs, so they round-trip as blank lines
  // beyond the one that separates two blocks.
  const lineCount = markdown.split("\n").length;
  if (root.children.length === 0) return emptyParagraphs(lineCount);
  const blocks: RichTextNode[] = [];
  let previousEnd = 0;
  for (const child of root.children) {
    const start = child.position?.start.line ?? previousEnd + 1;
    blocks.push(
      ...emptyParagraphs(start - previousEnd - (previousEnd === 0 ? 1 : 2)),
      ...blocksToNodes([child]),
    );
    previousEnd = child.position?.end.line ?? start;
  }
  blocks.push(...emptyParagraphs(lineCount - previousEnd - 1));
  return blocks.length > 0 ? blocks : [paragraph([])];
};

// ─── rich text nodes → markdown ──────────────────────────────────────────────

const sameMark = (a: RichTextMark, b: RichTextMark) =>
  a.type === b.type && a.attrs?.href === b.attrs?.href;

const markOf = (node: RichTextNode, type: RichTextMarkType) =>
  node.marks?.find((mark) => mark.type === type);

// Emphasis cannot open or close on whitespace in markdown, so edge
// whitespace moves outside of it.
const splitEdgeWhitespace = (nodes: RichTextNode[]): RichTextNode[] =>
  nodes.flatMap((node) => {
    const text = node.text;
    if (
      node.type !== "text" ||
      !text ||
      !node.marks?.some((mark) => EMPHASIS_MARKS.has(mark.type))
    ) {
      return [node];
    }
    const start = text.length - text.trimStart().length;
    const end = Math.max(start, text.trimEnd().length);
    const plainMarks = node.marks.filter(
      (mark) => !EMPHASIS_MARKS.has(mark.type),
    );
    return [
      text.slice(0, start) && textNode(text.slice(0, start), plainMarks),
      text.slice(start, end) && { ...node, text: text.slice(start, end) },
      text.slice(end) && textNode(text.slice(end), plainMarks),
    ].filter((part): part is RichTextNode => Boolean(part));
  });

const leafToPhrasing = (node: RichTextNode): PhrasingContent[] => {
  if (node.type === "hardBreak") return [{ type: "break" }];
  if (node.type !== "text" || !node.text) return [];
  if (markOf(node, "code")) return [{ type: "inlineCode", value: node.text }];
  return [{ type: "text", value: node.text }];
};

const wrapPhrasing = (
  mark: RichTextMark,
  children: PhrasingContent[],
): PhrasingContent => {
  switch (mark.type) {
    case "link":
      return { type: "link", url: mark.attrs?.href ?? "", children };
    case "strike":
      return { type: "delete", children };
    case "bold":
      return { type: "strong", children };
    default:
      return { type: "emphasis", children };
  }
};

// Groups runs sharing a mark so adjacent nodes do not emit `**a****b**`.
const nodesToPhrasing = (
  nodes: RichTextNode[],
  order: RichTextMarkType[] = MARK_ORDER,
): PhrasingContent[] => {
  const [type, ...rest] = order;
  if (!type) return nodes.flatMap(leafToPhrasing);
  const result: PhrasingContent[] = [];
  let run: RichTextNode[] = [];
  let runMark: RichTextMark | undefined;
  let plain: RichTextNode[] = [];
  const flushPlain = () => {
    if (plain.length > 0) result.push(...nodesToPhrasing(plain, rest));
    plain = [];
  };
  const flushRun = () => {
    if (runMark && run.length > 0) {
      result.push(wrapPhrasing(runMark, nodesToPhrasing(run, rest)));
    }
    run = [];
    runMark = undefined;
  };
  for (const node of nodes) {
    const mark =
      node.type === "text" && !markOf(node, "code")
        ? markOf(node, type)
        : undefined;
    if (!mark) {
      flushRun();
      plain.push(node);
      continue;
    }
    flushPlain();
    if (runMark && !sameMark(runMark, mark)) flushRun();
    runMark = mark;
    run.push(node);
  }
  flushRun();
  flushPlain();
  return result;
};

const inlinePhrasing = (nodes: RichTextNode[] | undefined) =>
  nodesToPhrasing(splitEdgeWhitespace(nodes ?? []));

const nodesToBlocks = (nodes: RichTextNode[] | undefined): BlockContent[] =>
  (nodes ?? []).flatMap((node): BlockContent[] => {
    switch (node.type) {
      case "heading": {
        const level = Number(node.attrs?.level ?? 1);
        return [
          {
            type: "heading",
            depth: (level >= 1 && level <= 6 ? level : 1) as 1,
            children: inlinePhrasing(node.content),
          },
        ];
      }
      case "bulletList":
      case "orderedList":
        return [
          {
            type: "list",
            ordered: node.type === "orderedList",
            ...(node.type === "orderedList"
              ? { start: Number(node.attrs?.start ?? 1) }
              : {}),
            spread: false,
            children: (node.content ?? []).map(
              (item): ListItem => ({
                type: "listItem",
                spread: false,
                children: nodesToBlocks(item.content),
              }),
            ),
          },
        ];
      case "codeBlock":
        return [
          {
            type: "code",
            lang: node.attrs?.language ? String(node.attrs.language) : null,
            value: (node.content ?? [])
              .map((child) => child.text ?? "")
              .join(""),
          },
        ];
      case "blockquote":
        return [{ type: "blockquote", children: nodesToBlocks(node.content) }];
      case "horizontalRule":
        return [{ type: "thematicBreak" }];
      default: {
        const children = inlinePhrasing(node.content);
        // Markdown has no empty paragraphs.
        return children.length > 0 ? [{ type: "paragraph", children }] : [];
      }
    }
  });

const serialize = (root: Root) =>
  toMarkdown(root, {
    // An empty paragraph adds one line on top of the usual blank line.
    join: [
      (left, _right, parent) =>
        parent.type === "root" &&
        left.type === "paragraph" &&
        left.children.length === 0
          ? 0
          : undefined,
    ],
    bullet: "-",
    emphasis: "*",
    strong: "*",
    fences: true,
    rule: "-",
    listItemIndent: "one",
    extensions: [gfmStrikethroughToMarkdown(), gfmAutolinkLiteralToMarkdown()],
    handlers: {
      // Keep bare URLs bare instead of the `<url>` autolink form.
      link: (node, parent, state, info) => {
        const [child] = node.children;
        if (
          node.children.length === 1 &&
          child?.type === "text" &&
          (child.value === node.url
            ? /^https?:\/\/\S+$/.test(node.url)
            : /^www\.\S+$/.test(child.value) &&
              node.url === `https://${child.value}`)
        ) {
          return child.value;
        }
        return defaultHandlers.link(node, parent, state, info);
      },
    },
  }).replace(/\n$/, "");

export const richTextNodesToMarkdown = (
  nodes: RichTextNode[],
  kind: RichTextKind,
): string => {
  if (kind === "content") {
    let end = nodes.length;
    while (end > 0 && isEmptyParagraph(nodes[end - 1]!)) end--;
    if (end === 0) return "\n".repeat(Math.max(0, nodes.length - 1));
    const trailing = nodes.length - end;
    const blocks = nodes
      .slice(0, end)
      .flatMap((node): BlockContent[] =>
        isEmptyParagraph(node)
          ? [{ type: "paragraph", children: [] }]
          : nodesToBlocks([node]),
      );
    return (
      serialize({ type: "root", children: blocks }) +
      (trailing > 0 ? "\n".repeat(trailing + 1) : "")
    );
  }
  const inline = nodes.flatMap((node, index) => [
    ...(index > 0 ? [{ type: "text", text: " " }] : []),
    ...(node.content ?? []),
  ]);
  const children = inlinePhrasing(inline);
  if (children.length === 0) return "";
  // Titles never parse block syntax, so its escapes are noise.
  return serialize({
    type: "root",
    children: [{ type: "paragraph", children }],
  })
    .replace(/\n/g, " ")
    .replace(/^\\([#>+-])/, "$1")
    .replace(/^(\d+)\\([.)])/, "$1$2");
};

export const normalizeRichTextMarkdown = (
  markdown: string,
  kind: RichTextKind,
): string =>
  richTextNodesToMarkdown(markdownToRichTextNodes(markdown, kind), kind);

export const richTextMarkdownToPlainText = (
  markdown: string,
  kind: RichTextKind,
): string => {
  const parts: string[] = [];
  const visit = (nodes: RichTextNode[], separator: string) => {
    nodes.forEach((node, index) => {
      if (index > 0 && node.type !== "text" && node.type !== "hardBreak") {
        parts.push(separator);
      }
      if (node.type === "hardBreak") parts.push(separator);
      if (node.text) parts.push(node.text);
      if (node.content) visit(node.content, separator);
    });
  };
  visit(markdownToRichTextNodes(markdown, kind), kind === "title" ? " " : "\n");
  return parts.join("");
};

// ─── Yjs ─────────────────────────────────────────────────────────────────────

const markName = (attribute: string) =>
  attribute.replace(/--[a-zA-Z0-9+/=]{8}$/, "");

const readYNodes = (parent: Y.XmlFragment | Y.XmlElement): RichTextNode[] =>
  parent.toArray().flatMap((child): RichTextNode[] => {
    if (child instanceof Y.XmlText) {
      return child
        .toDelta()
        .flatMap(
          (op: {
            insert?: unknown;
            attributes?: Record<string, { href?: unknown } | undefined>;
          }) => {
            if (typeof op.insert !== "string" || !op.insert) return [];
            const marks = Object.entries(op.attributes ?? {}).flatMap(
              ([attribute, value]): RichTextMark[] => {
                const type = markName(attribute);
                if (
                  !(MARK_ORDER as string[]).includes(type) &&
                  type !== "code"
                ) {
                  return [];
                }
                return type === "link"
                  ? [
                      {
                        type: "link",
                        attrs: { href: String(value?.href ?? "") },
                      },
                    ]
                  : [{ type: type as RichTextMarkType }];
              },
            );
            return [textNode(op.insert, marks)];
          },
        );
    }
    if (child instanceof Y.XmlElement) {
      // Yjs types attributes as strings, but Tiptap stores numbers too.
      const attributes: Record<string, unknown> = child.getAttributes();
      const attrs = Object.fromEntries(
        Object.entries(attributes).filter(
          (entry): entry is [string, string | number] =>
            typeof entry[1] === "string" || typeof entry[1] === "number",
        ),
      );
      const content = readYNodes(child);
      return [
        {
          type: child.nodeName,
          ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
          ...(content.length > 0 ? { content } : {}),
        },
      ];
    }
    return [];
  });

const toYText = (nodes: RichTextNode[]) => {
  const text = new Y.XmlText();
  text.applyDelta(
    nodes.map((node) => ({
      insert: node.text ?? "",
      attributes: Object.fromEntries(
        (node.marks ?? []).map((mark) => [
          mark.type,
          mark.type === "link"
            ? { href: mark.attrs?.href ?? "", ...LINK_ATTRS }
            : {},
        ]),
      ),
    })),
  );
  return text;
};

const toYNodes = (nodes: RichTextNode[]): (Y.XmlElement | Y.XmlText)[] => {
  const result: (Y.XmlElement | Y.XmlText)[] = [];
  let texts: RichTextNode[] = [];
  const flush = () => {
    if (texts.length > 0) result.push(toYText(texts));
    texts = [];
  };
  for (const node of nodes) {
    if (node.type === "text") {
      if (node.text) texts.push(node);
      continue;
    }
    flush();
    const element = new Y.XmlElement(node.type);
    for (const [key, value] of Object.entries(node.attrs ?? {})) {
      // Tiptap stores numeric attributes such as heading levels as numbers.
      element.setAttribute(key, value as string);
    }
    element.insert(0, toYNodes(node.content ?? []));
    result.push(element);
  }
  flush();
  return result;
};

export const encodeRichTextDoc = (doc: Y.Doc): string =>
  toBase64(Y.encodeStateAsUpdateV2(doc));

export const loadRichTextDoc = (
  encoded: string,
  doc = new Y.Doc(),
  origin?: unknown,
): Y.Doc => {
  Y.applyUpdateV2(doc, fromBase64(encoded), origin);
  return doc;
};

export const readRichTextDoc = (doc: Y.Doc): RichTextNode[] =>
  readYNodes(doc.getXmlFragment(RICH_TEXT_FRAGMENT));

const fnv1a32 = (input: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

// Devices converting the same markdown must produce byte-identical Yjs
// structs; a random client ID would make the merged document repeat the text.
export const seedRichTextDoc = (
  markdown: string,
  kind: RichTextKind,
): string => {
  const nodes = markdownToRichTextNodes(markdown, kind);
  const doc = new Y.Doc({ gc: true });
  doc.clientID = fnv1a32(`${SEED_VERSION}:${kind}:${JSON.stringify(nodes)}`);
  doc.getXmlFragment(RICH_TEXT_FRAGMENT).insert(0, toYNodes(nodes));
  const encoded = encodeRichTextDoc(doc);
  doc.destroy();
  return encoded;
};

export const richTextDocToMarkdown = (
  encoded: string,
  kind: RichTextKind,
): string => {
  const doc = loadRichTextDoc(encoded);
  const markdown = richTextNodesToMarkdown(readRichTextDoc(doc), kind);
  doc.destroy();
  return markdown;
};

// Rewrites only the top-level blocks that differ, so concurrent edits to
// untouched blocks survive a whole-text write such as an API update.
export const replaceRichTextDocMarkdown = (
  encoded: string,
  markdown: string,
  kind: RichTextKind,
): string => {
  const doc = loadRichTextDoc(encoded);
  const fragment = doc.getXmlFragment(RICH_TEXT_FRAGMENT);
  const current = readRichTextDoc(doc).map((node) => JSON.stringify(node));
  const nextNodes = markdownToRichTextNodes(markdown, kind);
  const next = nextNodes.map((node) => JSON.stringify(node));
  let prefix = 0;
  while (
    prefix < current.length &&
    prefix < next.length &&
    current[prefix] === next[prefix]
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < current.length - prefix &&
    suffix < next.length - prefix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }
  if (prefix === current.length && prefix === next.length) {
    doc.destroy();
    return encoded;
  }
  doc.transact(() => {
    fragment.delete(prefix, current.length - prefix - suffix);
    fragment.insert(
      prefix,
      toYNodes(nextNodes.slice(prefix, next.length - suffix)),
    );
  });
  const result = encodeRichTextDoc(doc);
  doc.destroy();
  return result;
};

const appliesChange = (base: string, other: string) => {
  const doc = loadRichTextDoc(base);
  let changed = false;
  doc.on("updateV2", () => {
    changed = true;
  });
  Y.applyUpdateV2(doc, fromBase64(other));
  return { doc, changed };
};

// Commutative, idempotent CRDT union. When one state already contains the
// other its exact bytes are kept, and equal states pick the smaller encoding,
// so replicas converge to identical rows and replays stay no-ops.
export const mergeRichTextDocs = (a: string, b: string): string => {
  if (a === b) return a;
  const fromA = appliesChange(a, b);
  if (!fromA.changed) {
    fromA.doc.destroy();
    const fromB = appliesChange(b, a);
    fromB.doc.destroy();
    if (!fromB.changed) return a < b ? a : b;
    return a;
  }
  const fromB = appliesChange(b, a);
  fromB.doc.destroy();
  if (!fromB.changed) {
    fromA.doc.destroy();
    return b;
  }
  const merged = encodeRichTextDoc(fromA.doc);
  fromA.doc.destroy();
  return merged;
};
