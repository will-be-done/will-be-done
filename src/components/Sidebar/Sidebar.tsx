import { observer } from "mobx-react-lite";
import { getRootStore, Project } from "../../models/models";
import { Link } from "wouter";
import { getBackups, loadBackups, Backup } from "../../models/backup";
import { useRegisterFocusColumn, useRegisterFocusItem } from "@/hooks/useLists";
import { computed } from "mobx";
import { useGlobalListener } from "@/globalListener/hooks";
import { detach } from "mobx-keystone";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { ColumnListProvider } from "@/hooks/ParentListProvider";
import { buildFocusKey, focusManager } from "@/states/FocusManager";
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
import { DndModelData, isModelDNDData } from "@/dnd/models";
import { cn } from "@/lib/utils";
import ReactDOM from "react-dom";
import { isInputElement } from "@/utils/isInputElement";

type State =
  | { type: "idle" }
  | { type: "preview"; container: HTMLElement; rect: DOMRect }
  | { type: "dragging" };

const idleState: State = { type: "idle" };
const draggingState: State = { type: "dragging" };

const ProjectDragPreview = observer(function TaskPrimitiveComponent({
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
});

const DropProjectIndicator = observer(function DropProjectIndicatorComp() {
  // p-3 rounded-lg border border-blue-500 bg-gray-700 shadow-md transition-colors h-12
  return <div className={`rounded-lg border-blue-500 bg-gray-700 h-10`}></div>;
});

const ProjectItem = observer(function ProjectItemComp({
  project,
}: {
  project: Project;
}) {
  const focusItem = useRegisterFocusItem(
    buildFocusKey(project.id, project.$modelType, "ProjectItem"),
    project.orderToken,
  );
  const [closestEdge, setClosestEdge] = useState<Edge | "whole" | null>(null);
  const [dndState, setDndState] = useState<State>(idleState);

  const ref = useRef<HTMLAnchorElement>(null);

  useGlobalListener("mousedown", (e: MouseEvent) => {
    if (
      focusItem.isFocused &&
      ref.current &&
      !ref.current.contains(e.target as Node) &&
      !focusManager.isFocusDisabled &&
      !e.defaultPrevented
    ) {
      focusManager.resetFocus();
    }
  });

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (!focusItem.isFocused) return;
    if (focusManager.isFocusDisabled || e.defaultPrevented) return;
    const activeElement =
      e.target instanceof Element ? e.target : document.activeElement;
    const isInput = activeElement && isInputElement(activeElement);
    if (isInput) return;

    const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey);
    const isAddAfter = noModifiers && (e.code === "KeyA" || e.code === "KeyO");
    const isAddBefore = e.shiftKey && (e.code === "KeyA" || e.code === "KeyO");

    if (e.code === "Backspace" || e.code === "KeyD" || e.code === "KeyX") {
      e.preventDefault();

      const [up, down] = focusItem.siblings;
      detach(project);

      setTimeout(() => {
        if (down) {
          focusManager.focusByKey(down.key);
        } else if (up) {
          focusManager.focusByKey(up.key);
        } else {
          focusManager.resetFocus();
        }
      }, 0);
    } else if (e.code === "KeyI" && noModifiers) {
      e.preventDefault();

      focusItem.edit();
    } else if (isAddAfter || isAddBefore) {
      e.preventDefault();

      // const newProject = project.createSibling(isAddAfter ? "after" : "before");
      // focusManager.editByKey(
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
          modelType: project.$modelType,
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

          const entity = getRootStore().getEntity(data.modelId, data.modelType);
          if (!entity) return false;

          return project.canDrop(entity);
        },
        getIsSticky: () => true,
        getData: ({ input, element }) => {
          const data: DndModelData = {
            modelId: project.id,
            modelType: project.$modelType,
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
            if (data.modelType === project.$modelType) {
              setClosestEdge(extractClosestEdge(args.self.data));
            } else {
              setClosestEdge("whole");
            }
          }
        },
        onDrag: (args) => {
          const data = args.source.data;

          if (isModelDNDData(data) && data.modelId !== project.id) {
            if (data.modelType === project.$modelType) {
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

  const isFocused = focusItem.isFocused;

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();
      focusManager.resetEdit();
    }
  };
  return (
    <>
      {closestEdge == "top" && <DropProjectIndicator />}

      <input
        ref={(e) => {
          if (!e) return;
          e.focus();
        }}
        className={cn({ hidden: !focusItem.isEditing })}
        type="text"
        value={project.title}
        onChange={(e) => {
          project.setTitle(e.target.value);
        }}
        onKeyDown={handleInputKeyDown}
      />
      <Link
        data-focusable-key={focusItem.key}
        ref={ref}
        key={project.id}
        className={(active) =>
          cn(
            "flex items-center px-2 py-1.5 rounded-lg cursor-pointer",
            active || isFocused ? "bg-gray-800" : "hover:bg-gray-800",
            closestEdge == "whole" && "bg-gray-700",
            {
              hidden: focusItem.isEditing,
            },
          )
        }
        href={`/projects/${project.id}`}
        onClick={() => {
          console.log("focusItem click", focusItem);
          focusItem.focus();
        }}
      >
        <span className="text-base mr-2 flex-shrink-0">
          {project.displayIcon}
        </span>
        <span className="text-white text-sm whitespace-nowrap overflow-hidden text-ellipsis">
          {project.title}
        </span>
      </Link>

      {closestEdge == "bottom" && <DropProjectIndicator />}

      {dndState.type === "preview" &&
        ReactDOM.createPortal(
          <ProjectDragPreview
            title={project.title}
            icon={project.displayIcon}
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
});

const InboxItem = observer(function IboxItemComp({
  inboxProject,
}: {
  inboxProject: Project;
}) {
  const focusItem = useRegisterFocusItem(
    buildFocusKey(inboxProject.id, inboxProject.$modelType),
    "0",
  );
  const isFocused = focusItem.isFocused;

  const [closestEdge, setClosestEdge] = useState<"whole" | null>(null);
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const element = ref.current;
    invariant(element);

    return combine(
      dropTargetForExternal({
        element: element,
      }),
      dropTargetForElements({
        element: element,
        canDrop: ({ source }) => {
          const data = source.data;
          if (!isModelDNDData(data)) return false;

          const entity = getRootStore().getEntity(data.modelId, data.modelType);
          if (!entity) return false;

          return inboxProject.canDrop(entity);
        },

        getData: ({ input, element }) => {
          const data: DndModelData = {
            modelId: inboxProject.id,
            modelType: inboxProject.$modelType,
          };

          return attachClosestEdge(data, {
            input,
            element,
            allowedEdges: ["top", "bottom"],
          });
        },
        getIsSticky: () => true,
        onDragEnter: () => {
          setClosestEdge("whole");
        },
        onDrag: () => {
          setClosestEdge("whole");
        },
        onDragLeave: () => {
          setClosestEdge(null);
        },
        onDrop: () => {
          setClosestEdge(null);
        },
      }),
    );
  }, [inboxProject]);

  return (
    <Link
      ref={ref}
      data-focusable-key={focusItem.key}
      href="/projects/inbox"
      className={(active) =>
        cn(
          "flex items-center px-2 py-2 rounded-lg hover:bg-gray-800 cursor-pointer",
          isFocused || active ? "bg-gray-800" : "hover:bg-gray-800",
          closestEdge == "whole" && "bg-gray-700",
        )
      }
    >
      <span className="text-amber-500 mr-2 flex-shrink-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      </span>
      <span className="text-white text-sm">Inbox</span>
      <span className="text-gray-400 ml-auto text-sm">
        {inboxProject?.children.length ?? 0}
      </span>
    </Link>
  );
});

const TodayItem = observer(function TodayItemComp() {
  const id = "today";
  const focusItem = useRegisterFocusItem(buildFocusKey(id, id), "1");
  const isFocused = focusItem.isFocused;

  return (
    <Link
      data-focusable-key={focusItem.key}
      href="/today"
      className={(active) =>
        `flex items-center px-2 py-2 rounded-lg hover:bg-gray-800 cursor-pointer ${
          active || isFocused ? "bg-gray-800" : "hover:bg-gray-800"
        }`
      }
    >
      <span className="text-amber-500 mr-2 flex-shrink-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </span>
      <span className="text-white text-sm">Today</span>
    </Link>
  );
});

export const Sidebar = observer(function SidebarComp() {
  const { allProjectsList, projectsRegistry } = getRootStore();
  const projects = allProjectsList.withoutInbox;
  const inboxProject = allProjectsList.inbox;

  const createProject = () => {
    allProjectsList.createProject("prepend");
  };

  const handleDownloadBackup = () => {
    const backup = getBackups(getRootStore());
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, "-").split(".")[0];
    a.download = `todo-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadBackup = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const result = event.target?.result;
          if (typeof result !== "string") {
            throw new Error("Failed to read file");
          }
          const parsedBackup = JSON.parse(result) as unknown;
          // Validate backup structure
          if (!isValidBackup(parsedBackup)) {
            throw new Error("Invalid backup format");
          }
          // TODO: clean db
          loadBackups(getRootStore(), parsedBackup);
        } catch (error) {
          console.error("Failed to load backup:", error);
          alert(
            "Failed to load backup file. Please make sure it's a valid backup file.",
          );
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const isValidBackup = (data: unknown): data is Backup => {
    if (!data || typeof data !== "object") return false;
    const backup = data as Record<string, unknown>;
    return (
      Array.isArray(backup.tasks) &&
      Array.isArray(backup.projects) &&
      Array.isArray(backup.dailyLists) &&
      Array.isArray(backup.dailyListProjections)
    );
  };

  return (
    <ColumnListProvider
      focusKey={buildFocusKey("sidebar", "sidebar", "Sidebar")}
      priority="0"
    >
      <div className="w-64 bg-gray-900 h-full flex flex-col">
        {/* Default categories */}
        <div className="px-3 py-1 flex-shrink-0">
          <InboxItem inboxProject={inboxProject} />
          <TodayItem />
        </div>

        {/* Projects section */}
        <div className="mt-3 px-3 flex-1 min-h-0 overflow-hidden">
          <div className="flex justify-between items-center mb-1 px-2">
            <span className="text-gray-400 text-xs">My projects</span>
            <div className="flex">
              <button
                className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-white cursor-pointer"
                onClick={createProject}
                title="Create new project"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Projects list - scrollable */}
          <div className="overflow-y-auto h-full  pb-[100px]">
            {projects.map((proj) => (
              <ProjectItem key={proj.id} project={proj} />
            ))}
          </div>
        </div>

        {/* Backup and Settings section */}
        <div className="px-3 py-3 border-t border-gray-800 flex-shrink-0">
          <div className="flex flex-col gap-2">
            <button
              onClick={handleDownloadBackup}
              className="w-full text-gray-400 flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-800"
              title="Download backup of your tasks and projects"
            >
              <span className="text-sm">Download Backup</span>
            </button>
            <button
              onClick={handleLoadBackup}
              className="w-full text-gray-400 flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-800"
              title="Load a previously downloaded backup"
            >
              <span className="text-sm">Load Backup</span>
            </button>
            <button
              className="w-full text-gray-400 flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-800"
              title="Open settings"
            >
              <span className="text-sm">Settings</span>
            </button>
          </div>
        </div>
      </div>
    </ColumnListProvider>
  );
});
