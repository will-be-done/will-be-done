import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import {
  isTask,
  type MindmapTree,
  moveListItemsToProject,
  moveNoteToProject,
  moveTaskToProject,
} from "@will-be-done/slices/space";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel.tsx";
import { type Size, layoutMindmapRoots } from "./mindmapLayout.ts";
import {
  branchColor,
  ghostSourceId,
  indexMindmapTree,
  isGhostId,
  layoutRootsOf,
  noIds,
  subtreeIds,
  useMindmapDrop,
  useMindmapSelection,
  withDropGhostsOnRoots,
} from "./mindmapModel.ts";
import { MindmapGhostCard } from "./MindmapGhostCard.tsx";
import { MindmapMobileToolbar } from "./MindmapMobileToolbar.tsx";
import { MindmapNodeCard } from "./MindmapNodeCard.tsx";
import { MindmapZoomControls } from "./MindmapZoomControls.tsx";
import { createNodeSizeStore } from "./nodeSizes.ts";
import { handleMindmapKeyDown } from "./mindmapKeys.ts";
import { useCanvasGestures } from "./useCanvasGestures.ts";
import { type LatestMindmap, useMindmapActions } from "./useMindmapActions.ts";
import { useMindmapClipboard } from "./useMindmapClipboard.ts";
import { useMindmapDropTarget } from "./useMindmapDropTarget.ts";
import { useMindmapFocus } from "./useMindmapFocus.ts";
import { useMindmapView } from "./useMindmapView.ts";

const estimatedSize: Size = { width: 120, height: 32 };

