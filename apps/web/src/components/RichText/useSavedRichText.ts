import { useCallback, useState } from "react";
import {
  richTextDocToMarkdown,
  type RichTextKind,
} from "@will-be-done/slices/common";

// Shows what an editor just saved until the stored value catches up, so
// leaving the editor never flashes the previous text.
export function useSavedRichText(
  stored: string,
  kind: RichTextKind,
  save: (doc: string) => void | Promise<void>,
) {
  const [saved, setSaved] = useState<{ from: string; to: string } | null>(null);
  const saveDoc = useCallback(
    (doc: string) => {
      setSaved({ from: stored, to: richTextDocToMarkdown(doc, kind) });
      return save(doc);
    },
    [kind, save, stored],
  );

  return {
    text: saved?.from === stored ? saved.to : stored,
    saveDoc,
  };
}
