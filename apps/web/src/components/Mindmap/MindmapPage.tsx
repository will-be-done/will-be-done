import { useCallback, useEffect, useMemo } from "react";
import { startOfDay } from "date-fns";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  deleteMindmap,
  inboxProjectId,
  mindmapDisplayTitle,
  newMindmapRootNode,
  updateMindmap,
  mindmapsWithTitles,
  mindmapTree,
} from "@will-be-done/slices/space";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { NavBar } from "@/components/NavBar/NavBar";
import { SyncIndicator } from "@/components/Sidebar/SyncIndicator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ItemDetails } from "@/components/ItemDetails/ItemDetails.tsx";
import { WithStash } from "@/components/Stash/WithStash.tsx";
import { promptDialog } from "@/components/ui/prompt-dialog-service";
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
import { useUndoToast } from "@/store/undo";
import {
  mindmapTitle,
  useCreateMindmap,
  useCreatingMindmaps,
} from "./useCreateMindmap.ts";
import { useRecentMindmaps } from "./recentMindmaps.ts";

export const MindmapPage = ({
  mindmapId,
  projectId,
  focusItemId,
}: {
  mindmapId: string;
  projectId: string;
  focusItemId: string | undefined;
}) => {
  const { spaceId } = Route.useParams();
  const dispatch = useAsyncDispatch();
  const deleteWithUndo = useUndoToast();
  const navigate = useNavigate();
  const { createAndOpen, preload } = useCreateMindmap();
  const markOpened = useRecentMindmaps((s) => s.markOpened);
  useEffect(() => {
    markOpened(spaceId, mindmapId);
  }, [markOpened, spaceId, mindmapId]);
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
  const tree =
    storedTree ??
    (creating && {
      mindmap: creating,
      root: newMindmapRootNode(creating),
      branches: [],
      floating: [],
    });
  const { data: mindmaps = [] } = useAsyncSelector({
    selector: mindmapsWithTitles,
    args: {},
  });

  const selectedProjectId = projectId === "inbox" ? inboxId : projectId;

  // Dropping the focused item from the URL lets the same link focus it again.
  const clearFocusItem = useCallback(() => {
    void navigate({
      to: "/spaces/$spaceId/mindmaps/$mindmapId",
      params: { spaceId, mindmapId },
      search: { projectId },
      replace: true,
    });
  }, [navigate, spaceId, mindmapId, projectId]);

  const handleRename = async () => {
    if (!tree) return;
    const title = await promptDialog(
      "Mindmap name",
      mindmapDisplayTitle(tree.mindmap, tree.root),
    );
    if (!title?.trim()) return;
    await dispatch(
      updateMindmap({ id: mindmapId, mindmap: { title: title.trim() } }),
    );
  };

  const handleDelete = () => {
    void (async () => {
      await navigate({ to: "/spaces/$spaceId/mindmaps", params: { spaceId } });
      await deleteWithUndo(() => dispatch(deleteMindmap({ id: mindmapId })));
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
        selectedProjectId={selectedProjectId}
        selectedDate={today}
      >
        {/* The name moves to its own line rather than shrinking, so a phone
            shows it whole. */}
        <header className="flex min-h-14 shrink-0 flex-wrap items-start gap-x-2 pr-4 pb-2">
          <div className="[app-region:no-drag]">
            <NavBar spaceId={spaceId} />
          </div>
          <div className="mt-2 flex h-8 min-w-fit flex-1 items-center gap-4 pl-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex min-w-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-lg font-semibold text-content outline-none hover:bg-white/5 [app-region:no-drag]">
                <span className="truncate">
                  {tree
                    ? mindmapTitle(mindmapDisplayTitle(tree.mindmap, tree.root))
                    : "Mindmaps"}
                </span>
                <ChevronDown className="size-4 shrink-0 text-content-tinted" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                {mindmaps.map(({ mindmap, title }) => (
                  <DropdownMenuItem key={mindmap.id} asChild>
                    <Link
                      to="/spaces/$spaceId/mindmaps/$mindmapId"
                      params={{ spaceId, mindmapId: mindmap.id }}
                      search={{ projectId }}
                      className={
                        mindmap.id === mindmapId ? "font-medium" : undefined
                      }
                    >
                      <span className="truncate">{mindmapTitle(title)}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => void createAndOpen()}
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
            {tree && (
              <button
                type="button"
                title="Rename mindmap"
                aria-label="Rename mindmap"
                onClick={() => void handleRename()}
                className="-ml-3 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-content-tinted transition-colors hover:bg-white/5 hover:text-content [app-region:no-drag]"
              >
                <Pencil className="size-3.5" />
              </button>
            )}

            <div className="ml-auto flex items-center gap-3 [app-region:no-drag]">
              <TooltipProvider>
                <SyncIndicator />
              </TooltipProvider>
            </div>
          </div>
        </header>

        <WithStash>
          {tree ? (
            <MindmapCanvas
              key={mindmapId}
              tree={tree}
              projectId={selectedProjectId || undefined}
              focusItemId={focusItemId}
              onItemFocused={clearFocusItem}
            />
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
        </WithStash>
      </ProjectsSplit>

      {/* Phones open details full screen instead. */}
      <div className="hidden h-full sm:block">
        <ItemDetails />
      </div>
    </div>
  );
};
