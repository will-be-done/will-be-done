import { useCallback, useMemo } from "react";
import { startOfDay } from "date-fns";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  deleteMindmap,
  inboxProjectId,
  mindmapsOrdered,
  mindmapTree,
} from "@will-be-done/slices/space";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { NavBar } from "@/components/NavBar/NavBar";
import { SyncIndicator } from "@/components/Sidebar/SyncIndicator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ItemDetails } from "@/components/ItemDetails/ItemDetails.tsx";
import { ProjectsSplit } from "@/components/ProjectView/ProjectsSplit.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { MindmapCanvas } from "./MindmapCanvas.tsx";
import {
  mindmapTitle,
  useCreateMindmap,
  useCreatingMindmaps,
} from "./useCreateMindmap.ts";

export const MindmapPage = ({
  mindmapId,
  projectId,
}: {
  mindmapId: string;
  projectId: string;
}) => {
  const { spaceId } = Route.useParams();
  const dispatch = useAsyncDispatch();
  const navigate = useNavigate();
  const { createAndOpen, preload } = useCreateMindmap();
  const today = useMemo(() => startOfDay(new Date()), []);
  const { data: inboxId = "" } = useAsyncSelector({
    selector: inboxProjectId,
    args: {},
  });
  const { data: storedTree, isFetching } = useAsyncSelector({
    selector: mindmapTree,
    args: { mindmapId },
  });
  const creating = useCreatingMindmaps((s) => s.mindmaps.get(mindmapId));
  const tree = storedTree ?? (creating && { mindmap: creating, branches: [] });
  const { data: mindmaps = [] } = useAsyncSelector({
    selector: mindmapsOrdered,
    args: {},
  });

  const handleDelete = () => {
    if (
      !confirm(
        "Delete this mindmap? Its topics are removed; tasks stay in their projects.",
      )
    ) {
      return;
    }
    void (async () => {
      await navigate({ to: "/spaces/$spaceId/mindmaps", params: { spaceId } });
      await dispatch(deleteMindmap({ id: mindmapId }));
    })();
  };

  const ProjectLink = useCallback(
    // eslint-disable-next-line react-x/no-nested-component-definitions
    ({
      children,
      projectId: linkProjectId,
      className,
      ref,
    }: {
      children?: React.ReactNode;
      projectId: string;
      className?: string;
      ref?: React.Ref<HTMLAnchorElement>;
    }) => (
      <Link
        to="/spaces/$spaceId/mindmaps/$mindmapId"
        params={{ spaceId, mindmapId }}
        search={{ projectId: linkProjectId }}
        className={className}
        ref={ref}
      >
        {children}
      </Link>
    ),
    [spaceId, mindmapId],
  );

  return (
    <div className="flex h-full w-full">
      <ProjectsSplit
        topClassName="flex min-h-0 flex-col"
        projectLink={ProjectLink}
        selectedProjectId={projectId === "inbox" ? inboxId : projectId}
        selectedDate={today}
      >
        <header className="flex h-14 shrink-0 items-start gap-4 pr-4">
          <div className="[app-region:no-drag]">
            <NavBar spaceId={spaceId} />
          </div>
          <div className="mt-2 flex h-8 min-w-0 flex-1 items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex min-w-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-lg font-semibold text-content outline-none hover:bg-white/5 [app-region:no-drag]">
                <span className="truncate">
                  {tree ? mindmapTitle(tree.mindmap.title) : "Mindmaps"}
                </span>
                <ChevronDown className="size-4 shrink-0 text-content-tinted" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                {mindmaps.map((mindmap) => (
                  <DropdownMenuItem key={mindmap.id} asChild>
                    <Link
                      to="/spaces/$spaceId/mindmaps/$mindmapId"
                      params={{ spaceId, mindmapId: mindmap.id }}
                      search={{ projectId }}
                      className={
                        mindmap.id === mindmapId ? "font-medium" : undefined
                      }
                    >
                      <span className="truncate">
                        {mindmapTitle(mindmap.title)}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={createAndOpen}
                  onPointerEnter={preload}
                  onFocus={preload}
                >
                  <Plus />
                  New mindmap
                </DropdownMenuItem>
                {tree && (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={handleDelete}
                  >
                    <Trash2 />
                    Delete mindmap
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="ml-auto flex items-center gap-3 [app-region:no-drag]">
              <TooltipProvider>
                <SyncIndicator />
              </TooltipProvider>
            </div>
          </div>
        </header>

        {tree ? (
          <MindmapCanvas key={mindmapId} tree={tree} />
        ) : (
          !isFetching && (
            <p className="py-12 text-center text-[13px] text-content-tinted/60">
              This mindmap was deleted.{" "}
              <Link
                to="/spaces/$spaceId/mindmaps"
                params={{ spaceId }}
                className="text-accent hover:underline"
              >
                See all mindmaps
              </Link>
            </p>
          )
        )}
      </ProjectsSplit>

      <ItemDetails />
    </div>
  );
};
