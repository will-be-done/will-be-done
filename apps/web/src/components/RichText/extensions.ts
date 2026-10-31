import { markInputRule, markPasteRule, type Extensions } from "@tiptap/core";
import Bold, {
  starInputRegex as boldStarInputRegex,
  starPasteRegex as boldStarPasteRegex,
} from "@tiptap/extension-bold";
import Collaboration from "@tiptap/extension-collaboration";
import Document from "@tiptap/extension-document";
import Italic, {
  starInputRegex as italicStarInputRegex,
  starPasteRegex as italicStarPasteRegex,
} from "@tiptap/extension-italic";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import {
  RICH_TEXT_FRAGMENT,
  type RichTextKind,
} from "@will-be-done/slices/common";
import type * as Y from "yjs";
import { LinkClick } from "./links";
import { MarkdownMarkers } from "./markdownMarkers";
import { MarkdownPaste } from "./markdownPaste";

// Markdown is stored with `*` emphasis only; `_` rules would italicize names
// like snake_case while typing.
const StarBold = Bold.extend({
  addInputRules() {
    return [markInputRule({ find: boldStarInputRegex, type: this.type })];
  },
  addPasteRules() {
    return [markPasteRule({ find: boldStarPasteRegex, type: this.type })];
  },
});

const StarItalic = Italic.extend({
  addInputRules() {
    return [markInputRule({ find: italicStarInputRegex, type: this.type })];
  },
  addPasteRules() {
    return [markPasteRule({ find: italicStarPasteRegex, type: this.type })];
  },
});

// Several paragraphs stay valid so a merged title can never break the editor.
const TitleDocument = Document.extend({ content: "paragraph+" });

export function richTextExtensions({
  kind,
  doc,
  placeholder,
}: {
  kind: RichTextKind;
  doc: Y.Doc;
  placeholder: string;
}): Extensions {
  const shared = [
    StarBold,
    StarItalic,
    MarkdownMarkers,
    LinkClick,
    MarkdownPaste.configure({ kind }),
    Placeholder.configure({ placeholder }),
    Collaboration.configure({ document: doc, field: RICH_TEXT_FRAGMENT }),
  ];
  if (kind === "title") {
    return [
      StarterKit.configure({
        document: false,
        bold: false,
        italic: false,
        underline: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        hardBreak: false,
        dropcursor: false,
        gapcursor: false,
        trailingNode: false,
        undoRedo: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      TitleDocument,
      ...shared,
    ];
  }
  return [
    StarterKit.configure({
      bold: false,
      italic: false,
      underline: false,
      trailingNode: false,
      undoRedo: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    ...shared,
  ];
}
