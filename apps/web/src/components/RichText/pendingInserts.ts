import { Plugin, PluginKey } from "@tiptap/pm/state";

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
