import { useCallback, useState } from "react";
import {
  richTextDocToMarkdown,
  type RichTextKind,
} from "@will-be-done/slices/common";

// Shows what an editor just saved until the stored row catches up, so leaving
// the editor never flashes the previous text, and an editor reopened in that
// window continues the saved doc instead of seeding a second copy from text.
export function useSavedRichText(
  storedText: string,
  storedDoc: string | undefined,
  kind: RichTextKind,
  save: (doc: string) => void | Promise<void>,
) {
  const [saved, setSaved] = useState<{
    fromText: string;
    fromDoc: string | undefined;
    text: string;
    doc: string;
  } | null>(null);
  const isPending =
    saved?.fromText === storedText && saved.fromDoc === storedDoc;
  // Once the stored row moves on, the save landed or was superseded.
  if (saved && !isPending) setSaved(null);
  const saveDoc = useCallback(
    (doc: string) => {
      setSaved({
        fromText: storedText,
        fromDoc: storedDoc,
        text: richTextDocToMarkdown(doc, kind),
        doc,
      });
      return save(doc);
    },
    [kind, save, storedDoc, storedText],
  );

  return {
    text: saved && isPending ? saved.text : storedText,
    doc: saved && isPending ? saved.doc : storedDoc,
    saveDoc,
  };
}
