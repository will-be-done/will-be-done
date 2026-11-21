import { useState } from "react";
import { toast } from "sonner";
import { useAsyncSelector, useSelectAsync } from "@will-be-done/hyperdb/react";
import {
  type Item,
  itemByListItemId,
  taskTemplateType,
  taskType,
} from "@will-be-done/slices/space";
import type { ReplaceItem } from "@/components/Task/useNoteConversion.ts";
import { itemDetailsData, itemDetailsFields } from "./selectors.ts";

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
    selector: itemByListItemId,
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
        selector: itemByListItemId,
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
        .catch((error: unknown) => {
          setReplacement(undefined);
          toast.error("Couldn't convert the item", {
            description: error instanceof Error ? error.message : undefined,
          });
          throw error;
        });
      if (next) onReplaced?.(next);
      else setReplacement(undefined);
    })();
  };

  return { item, replaceItem };
}
