import { ProjectItemsList2 } from "@/features/project/components/ProjectItemsList/ProjectItemList2";
import { inboxId } from "@will-be-done/slices";
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
import {
  select,
  useDB,
  useDispatch,
  useSyncSelector,
} from "@will-be-done/hyperdb";
import { projectsAllSlice, projectsSlice } from "@will-be-done/slices";
import {
  buildFocusKey,
  focusManager,
  focusSlice2,
} from "@/store2/slices/focusSlice";
import { ColumnListProvider } from "@/features/focus/components/ParentListProvider";
import { PopoverContent, PopoverTrigger } from "@radix-ui/react-popover";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker";
import { Popover } from "@/components/ui/popover";
import { useCurrentDate } from "./hooks";

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
  // console.log("orderNumber", projectId, orderNumber);

  const db = useDB();
  const project = useSyncSelector(
    () => projectsSlice.byIdOrDefault(projectId),
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

  const dispatch = useDispatch();

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

      dispatch(projectsSlice.delete([project.id]));

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

          return select(db, projectsSlice.canDrop(project.id, data.modelId));
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

  const currentDate = useCurrentDate();

  const overdueTasksCount = useSyncSelector(
    () =>
      projectsSlice.overdueTasksCountExceptDailiesCount(
        project.id,
        exceptDailyListIds,
        currentDate,
      ),
    [project.id, exceptDailyListIds, currentDate],
  );
  const notDoneTasksCount = useSyncSelector(
    () =>
      projectsSlice.notDoneTasksCountExceptDailiesCount(
        project.id,
        exceptDailyListIds,
      ),
    [project.id, exceptDailyListIds],
  );
  //
  // const overdueTasksCount = useSyncSelector(
  //   () =>
  //     projectItemsSlice2.overdueTaskCountExceptDailiesCount(
  //       project.id,
  //       exceptDailyListIds,
  //       currentDate,
  //     ),
  //   [project.id, exceptDailyListIds, currentDate],
  // );

  const handleEditClick = () => {
    const newTitle = prompt("Enter new project title", project.title);

    if (newTitle == "" || newTitle == null) {
      return;
    }

    dispatch(
      projectsSlice.update(project.id, {
        title: newTitle,
      }),
    );
  };

  const handleDeleteClick = () => {
    const shouldDelete = confirm(
      "Are you sure you want to delete this project?",
    );
    if (shouldDelete) {
      dispatch(projectsSlice.delete([project.id]));
    }
  };

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
      <div
        data-focusable-key={focusItem.key}
        key={project.id}
        className={cn(
          "flex items-center rounded-md px-2  text-content group",
          // isFocused ? "bg-gray-800" : "hover:bg-gray-800",
          closestEdge == "whole" &&
            "outline-2 outline-offset-1 outline-solid outline-panel-selected",
          isSelected ? "text-accent" : "text-content",
          // {
          //   hidden: isEditing,
          // },
        )}
      >
        <Popover>
          <PopoverTrigger asChild>
            <div className="text-base mr-4 flex-shrink-0 cursor-pointer">
              {project.icon || "🟡"}
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-fit p-0">
            <EmojiPicker
              className="h-[326px] rounded-lg shadow-md"
              onEmojiSelect={({ emoji }) => {
                dispatch(
                  projectsSlice.update(project.id, {
                    icon: emoji,
                  }),
                );
              }}
            >
              <EmojiPickerSearch />
              <EmojiPickerContent />
            </EmojiPicker>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          className="text-sm whitespace-nowrap overflow-hidden text-ellipsis pr-2 cursor-pointer"
          ref={ref}
          onClick={() => {
            // console.log("focusItem click", focusItem);
            dispatch(focusSlice2.focusByKey(focusItem.key, true));
            onProjectClick(project.id);
          }}
        >
          {project.title}
        </button>
        <div
          className={cn(
            "ml-auto flex items-center gap-1 text-content-tinted flex-shrink-0 ",
            project.id !== inboxId && "group-hover:hidden",
          )}
        >
          {overdueTasksCount > 0 && (
            <>
              <div className="text-notice">{overdueTasksCount}</div>|
            </>
          )}
          <div>{notDoneTasksCount}</div>
        </div>

        {/* group-hover:flex hidden */}
        <div
          className={cn(
            "ml-auto flex gap-2 text-content-tinted stroke-content hidden",
            project.id !== inboxId && "group-hover:flex",
          )}
        >
          <button
            onClick={handleEditClick}
            type="button"
            className="cursor-pointer flex justify-center items-center"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              width="12"
              height="13"
              viewBox="0 0 12 13"
            >
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M11.136 3.357a1.527 1.527 0 1 0-2.16-2.16l-7.228 7.23c-.126.126-.22.28-.271.45L.76 11.235a.27.27 0 0 0 .338.337l2.358-.715c.17-.052.324-.144.45-.27l7.229-7.23Z"
              />
            </svg>
          </button>

          <button
            onClick={handleDeleteClick}
            type="button"
            className="cursor-pointer flex justify-center items-center"
          >
            <svg
              width="12"
              height="13"
              viewBox="0 0 12 13"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M9.41667 2.91667V10.5C9.41667 10.7873 9.30253 11.0629 9.09937 11.266C8.8962 11.4692 8.62065 11.5833 8.33333 11.5833H2.91667C2.62935 11.5833 2.3538 11.4692 2.15063 11.266C1.94747 11.0629 1.83333 10.7873 1.83333 10.5V2.91667M0.75 2.91667H10.5M3.45833 2.91667V1.83333C3.45833 1.54602 3.57247 1.27047 3.77563 1.0673C3.9788 0.864137 4.25435 0.75 4.54167 0.75H6.70833C6.99565 0.75 7.2712 0.864137 7.47437 1.0673C7.67753 1.27047 7.79167 1.54602 7.79167 1.83333V2.91667"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

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

  const dispatch = useDispatch();
  const project = useSyncSelector(
    function* () {
      if (selectedProjectId == "inbox") {
        return yield* projectsAllSlice.inbox();
      }

      return yield* projectsSlice.byIdOrDefault(selectedProjectId);
    },
    [selectedProjectId],
  );

  // const taskIds = useSyncSelector(
  //   () =>
  //     dailyListsSlice2.allTaskIdsExceptDailies(
  //       project.id,
  //       exceptDailyListIds,
  //       // idsToAlwaysInclude,
  //     ),
  //   [exceptDailyListIds, project.id],
  // );

  const inboxProject = useSyncSelector(() => projectsAllSlice.inbox(), []);
  const projectIdsWithoutInbox = useSyncSelector(
    () => projectsAllSlice.childrenIdsWithoutInbox(),
    [],
  );

  const handleAddProjectClick = () => {
    const title = prompt("Enter project title");

    if (title) {
      dispatch(projectsSlice.create({ title }, "append"));
    }
  };

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <div className="flex h-full">
      <div className="overflow-y-auto">
        <ProjectItemsList2
          project={project}
          exceptDailyListIds={exceptDailyListIds}
        />
      </div>
      <ColumnListProvider
        focusKey={buildFocusKey("sidebar", "sidebar", "Sidebar")}
        priority="0"
      >
        <div className="w-80 h-full bg-panel-2 ml-auto rounded-l-lg flex flex-col">
          <div className="flex justify-center text-subheader my-2">
            Projects
          </div>
          <div className="h-full overflow-y-auto flex flex-col gap-2 px-3 py-2 text-sm overflow-x-hidden text-ellipsis">
            <ProjectItem
              projectId={inboxProject.id}
              orderNumber="0"
              onProjectClick={setSelectedProjectId}
              isSelected={selectedProjectId === inboxProject.id}
              exceptDailyListIds={exceptDailyListIds}
            />
            {projectIdsWithoutInbox.map((id, i) => (
              <ProjectItem
                key={id}
                projectId={id}
                orderNumber={(i + 1).toString()}
                onProjectClick={setSelectedProjectId}
                isSelected={selectedProjectId === id}
                exceptDailyListIds={exceptDailyListIds}
              />
            ))}
          </div>
          <div className="flex text-center items-center justify-center py-1 text-subheader text-sm ">
            <button
              type="button"
              onClick={handleAddProjectClick}
              className="cursor-pointer"
            >
              Add Project
            </button>
          </div>
        </div>
      </ColumnListProvider>
    </div>
  );
};
