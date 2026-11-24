import { useLayoutEffect, useRef, useState } from "react";
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

  // The item this view shows, or null once it unmounts. A conversion that
  // settles after the user closed the view or picked another item, including
  // its undo from the toast, must not move the view.
  const shownId = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    shownId.current = loaded?.id;
  });
  useLayoutEffect(
    () => () => {
      shownId.current = null;
    },
    [],
  );
  const converting = useRef(false);

  const replaceItem: ReplaceItem = (to, run) => {
    // A second click would convert a row the first one already deleted.
    if (converting.current) return;
    converting.current = true;
    const startedOn = shownId.current;
    const isStillShown = () =>
      shownId.current !== null &&
      [undefined, startedOn, to.id].includes(shownId.current);
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
          console.error(error);
          toast.error("Couldn't convert the item", {
            description: error instanceof Error ? error.message : undefined,
          });
          return undefined;
        })
        .finally(() => {
          converting.current = false;
        });
      if (!isStillShown()) return;
      if (next) onReplaced?.(next);
      else setReplacement(undefined);
    })();
  };

  return { item, replaceItem };
}
