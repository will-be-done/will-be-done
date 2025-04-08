import { Link, Redirect, Route, Switch } from "wouter";
import "./fixGlobal";
import { Board } from "./components/DaysBoard/DaysBoard";
import { observer } from "mobx-react-lite";
import {
  DailyList,
  getRootStore,
  getUndoManager,
  Task,
  TaskProjection,
} from "./models/models";
import { currentProjectionState } from "./states/task";
import { useEffect } from "react";
import { detach } from "mobx-keystone";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { ProjectPage } from "./pages/ProjectPage/ProjectPage";
import { BaseListItem } from "./models/listActions";
import { useUnmount } from "./utils";
import { globalKeysState } from "./states/isGlobalKeyDisables";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  dropTargetForElements,
  ElementDragPayload,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types";
import { DropTargetRecord } from "@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types";
import { isModelDNDData } from "./dnd/models";

const GlobalListener = observer(function GlobalListenerComponent() {
  const rootStore = getRootStore();
  const state = currentProjectionState;

  const undoManager = getUndoManager();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement =
        e.target instanceof Element ? e.target : document.activeElement;

      if (!globalKeysState.isEnabled) return;

      // Check if the active element IS any kind of input element
      const isInput =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT" ||
          activeElement.tagName === "BUTTON" ||
          // Cast to HTMLElement to access isContentEditable
          (activeElement instanceof HTMLElement
            ? activeElement.isContentEditable
            : false) ||
          activeElement.closest("label") ||
          activeElement.closest("[role='textbox']") ||
          activeElement.closest("[role='button']") ||
          activeElement.closest("[role='combobox']") ||
          activeElement.closest("[role='slider']") ||
          activeElement.closest("[role='checkbox']") ||
          activeElement.closest("[role='radio']") ||
          activeElement.closest("[role='switch']"));

      // If it's an input, return early
      if (isInput) return;

      // Handle undo (cmd+z/ctrl+z)
      if (
        ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && !e.shiftKey) ||
        e.code === "KeyU"
      ) {
        e.preventDefault();
        undoManager.undo();
        return;
      }

      // Handle redo (cmd+shift+z/ctrl+shift+z)
      if (
        ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && e.shiftKey) ||
        (e.code === "KeyR" && e.ctrlKey)
      ) {
        e.preventDefault();
        undoManager.redo();
        return;
      }

      console.log(e);

      const selectedId = state.selectedItemId;
      if (
        (e.code === "Backspace" || e.code === "KeyD" || e.code === "KeyX") &&
        selectedId &&
        !state.isEditing()
      ) {
        const item = rootStore.listsService.findListItemOrThrow(selectedId);
        if (!item) {
          throw new Error("selected item not found");
        }

        const [up, down] = item.siblings;

        detach(item);

        if (down) {
          state.setSelectedItem(down.id);
        } else if (up) {
          state.setSelectedItem(up.id);
        } else {
          state.resetSelected();
        }

        return;
      }

      if (e.code === "Escape" && !state.isSomethingFocused) {
        state.resetSelected();

        return;
      }

      if (
        (e.code === "Enter" || e.code === "KeyI") &&
        state.isSomethingSelected()
      ) {
        e.preventDefault();
        state.makeSelectionFocused();

        return;
      }

      const isAddAfter =
        !e.shiftKey && (e.code === "KeyA" || e.code === "KeyO");
      const isAddBefore =
        e.shiftKey && (e.code === "KeyA" || e.code === "KeyO");
      if ((isAddAfter || isAddBefore) && selectedId && !state.isEditing()) {
        e.preventDefault();
        const item = rootStore.listsService.findListItemOrThrow(selectedId);
        const list = item.listRef.current;

        const [up, down] = item.siblings;

        let between: [BaseListItem | undefined, BaseListItem | undefined] = [
          up,
          item,
        ];
        if (isAddAfter) {
          between = [item, down] as const;
        }

        const newItem = list.createChild(between, item);

        state.setFocusedItemId(newItem.id);
        return;
      }

      const isUp = e.code === "ArrowUp" || e.code == "KeyK";
      const isDown = e.code === "ArrowDown" || e.code == "KeyJ";
      if ((isUp || isDown) && selectedId && !state.isEditing()) {
        const item = rootStore.listsService.findListItemOrThrow(selectedId);
        if (!item) {
          throw new Error("selected item not found");
        }
        const [up, down] = item.siblings;

        if (isUp && up) {
          state.setSelectedItem(up.id);
        }

        if (isDown && down) {
          state.setSelectedItem(down.id);
        }

        return;
      }

      console.log("key", e.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.selectedItemId, rootStore.listsService, state, undoManager]);

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

          const sourceEntity = getRootStore().getEntity(source.data.modelId);
          if (!sourceEntity) {
            console.warn("Source entity not found");

            return;
          }

          const dropModels = location.current.dropTargets.flatMap((t) => {
            if (!isModelDNDData(t.data)) {
              return [] as const;
            }

            const entity = getRootStore().getEntity(t.data.modelId);
            if (!entity) return [] as const;

            return [[t, entity] as const];
          });
          console.log("dropModels", dropModels);

          const dropImportanceOrder = [Task, TaskProjection, DailyList];

          type droppableEntity = Task | TaskProjection | DailyList;
          let dropInfo:
            | readonly [DropTargetRecord, droppableEntity]
            | undefined = undefined;
          for (const importance of dropImportanceOrder) {
            dropInfo = dropModels.find(
              ([_, e]) => e instanceof importance,
            ) as readonly [DropTargetRecord, droppableEntity];

            if (dropInfo) {
              break;
            }
          }
          console.log("dropInfo", dropInfo);

          if (!dropInfo) {
            console.warn("Drop entity not found or not in importance list");
            return;
          }

          const closestEdgeOfTarget: Edge | null = extractClosestEdge(
            dropInfo[0].data,
          );

          if (
            closestEdgeOfTarget &&
            closestEdgeOfTarget != "top" &&
            closestEdgeOfTarget != "bottom"
          ) {
            throw new Error("edge is not top or bottm");
          }
          console.log(
            "onDrop",
            args,
            "drop",
            dropInfo[1],
            "source",
            sourceEntity,
            "closestEdge",
            closestEdgeOfTarget,
          );

          dropInfo[1].handleDrop(sourceEntity, closestEdgeOfTarget || "bottom");
        },
      }),
    );
  }, []);

  return <></>;
});

export const App = observer(function App() {
  return (
    <>
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
    </>
  );
});
