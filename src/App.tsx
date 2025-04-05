import { Link, Redirect, Route, Switch } from "wouter";
import "./fixGlobal";
import { Board } from "./components/DaysBoard/DaysBoard";
import { observer } from "mobx-react-lite";
import { getRootStore, getUndoManager, TaskProjection } from "./models/models";
import { currentProjectionState } from "./states/task";
import { useEffect } from "react";
import { clone, detach } from "mobx-keystone";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { ProjectPage } from "./pages/ProjectPage/ProjectPage";

const GlobalListener = observer(function GlobalListenerComponent() {
  const rootStore = getRootStore();
  const state = currentProjectionState;

  const undoManager = getUndoManager();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;

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
      const { tasksService } = rootStore;
      // Handle undo (cmd+z/ctrl+z)
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && !e.shiftKey) {
        e.preventDefault();
        undoManager.undo();
        return;
      }

      // Handle redo (cmd+shift+z/ctrl+shift+z)
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && e.shiftKey) {
        e.preventDefault();
        undoManager.redo();
        return;
      }

      console.log(e);

      const selectedListId = state.selectedProjection?.listId;
      const selectedProjectionId = state.selectedProjection?.projectionId;
      if (
        (e.code === "Backspace" || e.code === "KeyD" || e.code === "KeyX") &&
        selectedListId &&
        selectedProjectionId &&
        !state.isEditing()
      ) {
        const list = rootStore.listsService.findListOrThrow(selectedListId);
        const projection = list.projections.find(
          (p) => p.id === selectedProjectionId,
        );

        if (!projection) return;
        const [up, down] = projection.siblings;

        detach(projection);

        if (down) {
          state.setSelectedProjection(down);
        } else if (up) {
          state.setSelectedProjection(up);
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
      if (
        (isAddAfter || isAddBefore) &&
        selectedListId &&
        selectedProjectionId &&
        !state.isEditing()
      ) {
        e.preventDefault();
        const projection =
          rootStore.projectionsService.findProjection(selectedProjectionId);
        if (!projection || !(projection instanceof TaskProjection)) return;

        const [up, down] = projection.siblings;

        let between: [TaskProjection | undefined, TaskProjection | undefined] =
          [up, projection];
        if (isAddAfter) {
          between = [projection, down] as const;
        }

        const [, newProjection] = tasksService.createTask(
          projection.itemRef.current.projectRef.current,
          clone(projection.listRef),
          between,
        );

        state.setFocusedProjection(newProjection);
        return;
      }

      const isUp = e.code === "ArrowUp" || e.code == "KeyK";
      const isDown = e.code === "ArrowDown" || e.code == "KeyJ";
      if (
        (isUp || isDown) &&
        selectedListId &&
        selectedProjectionId &&
        !state.isEditing()
      ) {
        const list = rootStore.listsService.findListOrThrow(selectedListId);
        const projection = list.projections.find(
          (p) => p.id === selectedProjectionId,
        );
        if (!projection) return;
        const [up, down] = projection.siblings;

        if (isUp && up) {
          state.setSelectedProjection(up);
        }
        if (isDown && down) {
          state.setSelectedProjection(down);
        }

        return;
      }

      console.log("key", e.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.selectedProjection, rootStore.listsService, state, undoManager]);

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
