import { ProjectItemsList } from "@/components/ProjectItemsList/ProjectItemList.tsx";
import { getDOMSiblings } from "@/components/Focus/domNavigation.ts";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
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
import { DndModelData, isModelDNDData } from "@/lib/dnd/models.ts";
import { cn } from "@/lib/utils.ts";
import ReactDOM from "react-dom";
import { isInputElement } from "@/utils/isInputElement.ts";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  createProject,
  deleteProjects,
  projectsWithTaskStats,
  type Project,
  updateProject,
} from "@will-be-done/slices/space";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { selectedProject } from "./selectors.ts";
import { PopoverContent, PopoverTrigger } from "@radix-ui/react-popover";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker.tsx";
import { Popover } from "@/components/ui/popover.tsx";
import { promptDialog } from "@/components/ui/prompt-dialog-service";
import { useCurrentDate } from "@/components/DaysBoard/hooks.tsx";
import { ResizableDivider } from "@/components/DaysBoard/ResizableDivider.tsx";
import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";
import { startOfDay } from "date-fns";

const MIN_PROJECTS_LIST_WIDTH = 240;
const MAX_PROJECTS_LIST_WIDTH = 520;

type ProjectsListSize = {
  width: number;
  setWidth: (value: number) => void;
};

const useProjectsListSize = create<ProjectsListSize>()(
  persist(
    (set) => ({
      width: 320,
      setWidth: (value: number) => {
        set({
          width: Math.max(
            MIN_PROJECTS_LIST_WIDTH,
            Math.min(MAX_PROJECTS_LIST_WIDTH, value),
          ),
        });
      },
    }),
    {
      name: "projects-list-size",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

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
        "flex items-center px-2 py-1.5 rounded-lg cursor-pointer bg-panel ring-1 ring-ring",
      )}
      style={style}
    >
      <span className="text-base mr-2 flex-shrink-0">{icon}</span>
      <span className="text-content text-sm whitespace-nowrap overflow-hidden text-ellipsis">
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

const DropProjectIndicator = function DropProjectIndicatorComp({
  direction,
}: {
  direction: "top" | "bottom";
}) {
  return (
    <div
      className={cn(
        "absolute left-0 right-0 w-full bg-accent h-[2px] rounded-full",
        direction === "top" && "top-[-5px]",
        direction === "bottom" && "bottom-[-5px]",
      )}
    />
  );
};

const ProjectItem = function ProjectItemComp({
  project,
  notDoneTasksCount,
  overdueTasksCount,
  // onProjectClick,
  isSelected,
  projectLink: ProjectLink,
}: {
  project: Project;
  notDoneTasksCount: number;
  overdueTasksCount: number;
  // onProjectClick: (projectId: string) => void;
  isSelected: boolean;
  projectLink: React.ComponentType<
    React.PropsWithChildren<{
      projectId: string;
      className?: string;
      ref?: React.Ref<HTMLAnchorElement>;
    }>
  >;
}) {
  const focusItemKey = buildFocusKey(project.id, project.type, "ProjectItem");
  const [closestEdge, setClosestEdge] = useState<Edge | "whole" | null>(null);
  const [dndState, setDndState] = useState<State>(idleState);

  const ref = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  const isFocused = useFocusStore(
    (s) => !s.isFocusDisabled && s.focusItemKey === focusItemKey,
  );

  const dispatch = useAsyncDispatch();

  useGlobalListener("mousedown", (e: MouseEvent) => {
    const { isFocusDisabled } = useFocusStore.getState();

    if (
      isFocused &&
      ref.current &&
      !ref.current.contains(e.target as Node) &&
      !isFocusDisabled &&
      !e.defaultPrevented
    ) {
      useFocusStore.getState().resetFocus();
    }
  });

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (!isFocused) return;
    const { isFocusDisabled } = useFocusStore.getState();

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

      const [upKey, downKey] = getDOMSiblings(focusItemKey);

      void dispatch(deleteProjects({ ids: [project.id] }));

      if (downKey) {
        useFocusStore.getState().focusByKey(downKey);
      } else if (upKey) {
        useFocusStore.getState().focusByKey(upKey);
      } else {
        useFocusStore.getState().resetFocus();
      }
    } else if (e.code === "KeyI" && noModifiers) {
      e.preventDefault();

      useFocusStore
        .getState()
        .editByKey(buildFocusKey(project.id, project.type, "ProjectItem"));
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
    if (!project) return;
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

          return true;
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
  }, [project]);

  const handleEditClick = async () => {
    if (!project) return;
    const newTitle = await promptDialog(
      "Enter new project title",
      project.title,
    );

    if (newTitle == "" || newTitle == null) {
      return;
    }

    await dispatch(
      updateProject({
        id: project.id,
        project: {
          title: newTitle,
        },
      }),
    );
  };

  const handleDeleteClick = () => {
    if (!project) return;
    const shouldDelete = confirm(
      "Are you sure you want to delete this project?",
    );
    if (shouldDelete) {
      void dispatch(deleteProjects({ ids: [project.id] }));
    }
  };

  if (!project) return null;

  return (
    <div className="relative">
      {closestEdge == "top" && <DropProjectIndicator direction="top" />}

      <div
        ref={ref}
        data-focusable-key={focusItemKey}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("button, a")) return;
          linkRef.current?.click();
        }}
        className={cn(
          "flex items-center rounded-md px-2 py-1 text-content group transition-all cursor-pointer",
          closestEdge == "whole" && "ring-2 ring-accent bg-accent/10",
          isSelected
            ? "text-accent bg-accent/10"
            : "text-content hover:bg-panel-hover",
        )}
      >
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-base mr-4 flex-shrink-0 cursor-pointer"
            >
              {project.icon || "🟡"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="z-50 w-fit p-0">
            <EmojiPicker
              className="h-[326px] rounded-lg shadow-md"
              onEmojiSelect={({ emoji }) => {
                void dispatch(
                  updateProject({
                    id: project.id,
                    project: {
                      icon: emoji,
                    },
                  }),
                );
              }}
            >
              <EmojiPickerSearch />
              <EmojiPickerContent />
            </EmojiPicker>
          </PopoverContent>
        </Popover>

        <ProjectLink
          ref={(el) => {
            linkRef.current = el;
            if (el) el.draggable = false;
          }}
          projectId={project.id}
          className="text-sm whitespace-nowrap overflow-hidden text-ellipsis pr-2 flex-1 min-w-0"
        >
          {project.title}
        </ProjectLink>

        <div
          className={cn(
            "ml-auto flex items-center gap-1 text-xs tabular-nums text-content-tinted flex-shrink-0 ",
            !project.isInbox && "group-hover:hidden",
          )}
        >
          {overdueTasksCount > 0 && (
            <>
              <span className="text-notice">{overdueTasksCount}</span>
              <span className="text-content-tinted/50">|</span>
            </>
          )}
          <span>{notDoneTasksCount}</span>
        </div>

        <div
          className={cn(
            "ml-auto flex gap-2 text-content-tinted stroke-content hidden",
            !project.isInbox && "group-hover:flex",
          )}
        >
          <button
            onClick={() => void handleEditClick()}
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

      {closestEdge == "bottom" && <DropProjectIndicator direction="bottom" />}

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
    </div>
  );
};

