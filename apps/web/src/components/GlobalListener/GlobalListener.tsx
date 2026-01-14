import { useEffect } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { isInputElement } from "@/utils/isInputElement.ts";
import { isModelDNDData } from "@/lib/dnd/models.ts";
import { DropTargetRecord } from "@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types";
import { shouldNeverHappen } from "@/utils.ts";
import { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  appSlice,
  dailyListType,
  projectCategoryType,
  projectType,
  taskType,
  projectionType,
  AnyModelType,
} from "@will-be-done/slices";
import { select, useDB, useDispatch } from "@will-be-done/hyperdb";
import { FocusKey, focusManager, focusSlice } from "@/store/focusSlice.ts";

export function GlobalListener() {
  const dispatch = useDispatch();
  const db = useDB();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isSomethingFocused = select(db, focusSlice.isSomethingFocused());

      const isFocusDisabled = select(db, focusSlice.isFocusDisabled());

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
        dispatch(focusSlice.resetFocus());

        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [db, dispatch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isFocusDisabled = select(db, focusSlice.isFocusDisabled());

      if (isFocusDisabled || e.defaultPrevented) return;

      const activeElement =
        e.target instanceof Element ? e.target : document.activeElement;

      // Check if the active element IS any kind of input element
      const isInput = activeElement && isInputElement(activeElement);

      // If it's an input, return early
      if (isInput) return;

      // const setFocus = (Focus: FocusItem) => {
      //   Focus.Focus();
      //
      //   const elements = document.querySelectorAll<HTMLElement>(
      //     '[data-focusable-key="' + Focus.key + '"]',
      //   );
      //
      //   if (!elements.length) {
      //     shouldNeverHappen("focusable element not found", { Focus });
      //     return;
      //   }
      //
      //   if (elements.length > 1) {
      //     shouldNeverHappen("focusable element > 1", { Focus });
      //     return;
      //   }
      //
      //   const el = elements[0];
      //   if (el) {
      //     el.Focus();
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

      const focusItemKey = select(db, focusSlice.getFocusKey());
      const focusedItem = focusItemKey && focusManager.getItem(focusItemKey);
      if (focusedItem && (isUp || isDown)) {
        e.preventDefault();

        const [up, down] = focusManager.getSiblings(focusedItem.key);

        if (isUp) {
          if (!up) return;

          dispatch(focusSlice.focusByKey(up.key));
        } else if (isDown) {
          if (!down) return;

          dispatch(focusSlice.focusByKey(down.key));
        }
      } else if (focusedItem && (isLeft || isRight)) {
        e.preventDefault();

        const [left, right] = focusManager.getSiblingColumnsFirstItem(
          focusedItem.key,
        );

        if (isLeft) {
          if (!left) return;

          dispatch(focusSlice.focusByKey(left.key));
        } else if (isRight) {
          if (!right) return;

          dispatch(focusSlice.focusByKey(right.key));
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
          dispatch(focusSlice.focusByKey(focusableKey as FocusKey, true));
        }
      }
    };

    window.addEventListener("focus", handleFocus, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focus", handleFocus);
    };
  }, [db, dispatch]);

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

          const targetImportanceOrder = [
            projectionType,
            taskType,
            dailyListType,
            projectCategoryType,
            projectType,
          ];

          const targetModels = location.current.dropTargets.flatMap((t) => {
            if (!isModelDNDData(t.data)) {
              return [] as const;
            }
            const entity = select(db, appSlice.byId(t.data.modelId, t.data.modelType));
            if (!entity) return [] as const;
            return [[t, entity] as const];
          });

          let targetItemInfo:
            | readonly [
                DropTargetRecord,
                { id: string; type: AnyModelType },
              ]
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

          dispatch(
            appSlice.handleDrop(
              targetItemInfo[1].id,
              targetItemInfo[1].type,
              source.data.modelId,
              source.data.modelType,
              closestEdgeOfTarget || "top",
            ),
          );
        },
      }),
    );
  }, [db, dispatch]);

  return <></>;
}
