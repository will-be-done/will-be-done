import { CSSProperties, useEffect, useRef, useState } from "react";
import { type Project } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { Link, useRouterState } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
  type ElementDropTargetEventBasePayload,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import invariant from "tiny-invariant";
import {
  type DndModelData,
  canDropModelData,
  isActiveDropTarget,
} from "@/lib/dnd/models";
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

export const SidebarProjectItem = ({
  project,
  notDoneCount,
  overdueCount,
}: {
  project: Project;
  notDoneCount: number;
  overdueCount: number;
}) => {
  const spaceId = Route.useParams().spaceId;
  const { isMobile, setOpenMobile } = useSidebar();
  const projectId = project.id;

  const isActive = useRouterState({
    select: (s) =>
      s.matches.some(
        (m) => (m.params as Record<string, string>).projectId === projectId,
      ),
  });

  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [dndState, setDndState] = useState<DndState>(idleState);
  const [isOver, setIsOver] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!project) return;
    const element = ref.current;
    invariant(element);

    const updateDropIndicator = (args: ElementDropTargetEventBasePayload) => {
      const active = isActiveDropTarget(args);
      const reordering = args.source.data.modelType === project.type;
      setClosestEdge(
        active && reordering ? extractClosestEdge(args.self.data) : null,
      );
      setIsOver(active && !reordering);
    };

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
        canDrop: ({ source }) =>
          canDropModelData(source.data, {
            modelId: project.id,
            modelType: project.type,
          }),
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
        onDragEnter: updateDropIndicator,
        onDrag: updateDropIndicator,
        onDropTargetChange: updateDropIndicator,
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
  }, [project]);

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
