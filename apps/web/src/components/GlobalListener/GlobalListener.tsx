import { useEffect } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { isInputElement } from "@/utils/isInputElement.ts";
import { isDayTimelineDropData, isModelDNDData } from "@/lib/dnd/models.ts";
import { DropTargetRecord } from "@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types";
import { shouldNeverHappen } from "@/utils.ts";
import { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  AnyModelType,
  appById,
  appHandleDrop,
  checklistItemType,
  dailyListType,
  projectSectionType,
  dailyEntryType,
  projectType,
  stashEntryType,
  stashType,
  taskTemplateType,
  taskType,
} from "@will-be-done/slices/space";
import { useDB, useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { FocusKey, useFocusStore } from "@/store/focusSlice.ts";
import {
  getDOMSiblings,
  getDOMColumnSiblingFirstItems,
} from "@/components/Focus/domNavigation.ts";
import { selectAsync } from "@will-be-done/hyperdb";

export function GlobalListener() {
  const dispatch = useAsyncDispatch();
  const db = useDB();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const focusState = useFocusStore.getState();
      const isSomethingFocused =
        !focusState.isFocusDisabled && !!focusState.focusItemKey;

      if (focusState.isFocusDisabled || e.defaultPrevented) return;

      const activeElement =
        e.target instanceof Element ? e.target : document.activeElement;

      // Check if the active element IS any kind of input element
      const isInput = activeElement && isInputElement(activeElement);

      // If it's an input, return early
      if (isInput) return;
      if (e.target instanceof HTMLElement && e.target.shadowRoot) {
        return;
      }

      // Handle undo (cmd+z/ctrl+z)
      if (
        ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && !e.shiftKey) ||
        e.code === "KeyU"
      ) {
        e.preventDefault();
        // TODO: return undo support
        // undoManager.undo();
        return;
      }

      // Handle redo (cmd+shift+z/ctrl+shift+z)
      if (
        ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && e.shiftKey) ||
        (e.code === "KeyR" && e.ctrlKey)
      ) {
        e.preventDefault();
        // TODO: return undo support
        return;
      }

      if (e.code === "Escape" && !isSomethingFocused) {
        useFocusStore.getState().resetFocus();

        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const focusState = useFocusStore.getState();

      if (focusState.isFocusDisabled || e.defaultPrevented) return;

      const activeElement =
        e.target instanceof Element ? e.target : document.activeElement;

      // Check if the active element IS any kind of input element
      const isInput = activeElement && isInputElement(activeElement);

      // If it's an input, return early
      if (isInput) return;

      const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey);
      const isUp = (e.code === "ArrowUp" || e.code == "KeyK") && noModifiers;
      const isDown =
        e.code === "ArrowDown" || (e.code == "KeyJ" && noModifiers);

      const isLeft =
        e.code === "ArrowLeft" || (e.code == "KeyH" && noModifiers);
      const isRight =
        e.code === "ArrowRight" || (e.code == "KeyL" && noModifiers);

      const focusItemKey = useFocusStore.getState().focusItemKey;
      if (focusItemKey && (isUp || isDown)) {
        e.preventDefault();

        const [up, down] = getDOMSiblings(focusItemKey);

        if (isUp) {
          if (!up) return;

          useFocusStore.getState().focusByKey(up);
        } else if (isDown) {
          if (!down) return;

          useFocusStore.getState().focusByKey(down);
        }
      } else if (focusItemKey && (isLeft || isRight)) {
        e.preventDefault();

        const [left, right] = getDOMColumnSiblingFirstItems(focusItemKey);

        if (isLeft) {
          if (!left) return;

          useFocusStore.getState().focusByKey(left);
        } else if (isRight) {
          if (!right) return;

          useFocusStore.getState().focusByKey(right);
        }
      }
    };

    const handleFocus = (event: Event) => {
      const focusedElement = event.target;
      if (!(focusedElement instanceof HTMLElement)) {
        return;
      }

      if (focusedElement.hasAttribute("data-focusable-key")) {
        const focusableKey = focusedElement.getAttribute("data-focusable-key");

        if (focusableKey) {
          useFocusStore.getState().focusByKey(focusableKey as FocusKey, true);
        }
      }
    };

    window.addEventListener("focus", handleFocus, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    return combine(
      monitorForElements({
        onDrop: function (args) {
          void (async () => {
            const { location, source } = args;

            if (!location.current.dropTargets.length) {
              return;
            }

            if (
              location.current.dropTargets.some((target) =>
                isDayTimelineDropData(target.data),
              )
            ) {
              return;
            }

            if (!isModelDNDData(source.data)) {
              return;
            }

            const targetImportanceOrder = [
              checklistItemType,
              stashEntryType,
              dailyEntryType,
              taskType,
              taskTemplateType,
              stashType,
              dailyListType,
              projectSectionType,
              projectType,
            ];

            const targetModelsArray = await Promise.all(
              location.current.dropTargets.map(async (t) => {
                if (!isModelDNDData(t.data)) {
                  return [] as const;
                }
                const entity = await selectAsync(db, {
                  selector: appById,
                  args: { id: t.data.modelId, modelType: t.data.modelType },
                });
                if (!entity) {
                  // Virtual models (e.g. stash) have no DB row — use DnD data directly
                  return [
                    [
                      t,
                      { id: t.data.modelId, type: t.data.modelType },
                    ] as const,
                  ];
                }
                return [[t, entity] as const];
              }),
            );

            const targetModels = targetModelsArray.flatMap((t) => t);

            let targetItemInfo:
              | readonly [DropTargetRecord, { id: string; type: AnyModelType }]
              | undefined = undefined;
            for (const importanceType of targetImportanceOrder) {
              targetItemInfo = targetModels.find(
                ([_, e]) => e.type === importanceType,
              ) as readonly [
                DropTargetRecord,
                { id: string; type: AnyModelType },
              ];

              if (targetItemInfo) {
                break;
              }
            }

            if (!targetItemInfo) {
              shouldNeverHappen(
                "Drop entity not found or not in importance list",
              );

              return;
            }

            const closestEdgeOfTarget: Edge | null = extractClosestEdge(
              targetItemInfo[0].data,
            );

            if (
              closestEdgeOfTarget &&
              closestEdgeOfTarget != "top" &&
              closestEdgeOfTarget != "bottom"
            ) {
              shouldNeverHappen("edge is not top or bottom");

              return;
            }

            void dispatch(
              appHandleDrop({
                id: targetItemInfo[1].id,
                modelType: targetItemInfo[1].type,
                dropId: source.data.modelId,
                dropModelType: source.data.modelType,
                edge: closestEdgeOfTarget || "top",
              }),
            );
          })();
        },
      }),
    );
  }, [db, dispatch]);

  return <></>;
}
