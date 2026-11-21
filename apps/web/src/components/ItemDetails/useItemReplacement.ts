import { useState } from "react";
import { useAsyncSelector, useSelectAsync } from "@will-be-done/hyperdb/react";
import {
  type Item,
  taskTemplateType,
  taskType,
} from "@will-be-done/slices/space";
import type { ReplaceItem } from "@/components/Task/useNoteConversion.ts";
import {
  itemDetailsByListItemId,
  itemDetailsData,
  itemDetailsFields,
} from "./selectors.ts";

// A conversion swaps the shown row for a new one. Reading the new row too
// moves the view to it in the same render the old one disappears, instead of
// flashing an empty or half-loaded view.
export function useItemReplacement(
  loaded: Item | undefined,
  onReplaced?: (next: Item) => void,
) {
  const select = useSelectAsync();
  const [replacement, setReplacement] = useState<
    Parameters<ReplaceItem>[0] & { from?: Item }
  >();
  const { data: next } = useAsyncSelector({
    selector: itemDetailsByListItemId,
    args: {
      id: replacement?.id ?? "",
      modelType: replacement?.type ?? taskType,
    },
    enabled: !!replacement,
  });
  if (replacement && loaded && loaded.id !== replacement.from?.id) {
    setReplacement(undefined);
  }
  const item = replacement ? (next ?? loaded ?? replacement.from) : loaded;

  const replaceItem: ReplaceItem = (to, run) => {
    setReplacement({ ...to, from: loaded });
    const readNext = () =>
      select({
        selector: itemDetailsByListItemId,
        args: { id: to.id, modelType: to.type },
      });
    // Reading the new item and its details before they exist caches the
    // misses, so they reach the view in the same update that removes the old
    // item. The new item stays in the old one's section.
    const readAhead = () =>
      Promise.all([
        readNext(),
        loaded &&
          select({
            selector: itemDetailsData,
            args: {
              ...itemDetailsFields(loaded),
              ...to,
              ...(to.type === taskTemplateType && { templateId: to.id }),
            },
          }),
      ]);
    void (async () => {
      const next = await readAhead()
        .then(run)
        .then(readNext)
        .catch(() => undefined);
      if (next) onReplaced?.(next);
      else setReplacement(undefined);
    })();
  };

  return { item, replaceItem };
}
