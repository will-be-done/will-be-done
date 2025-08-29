import { useEffect, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { getUndoManager } from "@will-be-done/hyperstate";
import { useAppStore } from "@/hooks/stateHooks.ts";
import {
  FocusKey,
  focusManager,
  focusSlice,
} from "@/store/slices/focusSlice.ts";
import { isInputElement } from "@/utils/isInputElement.ts";
import { isModelDNDData } from "@/features/dnd/models.ts";
import { DropTargetRecord } from "@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types";
import { shouldNeverHappen } from "@/utils.ts";
import { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  appSlice2,
  dailyListType,
  dropSlice2,
  projectionType,
  projectType,
  taskType,
} from "@will-be-done/slices";
import { useDispatch, useSelect } from "@will-be-done/hyperdb";

export function GlobalListener() {
  const store = useAppStore();
  // const undoManager = getUndoManager(store);
  const dispatch = useDispatch();
  const select = useSelect();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isSomethingFocused = focusSlice.isSomethingFocused(
        store.getState(),
      );

      const isFocusDisabled = focusSlice.isFocusDisabled(store.getState());

      if (isFocusDisabled || e.defaultPrevented) return;

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
        focusSlice.resetFocus(store);

        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isFocusDisabled = focusSlice.isFocusDisabled(store.getState());

      if (isFocusDisabled || e.defaultPrevented) return;

      const activeElement =
        e.target instanceof Element ? e.target : document.activeElement;

      // Check if the active element IS any kind of input element
      const isInput = activeElement && isInputElement(activeElement);

      // If it's an input, return early
      if (isInput) return;

      // const setFocus = (focus: FocusItem) => {
      //   focus.focus();
      //
      //   const elements = document.querySelectorAll<HTMLElement>(
      //     '[data-focusable-key="' + focus.key + '"]',
      //   );
      //
      //   if (!elements.length) {
      //     shouldNeverHappen("focusable element not found", { focus });
      //     return;
      //   }
      //
      //   if (elements.length > 1) {
      //     shouldNeverHappen("focusable element > 1", { focus });
      //     return;
      //   }
      //
      //   const el = elements[0];
      //   if (el) {
      //     el.focus();
      //
      //     el.scrollIntoView({
      //       behavior: "smooth",
      //       block: "center",
      //       inline: "center",
      //     });
      //   }
      // };

      const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey);
      const isUp = (e.code === "ArrowUp" || e.code == "KeyK") && noModifiers;
      const isDown =
        e.code === "ArrowDown" || (e.code == "KeyJ" && noModifiers);

      const isLeft =
        e.code === "ArrowLeft" || (e.code == "KeyH" && noModifiers);
      const isRight =
        e.code === "ArrowRight" || (e.code == "KeyL" && noModifiers);

      const focusItemKey = focusSlice.getFocusKey(store.getState());
      const focusedItem = focusItemKey && focusManager.getItem(focusItemKey);
      if (focusedItem && (isUp || isDown)) {
        e.preventDefault();

        const [up, down] = focusManager.getSiblings(focusedItem.key);

        if (isUp) {
          if (!up) return;

          focusSlice.focusByKey(store, up.key);
        } else if (isDown) {
          if (!down) return;

          focusSlice.focusByKey(store, down.key);
        }
      } else if (focusedItem && (isLeft || isRight)) {
        e.preventDefault();

        const [left, right] = focusManager.getSiblingColumnsFirstItem(
          focusedItem.key,
        );

        if (isLeft) {
          if (!left) return;

          focusSlice.focusByKey(store, left.key);
        } else if (isRight) {
          if (!right) return;

          focusSlice.focusByKey(store, right.key);
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
          focusSlice.focusByKey(store, focusableKey as FocusKey, true);
        }
      }
    };

    window.addEventListener("focus", handleFocus, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focus", handleFocus);
    };
  }, [store]);

  useEffect(() => {
    return combine(
      monitorForElements({
        onDrop(args) {
          const { location, source } = args;

          if (!location.current.dropTargets.length) {
            return;
          }

          if (!isModelDNDData(source.data)) {
            return;
          }

          const dropModelId = source.data.modelId;

          const targetImportanceOrder = [
            taskType,
            projectionType,
            dailyListType,
            projectType,
          ];

          const targetModels = location.current.dropTargets.flatMap((t) => {
            if (!isModelDNDData(t.data)) {
              return [] as const;
            }
            const entity = select(appSlice2.byId(t.data.modelId));
            if (!entity) return [] as const;
            return [[t, entity] as const];
          });

          let targetItemInfo:
            | readonly [DropTargetRecord, { id: string; type: string }]
            | undefined = undefined;
          for (const importanceType of targetImportanceOrder) {
            targetItemInfo = targetModels.find(
              ([_, e]) => e.type === importanceType,
            ) as readonly [DropTargetRecord, { id: string; type: string }];

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

          dispatch(
            dropSlice2.handleDrop(
              targetItemInfo[1].id,
              dropModelId,
              closestEdgeOfTarget || "top",
            ),
          );
        },
      }),
    );
  }, [dispatch, select]);

  return <></>;
}
