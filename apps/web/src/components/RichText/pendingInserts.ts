import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ATTACHMENT_NODE, attachmentUrl } from "@will-be-done/slices/common";
import type { Attachment } from "@will-be-done/slices/space";
import type { AttachFiles } from "./attachmentNode";

export type Range = { from: number; to: number };
export type PendingMeta = { add: [symbol, Range] } | { remove: symbol };

// Where pasted or dropped files go, mapped through edits made while they are
// stored, so typing meanwhile neither moves nor gets replaced by them.
export const pendingInserts = new PluginKey<Map<symbol, Range>>(
  "attachmentInserts",
);

export const pendingInsertsPlugin = new Plugin({
  key: pendingInserts,
  state: {
    init: () => new Map<symbol, Range>(),
    apply: (tr, pending) => {
      const meta = tr.getMeta(pendingInserts) as PendingMeta | undefined;
      if (!meta && !tr.docChanged) return pending;
      const next = new Map<symbol, Range>();
      for (const [key, { from, to }] of pending) {
        next.set(key, {
          from: tr.mapping.map(from, -1),
          to: Math.max(tr.mapping.map(from, -1), tr.mapping.map(to, -1)),
        });
      }
      if (meta && "add" in meta) next.set(...meta.add);
      if (meta && "remove" in meta) next.delete(meta.remove);
      return next;
    },
  },
});

const insertAttachments = (
  view: EditorView,
  key: symbol,
  attachments: Attachment[],
) => {
  // The file stays in the item's list when the editor closed meanwhile.
  if (view.isDestroyed) return;
  const range = pendingInserts.getState(view.state)?.get(key);
  let tr = view.state.tr.setMeta(pendingInserts, {
    remove: key,
  } satisfies PendingMeta);
  const type = view.state.schema.nodes[ATTACHMENT_NODE];
  if (range && type && attachments.length > 0) {
    tr = tr.replaceWith(
      range.from,
      range.to,
      attachments.map((attachment) =>
        type.create({
          src: attachmentUrl(attachment.id),
          alt: attachment.name,
        }),
      ),
    );
    tr = tr.scrollIntoView();
  }
  view.dispatch(tr);
};

export const attachAt = (
  view: EditorView,
  attachFiles: AttachFiles,
  files: File[],
  range: Range,
) => {
  const key = Symbol();
  view.dispatch(
    view.state.tr.setMeta(pendingInserts, {
      add: [key, range],
    } satisfies PendingMeta),
  );
  void attachFiles(files).then((added) => insertAttachments(view, key, added));
};

// Picked files go where the cursor is, or at the end when the editor is not
// focused.
export const attachPicked = (
  view: EditorView,
  attachFiles: AttachFiles,
  files: File[],
  focused: boolean,
) => {
  const { from, to } = focused
    ? view.state.selection
    : Selection.atEnd(view.state.doc);
  attachAt(view, attachFiles, files, { from, to });
};
