import { Redirect, Route, Switch } from "wouter";
import "./fixGlobal";
import { Board } from "./components/DaysBoard/DaysBoard";
import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { ProjectPage } from "./pages/ProjectPage/ProjectPage";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { isModelDNDData } from "./dnd/models";
import { KeyPressedCtxProvider } from "./globalListener/KeyPressedCtxProvider";
import { isInputElement } from "./utils/isInputElement";
import { ThemeProvider } from "./components/ui/theme-provider";
import { FocusKey, focusManager, focusSlice } from "./states/FocusManager";
import { StoreApi, StoreProvider } from "@will-be-done/hyperstate";
import {
  appSlice,
  dailyListType,
  dropSlice,
  projectionType,
  projectType,
  RootState,
  taskType,
} from "./models/models2";
import { initStore } from "./models/initRootStore2";
import { useAppStore } from "./hooks/state";
import { shouldNeverHappen } from "./utils";
import { DropTargetRecord } from "@atlaskit/pragmatic-drag-and-drop/dist/types/entry-point/types";
import { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";

const GlobalListener = () => {
  // const undoManager = getUndoManager();

  const store = useAppStore();
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

      console.log("global key", e);

      // Handle undo (cmd+z/ctrl+z)
      if (
        ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && !e.shiftKey) ||
        e.code === "KeyU"
      ) {
        e.preventDefault();
        // undoManager.undo();
        return;
      }

      // Handle redo (cmd+shift+z/ctrl+shift+z)
      if (
        ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && e.shiftKey) ||
        (e.code === "KeyR" && e.ctrlKey)
      ) {
        e.preventDefault();
        // undoManager.redo();
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

      console.log("isInput", isInput, activeElement);
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

        console.log("up", up, "down", down);

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
          focusSlice.focusByKey(store, focusableKey as FocusKey);
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
            const entity = appSlice.byId(store.getState(), t.data.modelId);
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

          dropSlice.handleDrop(
            store,
            targetItemInfo[1].id,
            dropModelId,
            closestEdgeOfTarget || "top",
          );
        },
      }),
    );
  }, [store]);

  return <></>;
};

export const App = () => {
  const [store, setStore] = useState<StoreApi<RootState> | null>(null);

  useEffect(() => {
    void (async () => {
      setStore(await initStore());
    })();
  }, []);

  return (
    store && (
      <StoreProvider value={store}>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
          <KeyPressedCtxProvider>
            <GlobalListener />

            <div className="w-full h-screen bg-gray-900 overflow-hidden flex">
              <Sidebar />
              <div className="flex-1 p-4 overflow-hidden">
                <Switch>
                  <Route path="/today" component={Board} />
                  <Route path="/projects/:projectId" component={ProjectPage} />
                  <Route>
                    <Redirect to="/today" />
                  </Route>
                </Switch>
              </div>
            </div>
          </KeyPressedCtxProvider>
        </ThemeProvider>
      </StoreProvider>
    )
  );
};