export const ProjectView = ({
  marginTop,
  projectLink,
  selectedProjectId,
  selectedDate,
}: {
  marginTop?: boolean;
  projectLink: React.ComponentType<
    React.PropsWithChildren<{
      projectId: string;
      className?: string;
      ref?: React.Ref<HTMLAnchorElement>;
    }>
  >;
  selectedProjectId: string;
  selectedDate?: Date;
}) => {
  const projectsListRef = useRef<HTMLDivElement>(null);
  // const [selectedProjectId, setSelectedProjectId] = useState(inboxId);

  const dispatch = useAsyncDispatch();
  const projectsListWidth = useProjectsListSize((s) => s.width);
  const setProjectsListWidth = useProjectsListSize((s) => s.setWidth);
  const { data: project } = useAsyncSelector({
    selector: selectedProject,
    args: { selectedProjectId },
  });

  const today = useCurrentDate();
  const currentDate = startOfDay(today).getTime();
  const { data: projects = [] } = useAsyncSelector({
    selector: projectsWithTaskStats,
    args: { currentDate },
  });
  const inboxProject = projects.find(({ project }) => project.isInbox);
  const projectsWithoutInbox = projects.filter(
    ({ project }) => !project.isInbox,
  );

  const handleAddProjectClick = async () => {
    const title = await promptDialog("Enter project title");

    if (title) {
      await dispatch(createProject({ project: { title }, position: "append" }));
    }
  };

  const handleProjectsListResize = useCallback(
    (clientX: number) => {
      const rootRight =
        projectsListRef.current?.getBoundingClientRect().right ??
        window.innerWidth;
      setProjectsListWidth(rootRight - clientX);
    },
    [setProjectsListWidth],
  );

  if (!project || !inboxProject) {
    return <div>Project not found</div>;
  }

  return (
    <div className="flex h-full w-full shrink-0">
      <div
        className={cn("h-full min-w-0 flex-1 overflow-auto", {
          "mt-10": marginTop,
          "-mt-1 pt-1": !marginTop,
        })}
      >
        <ProjectItemsList project={project} selectedDate={selectedDate} />
      </div>
      <div
        ref={projectsListRef}
        data-focus-column
        className="relative h-full bg-surface-elevated ml-auto flex flex-col shrink-0 ring-1 ring-ring"
        style={{ width: `${projectsListWidth}px` }}
      >
        <ResizableDivider
          orientation="vertical"
          onResizePosition={handleProjectsListResize}
          className="left-0 top-0 "
        />
        <div className="flex justify-center text-content-tinted my-3 mx-3 text-[13px] font-medium">
          Projects
        </div>
        <div className="h-full overflow-y-auto flex flex-col gap-1 px-3 py-2 text-sm overflow-x-hidden text-ellipsis">
          <ProjectItem
            projectLink={projectLink}
            project={inboxProject.project}
            notDoneTasksCount={inboxProject.notDoneCount}
            overdueTasksCount={inboxProject.overdueCount}
            isSelected={
              selectedProjectId === "inbox" ||
              selectedProjectId === inboxProject.project.id
            }
          />
          {projectsWithoutInbox.map(
            ({ project, notDoneCount, overdueCount }) => (
              <ProjectItem
                projectLink={projectLink}
                key={project.id}
                project={project}
                notDoneTasksCount={notDoneCount}
                overdueTasksCount={overdueCount}
                isSelected={selectedProjectId === project.id}
              />
            ),
          )}
        </div>
        <div className="flex text-center items-center justify-center pb-3 pt-2 border-t border-ring">
          <button
            type="button"
            onClick={() => void handleAddProjectClick()}
            className="cursor-pointer text-[13px] text-content-tinted hover:text-accent transition-colors"
          >
            + Add Project
          </button>
        </div>
      </div>
    </div>
  );
};
