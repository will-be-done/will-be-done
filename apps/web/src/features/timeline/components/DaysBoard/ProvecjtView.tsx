import { ProjectItemsList2 } from "@/features/project/components/ProjectItemsList/ProjectItemList2";
import { dailyListsSlice2, inboxId } from "@will-be-done/slices";
import { useRegisterFocusItem } from "@/features/focus/hooks/useLists.ts";
import { useGlobalListener } from "@/features/global-listener/hooks.tsx";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import { dropTargetForExternal } from "@atlaskit/pragmatic-drag-and-drop/external/adapter";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import invariant from "tiny-invariant";
import { DndModelData, isModelDNDData } from "@/features/dnd/models";
import { cn } from "@/lib/utils";
import ReactDOM from "react-dom";
import { isInputElement } from "@/utils/isInputElement";
import { Link } from "@tanstack/react-router";
import {
  execSync,
  select,
  useDB,
  useDispatch,
  useSelect,
  useSyncSelector,
} from "@will-be-done/hyperdb";
import {
  allProjectsSlice2,
  appSlice2,
  projectItemsSlice2,
  projectsSlice2,
} from "@will-be-done/slices";
import { Backup } from "@will-be-done/slices";
import {
  buildFocusKey,
  focusManager,
  focusSlice2,
} from "@/store2/slices/focusSlice";
import { ColumnListProvider } from "@/features/focus/components/ParentListProvider";
import { useCurrentDate, useCurrentDMY } from "./hooks";

const ProjectDragPreview = function TaskPrimitiveComponent({
  title,
  icon,
  style,
}: {
  icon: string;
  title: string;
  style: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "flex items-center px-2 py-1.5 rounded-lg cursor-pointer bg-gray-900",
      )}
      style={style}
    >
      <span className="text-base mr-2 flex-shrink-0">{icon}</span>
      <span className="text-white text-sm whitespace-nowrap overflow-hidden text-ellipsis">
        {title}
      </span>
    </div>
  );
};

type State =
  | { type: "idle" }
  | { type: "preview"; container: HTMLElement; rect: DOMRect }
  | { type: "dragging" };

const idleState: State = { type: "idle" };
const draggingState: State = { type: "dragging" };

const DropProjectIndicator = function DropProjectIndicatorComp() {
  // p-3 rounded-lg border border-blue-500 bg-gray-700 shadow-md transition-colors h-12
  return <div className={`rounded-lg border-blue-500 bg-gray-700 h-10`}></div>;
};

