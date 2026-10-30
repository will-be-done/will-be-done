import {
  replaceRichTextDocMarkdown,
  richTextDocToMarkdown,
  seedRichTextDoc,
  type RichTextKind,
} from "../common/richText";

type RichTextItem = {
  title: string;
  content?: string;
  titleDoc?: string;
  contentDoc?: string;
};

const syncField = (
  currentText: string | undefined,
  currentDoc: string | undefined,
  nextText: string | undefined,
  nextDoc: string | undefined,
  kind: RichTextKind,
): { text: string; doc: string } | undefined => {
  if (nextDoc !== undefined && nextDoc !== currentDoc) {
    return { doc: nextDoc, text: richTextDocToMarkdown(nextDoc, kind) };
  }
  if ((nextText ?? "") === (currentText ?? "")) return undefined;
  // A text write edits the doc (seeded like every other replica would) so it
  // merges with concurrent editor changes instead of being overwritten.
  const doc = replaceRichTextDocMarkdown(
    currentDoc ?? seedRichTextDoc(currentText ?? "", kind),
    nextText ?? "",
    kind,
  );
  return { doc, text: richTextDocToMarkdown(doc, kind) };
};

// Keeps each Yjs doc and its markdown text in step for a whole-row write.
export const syncItemRichText = <T extends RichTextItem>(
  current: T,
  next: T,
): T => {
  const title = syncField(
    current.title,
    current.titleDoc,
    next.title,
    next.titleDoc,
    "title",
  );
  const content = syncField(
    current.content,
    current.contentDoc,
    next.content,
    next.contentDoc,
    "content",
  );
  const result: T = {
    ...next,
    ...(title ? { title: title.text, titleDoc: title.doc } : {}),
    ...(content ? { content: content.text, contentDoc: content.doc } : {}),
  };
  // Clearing content omits the field, as it did before docs existed.
  if (next.content === undefined && result.content === "")
    delete result.content;
  return result;
};

// Checklist items are single-line, so their content follows title rules.
export const syncChecklistItemRichText = <
  T extends { content: string; contentDoc?: string },
>(
  current: T,
  next: T,
): T => {
  const content = syncField(
    current.content,
    current.contentDoc,
    next.content,
    next.contentDoc,
    "title",
  );
  return content
    ? { ...next, content: content.text, contentDoc: content.doc }
    : next;
};
