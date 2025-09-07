import { getBackups, loadBackups } from "@/store/backup";
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
import { useAppSelector, useAppStore } from "@/hooks/stateHooks.ts";
import {
  buildFocusKey,
  focusManager,
  focusSlice,
} from "@/store/slices/focusSlice.ts";
import { Link } from "@tanstack/react-router";
import {
  execSync,
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
import { useSelector } from "@will-be-done/hyperstate";
import { Backup } from "@will-be-done/slices";

type State =
  | { type: "idle" }
  | { type: "preview"; container: HTMLElement; rect: DOMRect }
  | { type: "dragging" };

const idleState: State = { type: "idle" };
const draggingState: State = { type: "dragging" };

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

const DropProjectIndicator = function DropProjectIndicatorComp() {
  // p-3 rounded-lg border border-blue-500 bg-gray-700 shadow-md transition-colors h-12
  return <div className={`rounded-lg border-blue-500 bg-gray-700 h-10`}></div>;
};

const ProjectItem = function ProjectItemComp({
  projectId,
  orderNumber,
}: {
  projectId: string;
  orderNumber: string;
}) {
  console.log("orderNumber", projectId, orderNumber);

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
  const store = useAppStore();

  const ref = useRef<HTMLAnchorElement>(null);

  const isFocused = useAppSelector((state) =>
    focusSlice.isFocused(state, focusItem.key),
  );

  useGlobalListener("mousedown", (e: MouseEvent) => {
    const isFocusDisabled = focusSlice.isFocusDisabled(store.getState());

    if (
      isFocused &&
      ref.current &&
      !ref.current.contains(e.target as Node) &&
      !isFocusDisabled &&
      !e.defaultPrevented
    ) {
      focusSlice.resetFocus(store);
    }
  });

  const dispatch = useDispatch();

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (!isFocused) return;
    const isFocusDisabled = focusSlice.isFocusDisabled(store.getState());

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
      dispatch(projectsSlice2.delete(project.id));

      if (down) {
        focusSlice.focusByKey(store, down.key);
      } else if (up) {
        focusSlice.focusByKey(store, up.key);
      } else {
        focusSlice.resetFocus(store);
      }
    } else if (e.code === "KeyI" && noModifiers) {
      e.preventDefault();

      focusSlice.editByKey(store, focusItem.key);
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

  const select = useSelect();
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

          return select(projectsSlice2.canDrop(project.id, data.modelId));
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
  }, [project.id, project.type, select, store]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();
      focusSlice.resetEdit(store);
    }
  };

  const isEditing = useAppSelector((state) =>
    focusSlice.isEditing(state, focusItem.key),
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
      <Link
        to="/projects/$projectId"
        params={{ projectId: project.id }}
        data-focusable-key={focusItem.key}
        ref={ref}
        key={project.id}
        className={cn(
          "flex items-center px-2 py-1.5 rounded-lg cursor-pointer [&.active]:bg-gray-800",
          isFocused ? "bg-gray-800" : "hover:bg-gray-800",
          closestEdge == "whole" && "bg-gray-700",
          {
            hidden: isEditing,
          },
        )}
        href={`/projects/${project.id}`}
        onClick={() => {
          console.log("focusItem click", focusItem);
          focusSlice.focusByKey(store, focusItem.key, true);
        }}
      >
        <span className="text-base mr-2 flex-shrink-0">
          {project.icon || "🟡"}
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

const InboxItem = function IboxItemComp() {
  const inboxProject = useSyncSelector(() => allProjectsSlice2.inbox(), []);
  const childrenCount = useSyncSelector(
    function* () {
      return (yield* projectItemsSlice2.childrenIds(inboxProject.id)).length;
    },
    [inboxProject.id],
  );
  const focusItem = useRegisterFocusItem(
    buildFocusKey(inboxProject.id, inboxProject.type),
    "*******",
  );
  const isFocused = useAppSelector((state) =>
    focusSlice.isFocused(state, focusItem.key),
  );
  const store = useAppStore();

  const [closestEdge, setClosestEdge] = useState<"whole" | null>(null);
  const ref = useRef<HTMLAnchorElement>(null);
  const select = useSelect();

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

          return select(projectsSlice2.canDrop(inboxProject.id, data.modelId));
        },

        getData: ({ input, element }) => {
          const data: DndModelData = {
            modelId: inboxProject.id,
            modelType: inboxProject.type,
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
  }, [inboxProject.id, inboxProject.type, select, store]);

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: "inbox" }}
      ref={ref}
      data-focusable-key={focusItem.key}
      href="/projects/inbox"
      className={cn(
        "flex items-center px-2 py-2 rounded-lg hover:bg-gray-800 cursor-pointer [&.active]:bg-gray-800",
        isFocused ? "bg-gray-800" : "hover:bg-gray-800",
        closestEdge == "whole" && "bg-gray-700",
      )}
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
        {childrenCount ?? 0}
      </span>
    </Link>
  );
};

// const TodayItem = function TodayItemComp() {
//   const id = "today";
//   const focusItem = useRegisterFocusItem(buildFocusKey(id, id), "******1");
//   const isFocused = useAppSelector((state) =>
//     focusSlice.isFocused(state, focusItem.key),
//   );
//
//   return (
//     <Link
//       data-focusable-key={focusItem.key}
//       href="/today"
//       className={(active) =>
//         `flex items-center px-2 py-2 rounded-lg hover:bg-gray-800 cursor-pointer ${
//           active || isFocused ? "bg-gray-800" : "hover:bg-gray-800"
//         }`
//       }
//     >
//       <span className="text-amber-500 mr-2 flex-shrink-0">
//         <svg
//           xmlns="http://www.w3.org/2000/svg"
//           width="18"
//           height="18"
//           viewBox="0 0 24 24"
//           fill="none"
//           stroke="currentColor"
//           strokeWidth="2"
//           strokeLinecap="round"
//           strokeLinejoin="round"
//         >
//           <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
//         </svg>
//       </span>
//       <span className="text-white text-sm">Today</span>
//     </Link>
//   );
// };

export const ProjectsSidebarContent = () => {
  const projectIdsWithoutInbox = useSyncSelector(
    () => allProjectsSlice2.childrenIdsWithoutInbox(),
    [],
  );
  const store = useAppStore();

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

  const dispatch = useDispatch();
  const createProject = () => {
    dispatch(projectsSlice2.create({}, "prepend"));
  };

  const handleDownloadBackup = () => {
    const backup = getBackups(store.getState());
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

          dispatch(appSlice2.loadBackup(parsedBackup));
          // TODO: clean db
          // rootStore.dailyListRegistry.dropDuplicatedDailyLists();
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
  return (
    <>
      <div className="bg-gray-900 h-full flex flex-col">
        <div className="px-2 py-1 flex-shrink-0">
          <InboxItem />
          {/* <TodayItem /> */}
        </div>

        <div className="mt-3 px-2 flex-1 min-h-0 overflow-hidden">
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

          <div className="overflow-y-auto h-full  pb-[40px]">
            {projectIdsWithoutInbox.map((id, i) => (
              <ProjectItem key={id} projectId={id} orderNumber={i.toString()} />
            ))}
          </div>
        </div>

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
    </>
  );
};