const ProjectItem = function ProjectItemComp({
  projectId,
  orderNumber,
  onProjectClick,
  isSelected,
  exceptDailyListIds,
}: {
  projectId: string;
  orderNumber: string;
  onProjectClick: (projectId: string) => void;
  isSelected: boolean;
  exceptDailyListIds: string[];
}) {
  console.log("orderNumber", projectId, orderNumber);

  const db = useDB();
  const project = useSyncSelector(
    () => projectsSlice2.byIdOrDefault(projectId),
    [projectId],
  );
  const focusItem = useRegisterFocusItem(
    buildFocusKey(project.id, project.type, "ProjectItem"),
    orderNumber,
  );
  const [closestEdge, setClosestEdge] = useState<Edge | "whole" | null>(null);
  const [dndState, setDndState] = useState<State>(idleState);

  const ref = useRef<HTMLButtonElement>(null);

  const isFocused = useSyncSelector(
    () => focusSlice2.isFocused(focusItem.key),
    [focusItem.key],
  );

  useGlobalListener("mousedown", (e: MouseEvent) => {
    const isFocusDisabled = select(db, focusSlice2.isFocusDisabled());

    if (
      isFocused &&
      ref.current &&
      !ref.current.contains(e.target as Node) &&
      !isFocusDisabled &&
      !e.defaultPrevented
    ) {
      dispatch(focusSlice2.resetFocus());
    }
  });

  const dispatch = useDispatch();

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (!isFocused) return;
    const isFocusDisabled = select(db, focusSlice2.isFocusDisabled());

    if (isFocusDisabled || e.defaultPrevented) return;
    const activeElement =
      e.target instanceof Element ? e.target : document.activeElement;
    const isInput = activeElement && isInputElement(activeElement);
    if (isInput) return;

    const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey);
    const isAddAfter = noModifiers && (e.code === "KeyA" || e.code === "KeyO");
    const isAddBefore = e.shiftKey && (e.code === "KeyA" || e.code === "KeyO");

    if (e.code === "Backspace" || e.code === "KeyD" || e.code === "KeyX") {
      e.preventDefault();

      const [up, down] = focusManager.getSiblings(focusItem.key);

      dispatch(projectsSlice2.delete([project.id]));

      if (down) {
        dispatch(focusSlice2.focusByKey(down.key));
      } else if (up) {
        dispatch(focusSlice2.focusByKey(up.key));
      } else {
        dispatch(focusSlice2.resetFocus());
      }
    } else if (e.code === "KeyI" && noModifiers) {
      e.preventDefault();

      dispatch(focusSlice2.editByKey(focusItem.key));
    } else if (isAddAfter || isAddBefore) {
      e.preventDefault();

      // TODO: fix it
      // const newProject = project.createSibling(isAddAfter ? "after" : "before");
      // focusSlice.editByKey(
      //   buildFocusKey(newProject.id, newProject.$modelType, "ProjectItem"),
      // );

      return;
    }
  });

  useEffect(() => {
    const element = ref.current;
    invariant(element);

    return combine(
      draggable({
        element: element,
        getInitialData: (): DndModelData => ({
          modelId: project.id,
          modelType: project.type,
        }),
        onGenerateDragPreview: ({ location, source, nativeSetDragImage }) => {
          const rect = source.element.getBoundingClientRect();

          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: preserveOffsetOnSource({
              element,
              input: location.current.input,
            }),
            render({ container }) {
              setDndState({ type: "preview", container, rect });

              return () => {
                setDndState(draggingState);
              };
            },
          });
        },

        onDragStart: () => setDndState(draggingState),
        onDrop: () => setDndState(idleState),
      }),
      dropTargetForExternal({
        element: element,
      }),
      dropTargetForElements({
        element: element,
        canDrop: ({ source }) => {
          const data = source.data;
          if (!isModelDNDData(data)) return false;

          return select(db, projectsSlice2.canDrop(project.id, data.modelId));
        },
        getIsSticky: () => true,
        getData: ({ input, element }) => {
          const data: DndModelData = {
            modelId: project.id,
            modelType: project.type,
          };

          return attachClosestEdge(data, {
            input,
            element,
            allowedEdges: ["top", "bottom"],
          });
        },
        onDragEnter: (args) => {
          const data = args.source.data;

          if (isModelDNDData(data) && data.modelId !== project.id) {
            if (data.modelType === project.type) {
              setClosestEdge(extractClosestEdge(args.self.data));
            } else {
              setClosestEdge("whole");
            }
          }
        },
        onDrag: (args) => {
          const data = args.source.data;

          if (isModelDNDData(data) && data.modelId !== project.id) {
            if (data.modelType === project.type) {
              setClosestEdge(extractClosestEdge(args.self.data));
            } else {
              setClosestEdge("whole");
            }
          }
        },
        onDragLeave: () => {
          setClosestEdge(null);
        },
        onDrop: () => {
          setClosestEdge(null);
        },
      }),
    );
  }, [db, project.id, project.type]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();
      dispatch(focusSlice2.resetEdit());
    }
  };

  const isEditing = useSyncSelector(
    () => focusSlice2.isEditing(focusItem.key),
    [focusItem.key],
  );

  const currentDate = useCurrentDate();
  const notDoneTasksCount = useSyncSelector(
    () =>
      projectItemsSlice2.notDoneTaskCountExceptDailiesCount(
        project.id,
        exceptDailyListIds,
      ),
    [project.id, exceptDailyListIds],
  );

  const overdueTasksCount = useSyncSelector(
    () =>
      projectItemsSlice2.overdueTaskCountExceptDailiesCount(
        project.id,
        exceptDailyListIds,
        currentDate,
      ),
    [project.id, exceptDailyListIds, currentDate],
  );

  return (
    <>
      {closestEdge == "top" && <DropProjectIndicator />}

      {/* <input */}
      {/*   ref={(e) => { */}
      {/*     if (!e) return; */}
      {/*     e.focus(); */}
      {/*   }} */}
      {/*   type="text" */}
      {/*   value={project.title} */}
      {/*   onChange={(e) => { */}
      {/*     dispatch( */}
      {/*       projectsActions.update(project.id, { */}
      {/*         title: e.target.value, */}
      {/*       }), */}
      {/*     ); */}
      {/*   }} */}
      {/*   onKeyDown={handleInputKeyDown} */}
      {/* /> */}
      {/* to="/projects/$projectId" */}
      {/* params={{ projectId: project.id }} */}
      {/* href={`/projects/${project.id}`} */}
      <button
        type="button"
        data-focusable-key={focusItem.key}
        ref={ref}
        key={project.id}
        className={cn(
          "flex items-center rounded-md cursor-pointer px-2  text-content",
          // isFocused ? "bg-gray-800" : "hover:bg-gray-800",
          closestEdge == "whole" &&
            "outline-2 outline-offset-1 outline-solid outline-panel-selected",
          isSelected && "text-accent",
          // {
          //   hidden: isEditing,
          // },
        )}
        onClick={() => {
          // console.log("focusItem click", focusItem);
          dispatch(focusSlice2.focusByKey(focusItem.key, true));
          onProjectClick(project.id);
        }}
      >
        <div className="text-base mr-4 flex-shrink-0">
          {project.icon || "🟡"}
        </div>
        <div className="text-sm whitespace-nowrap overflow-hidden text-ellipsis">
          {project.title}
        </div>
        <div className="ml-auto flex items-center gap-1 text-content-tinted flex-shrink-0">
          {overdueTasksCount > 0 && (
            <>
              <div className="text-notice">{overdueTasksCount}</div>|
            </>
          )}
          <div>{notDoneTasksCount}</div>
        </div>
      </button>

      {closestEdge == "bottom" && <DropProjectIndicator />}

      {dndState.type === "preview" &&
        ReactDOM.createPortal(
          <ProjectDragPreview
            title={project.title}
            icon={project.icon || "🟡"}
            style={{
              boxSizing: "border-box",
              width: dndState.rect.width,
              height: dndState.rect.height,
            }}
          />,
          dndState.container,
        )}
    </>
  );
};