export function MindmapCanvas({
  tree,
  projectId,
  focusItemId,
  onItemFocused,
}: {
  tree: MindmapTree;
  // Where new tasks and notes go: the project shown under the map.
  projectId: string | undefined;
  focusItemId: string | undefined;
  onItemFocused: () => void;
}) {
  const dispatch = useAsyncDispatch();
  const mindmapId = tree.mindmap.id;
  const viewportRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const [sizeStore] = useState(createNodeSizeStore);
  const sizes = useSyncExternalStore(
    sizeStore.subscribe,
    sizeStore.getSnapshot,
  );

  const preview = useMindmapDrop((s) => s.preview);

  const index = useMemo(() => indexMindmapTree(tree), [tree]);
  const sizeOf = useCallback(
    (id: string) =>
      sizes.get(id) ??
      (isGhostId(id) ? sizes.get(ghostSourceId(id)) : undefined) ??
      estimatedSize,
    [sizes],
  );
  const roots = useMemo(() => layoutRootsOf(tree), [tree]);
  // Drops are picked on the map without their own preview.
  const baseLayout = useMemo(
    () => layoutMindmapRoots(roots, sizeOf),
    [roots, sizeOf],
  );
  const layout = useMemo(
    () =>
      preview
        ? layoutMindmapRoots(
            withDropGhostsOnRoots(roots, mindmapId, preview),
            sizeOf,
          )
        : baseLayout,
    [baseLayout, mindmapId, preview, roots, sizeOf],
  );
  const movingIds = useMemo(() => {
    if (preview?.dragged.kind !== "nodes") return noIds;
    const ids = new Set<string>();
    for (const id of preview.dragged.ids) {
      const entry = index.nodes.get(id);
      if (entry?.kind === "node") subtreeIds(entry.tree, ids);
    }
    return ids;
  }, [index, preview]);
  // Handlers registered once read the current tree through this ref.
  const latestRef = useRef<LatestMindmap>({ index, baseLayout, tree });
  useLayoutEffect(() => {
    latestRef.current = { index, baseLayout, tree };
  });

  const {
    worldRef,
    viewRef,
    zoomPercent,
    applyView,
    zoomFromCenter,
    fit,
    reveal,
    center,
  } = useMindmapView(mindmapId, viewportRef);
  const { focusNode, editNode } = useMindmapFocus({
    viewportRef,
    index,
    sizes,
    focusItemId,
    onItemFocused,
    center,
    reveal,
  });
  const { actions, moving, setMoving } = useMindmapActions({
    mindmapId,
    projectId,
    latestRef,
    register: sizeStore.register,
    focusNode,
    editNode,
  });
  useMindmapDropTarget({
    mindmapId,
    viewportRef,
    viewRef,
    latestRef,
    focusNode,
  });
  const gestures = useCanvasGestures({
    mindmapId,
    viewportRef,
    marqueeRef,
    viewRef,
    applyView,
    layout,
    index,
    editNode,
  });
  const clipboard = useMindmapClipboard({ mindmapId, index, focusNode });

  useEffect(() => sizeStore.disconnect, [sizeStore]);

  useEffect(
    () => () => {
      useMindmapSelection.getState().clear();
      useMindmapDrop.getState().setPreview(null);
    },
    [],
  );

  const movingEntry = moving ? index.nodes.get(moving.nodeId) : undefined;
  const movingItem =
    movingEntry?.kind === "node"
      ? (movingEntry.tree.task ?? movingEntry.tree.note)
      : undefined;

  return (
    <div
      ref={viewportRef}
      data-testid="mindmap-canvas"
      tabIndex={-1}
      className="relative min-h-0 flex-1 touch-none overflow-hidden outline-none"
      {...gestures}
      {...clipboard}
      onKeyDown={(e) =>
        handleMindmapKeyDown(e, { index, layout, actions, focusNode })
      }
      // Middle-button autoscroll would fight panning.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      // Focusing a node can scroll this clipped box; panning owns position.
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
    >
      <div ref={worldRef} className="absolute left-0 top-0 origin-top-left">
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width={1}
          height={1}
        >
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.path}
              fill="none"
              stroke={branchColor(edge.branch)}
              strokeOpacity={movingIds.has(edge.id) ? 0.25 : 0.75}
              strokeDasharray={isGhostId(edge.id) ? "4 4" : undefined}
              strokeWidth={edge.depth === 1 ? 3 : edge.depth === 2 ? 2 : 1.5}
              strokeLinecap="round"
            />
          ))}
        </svg>
        {[...layout.nodes.values()].map((laidOut) => {
          if (isGhostId(laidOut.id)) {
            const sourceEntry = index.nodes.get(ghostSourceId(laidOut.id));
            const source = sourceEntry
              ? ({ kind: "node", entry: sourceEntry } as const)
              : preview?.dragged.kind === "item"
                ? ({ kind: "item", item: preview.dragged.item } as const)
                : undefined;
            return (
              source && (
                <MindmapGhostCard
                  key={laidOut.id}
                  layout={laidOut}
                  source={source}
                  register={sizeStore.register}
                />
              )
            );
          }
          const entry = index.nodes.get(laidOut.id);
          return (
            entry && (
              <MindmapNodeCard
                key={laidOut.id}
                mindmapId={mindmapId}
                entry={entry}
                layout={laidOut}
                actions={actions}
                isMoving={movingIds.has(laidOut.id)}
                startEditing={
                  entry.kind === "root" &&
                  tree.branches.length === 0 &&
                  !tree.root.title.trim()
                }
              />
            )
          );
        })}
      </div>

      {movingEntry?.kind === "node" && (movingItem || moving?.items) && (
        <MoveModal
          keepsFocus
          exceptProjectId={
            moving?.items ? undefined : (movingEntry.tree.project?.id ?? "")
          }
          setIsOpen={(open) => {
            if (open) return;
            setMoving(null);
            focusNode(movingEntry.focusKey, true);
          }}
          handleMove={(projectId) => {
            if (moving?.items) {
              void dispatch(
                moveListItemsToProject({ listItems: moving.items, projectId }),
              );
            } else if (movingItem) {
              void dispatch(
                isTask(movingItem)
                  ? moveTaskToProject({ taskId: movingItem.id, projectId })
                  : moveNoteToProject({ noteId: movingItem.id, projectId }),
              );
            }
          }}
        />
      )}

      <MindmapMobileToolbar index={index} actions={actions} />

      <div
        ref={marqueeRef}
        className="pointer-events-none absolute left-0 top-0 hidden rounded-sm border border-accent/70 bg-accent/10"
      />

      {tree.branches.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-[12px] text-content-tinted/60">
          Select the central topic and press Tab to add a topic, drag tasks and
          notes here from the projects below, or double-click anywhere for a
          floating topic.
        </p>
      )}

      <MindmapZoomControls
        zoomPercent={zoomPercent}
        onZoom={zoomFromCenter}
        onReset={() => zoomFromCenter(1 / viewRef.current.zoom)}
        onFit={() => fit(layout)}
      />
    </div>
  );
}
