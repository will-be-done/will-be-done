import { CSSProperties, useEffect, useRef, useState } from "react";
import { useSyncSelector, useDB, select } from "@will-be-done/hyperdb";
import { projectsSlice } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { Link, useRouterState } from "@tanstack/react-router";
import { useCurrentDate } from "../DaysBoard/hooks.tsx";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import invariant from "tiny-invariant";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models.ts";
import ReactDOM from "react-dom";
import { useSidebar } from "@/components/ui/sidebar.tsx";

type DndState =
  | { type: "idle" }
  | { type: "preview"; container: HTMLElement; rect: DOMRect }
  | { type: "dragging" };

const idleState: DndState = { type: "idle" };
const draggingState: DndState = { type: "dragging" };

const DropIndicator = ({ direction }: { direction: "top" | "bottom" }) => (
  <div
    className={cn(
      "absolute left-0 right-0 w-full bg-accent h-[2px] rounded-full",
      direction === "top" && "top-[-5px]",
      direction === "bottom" && "bottom-[-5px]",
    )}
  />
);

const DragPreview = ({
  title,
  icon,
  style,
}: {
  icon: string;
  title: string;
  style: CSSProperties;
}) => (
  <div
    className="flex items-center px-2 py-1.5 rounded-lg bg-panel ring-1 ring-ring"
    style={style}
  >
    <span className="text-base mr-2 flex-shrink-0">{icon}</span>
    <span className="text-content text-sm whitespace-nowrap overflow-hidden text-ellipsis">
      {title}
    </span>
  </div>
);

export const SidebarProjectItem = ({ projectId }: { projectId: string }) => {
  const spaceId = Route.useParams().spaceId;
  const db = useDB();
  const { isMobile, setOpenMobile } = useSidebar();

  const project = useSyncSelector(
    () => projectsSlice.byIdOrDefault(projectId),
    [projectId],
  );

  const currentDate = useCurrentDate();

  const notDoneCount = useSyncSelector(
    () => projectsSlice.notDoneTasksCountExceptDailiesCount(projectId, []),
    [projectId],
  );

  const overdueCount = useSyncSelector(
    () =>
      projectsSlice.overdueTasksCountExceptDailiesCount(
        projectId,
        [],
        currentDate,
      ),
    [projectId, currentDate],
  );

  const isActive = useRouterState({
    select: (s) =>
      s.matches.some(
        (m) =>
          (m.params as Record<string, string>).projectId === projectId,
      ),
  });

  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [dndState, setDndState] = useState<DndState>(idleState);
  const [isOver, setIsOver] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    invariant(element);

    return combine(
      draggable({
        element,
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
              return () => setDndState(draggingState);
            },
          });
        },
        onDragStart: () => setDndState(draggingState),
        onDrop: () => setDndState(idleState),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => {
          const data = source.data;
          if (!isModelDNDData(data)) return false;
          return select(
            db,
            projectsSlice.canDrop(project.id, data.modelId, data.modelType),
          );
        },
        getIsSticky: () => true,
        getData: ({ input, element: el }) => {
          const data: DndModelData = {
            modelId: project.id,
            modelType: project.type,
          };
          return attachClosestEdge(data, {
            input,
            element: el,
            allowedEdges: ["top", "bottom"],
          });
        },
        onDragEnter: (args) => {
          const data = args.source.data;
          if (!isModelDNDData(data)) return;
          if (data.modelId !== project.id && data.modelType === project.type) {
            setClosestEdge(extractClosestEdge(args.self.data));
          } else if (data.modelType !== project.type) {
            setIsOver(true);
          }
        },
        onDrag: (args) => {
          const data = args.source.data;
          if (!isModelDNDData(data)) return;
          if (data.modelId !== project.id && data.modelType === project.type) {
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDragLeave: () => {
          setClosestEdge(null);
          setIsOver(false);
        },
        onDrop: () => {
          setClosestEdge(null);
          setIsOver(false);
        },
      }),
    );
  }, [db, project.id, project.type]);

  return (
    <div ref={ref} className="relative">
      {closestEdge === "top" && <DropIndicator direction="top" />}
      <Link
        ref={(el) => {
          if (el) el.draggable = false;
        }}
        to="/spaces/$spaceId/projects/$projectId"
        params={{ spaceId, projectId }}
        onClick={isMobile ? () => setOpenMobile(false) : undefined}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors w-full min-h-[40px]",
          isActive
            ? "text-accent bg-accent/10"
            : "text-content-tinted hover:text-content hover:bg-surface-elevated",
          isOver && "ring-2 ring-accent bg-accent/10",
        )}
      >
        <span className="text-base flex-shrink-0">{project.icon || "🟡"}</span>
        <span className="flex-1 truncate">{project.title}</span>
        {(notDoneCount > 0 || overdueCount > 0) && (
          <span className="flex items-center gap-1 text-xs tabular-nums text-content-tinted">
            {overdueCount > 0 && (
              <>
                <span className="text-notice">{overdueCount}</span>
                <span className="text-content-tinted/50">|</span>
              </>
            )}
            <span>{notDoneCount}</span>
          </span>
        )}
      </Link>
      {closestEdge === "bottom" && <DropIndicator direction="bottom" />}
      {dndState.type === "preview" &&
        ReactDOM.createPortal(
          <DragPreview
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