export const ProjectView = ({
  exceptDailyListIds,
}: {
  exceptDailyListIds: string[];
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState(inboxId);
  // const taskHorizons = useFilterStore(useShallow((state) => state.horizons));

  const project = useSyncSelector(
    function* () {
      if (selectedProjectId == "inbox") {
        return yield* allProjectsSlice2.inbox();
      }

      return yield* projectsSlice2.byIdOrDefault(selectedProjectId);
    },
    [selectedProjectId],
  );

  const taskIds = useSyncSelector(
    () =>
      dailyListsSlice2.notDoneTaskIdsExceptDailies(
        project.id,
        exceptDailyListIds,
        ["someday", "week", "month", "year"],
        [],
        // idsToAlwaysInclude,
      ),
    [exceptDailyListIds, project.id],
  );

  const inboxProject = useSyncSelector(() => allProjectsSlice2.inbox(), []);
  const projectIdsWithoutInbox = useSyncSelector(
    () => allProjectsSlice2.childrenIdsWithoutInbox(),
    [],
  );

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <>
      <ProjectItemsList2
        project={project}
        todoTaskIds={taskIds}
        doneTaskIds={[]}
      />
      <ColumnListProvider
        focusKey={buildFocusKey("sidebar", "sidebar", "Sidebar")}
        priority="0"
      >
        <div className="absolute w-80 h-full bg-panel-2 right-0 top-0 bottom-0 m-auto rounded-l-lg flex flex-col">
          <div className="flex justify-center text-subheader my-2">
            Projects
          </div>
          <div className="h-full overflow-y-auto flex flex-col gap-2 px-3 py-2 text-sm">
            <ProjectItem
              exceptDailyListIds={exceptDailyListIds}
              projectId={inboxProject.id}
              orderNumber="0"
              onProjectClick={setSelectedProjectId}
              isSelected={selectedProjectId === inboxProject.id}
            />
            {projectIdsWithoutInbox.map((id, i) => (
              <ProjectItem
                exceptDailyListIds={exceptDailyListIds}
                key={id}
                projectId={id}
                orderNumber={(i + 1).toString()}
                onProjectClick={setSelectedProjectId}
                isSelected={selectedProjectId === id}
              />
            ))}
          </div>
        </div>
      </ColumnListProvider>
    </>
  );
};
