import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  deleteProjects,
  type Project,
  updateProject,
} from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { MoreHorizontal, Smile } from "lucide-react";
import { PencilIcon, TrashIcon } from "@/components/ui/icons.tsx";
import { promptDialog } from "@/components/ui/prompt-dialog-service";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker.tsx";
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

const SidebarProjectMenu = ({
  project,
  isActive,
}: {
  project: Project;
  isActive: boolean;
}) => {
  const dispatch = useAsyncDispatch();
  const navigate = useNavigate();
  const spaceId = Route.useParams().spaceId;
  const [open, setOpen] = useState(false);

  const handleRename = async () => {
    const newTitle = await promptDialog(
      "Enter new project title",
      project.title,
    );
    if (newTitle == "" || newTitle == null) return;
    await dispatch(
      updateProject({ id: project.id, project: { title: newTitle } }),
    );
  };

  const handleDelete = () => {
    const shouldDelete = confirm(
      "Are you sure you want to delete this project?",
    );
    if (!shouldDelete) return;

    void (async () => {
      await dispatch(deleteProjects({ ids: [project.id] }));
      if (isActive) {
        await navigate({
          to: "/spaces/$spaceId/projects/$projectId",
          params: { spaceId, projectId: "inbox" },
        });
      }
    })();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Project actions"
          className="flex size-7 flex-shrink-0 items-center justify-center rounded-md mr-0.5 text-content-tinted/50 hover:text-content hover:bg-overlay cursor-pointer data-[state=open]:text-content data-[state=open]:bg-overlay"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="right"
        className="min-w-52"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => void handleRename()}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2 cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0">
              <Smile />
              Change icon
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-0 overflow-visible p-0">
              <EmojiPicker
                className="h-[326px] rounded-lg"
                onKeyDown={(e) => e.stopPropagation()}
                onEmojiSelect={({ emoji }) => {
                  void dispatch(
                    updateProject({
                      id: project.id,
                      project: { icon: emoji },
                    }),
                  );
                  setOpen(false);
                }}
              >
                <EmojiPickerSearch />
                <EmojiPickerContent />
              </EmojiPicker>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
          <TrashIcon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

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
          return true;
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
  }, [project]);

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex items-center rounded-lg transition-colors",
        isActive
          ? "text-accent bg-panel"
          : "text-content-tinted hover:text-content hover:bg-surface-elevated",
        isOver && "ring-2 ring-accent bg-accent/10",
      )}
    >
      {closestEdge === "top" && <DropIndicator direction="top" />}
      <Link
        ref={(el) => {
          if (el) el.draggable = false;
        }}
        to="/spaces/$spaceId/projects/$projectId"
        params={{ spaceId, projectId }}
        onClick={isMobile ? () => setOpenMobile(false) : undefined}
        className="flex items-center gap-2 px-3 py-2 text-sm w-full min-h-[40px] min-w-0 flex-1"
      >
        <span className="text-base flex-shrink-0">{project.icon || "🟡"}</span>
        <span className="flex-1 truncate">{project.title}</span>
        {(notDoneCount > 0 || overdueCount > 0) && (
          <span
            className={cn(
              "flex items-center gap-1 text-xs tabular-nums",
              isActive ? "text-accent" : "text-content-tinted",
            )}
          >
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
      <SidebarProjectMenu project={project} isActive={isActive} />
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
