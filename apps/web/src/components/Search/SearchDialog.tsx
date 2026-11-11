import { useDeferredValue, useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Command } from "cmdk";
import {
  Circle,
  CircleCheck,
  CornerDownLeft,
  Network,
  Search,
  StickyNote,
} from "lucide-react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { richTextMarkdownToPlainText } from "@will-be-done/slices/common";
import {
  mindmapsWithTitlesByIds,
  projectsOfProjectSections,
  searchHighlights,
  searchSpace,
  type Project,
  type SearchHit,
} from "@will-be-done/slices/space";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectIcon } from "@/components/ui/emoji";
import { mindmapTitle } from "@/components/Mindmap/useCreateMindmap";
import { useFocusStore } from "@/store/focusSlice";
import { useOpenItemPage } from "@/components/ItemPage/useOpenItemPage";
import { isEditingText } from "@/utils/isEditingText";
import { closeSearch, openSearch, useSearchOpen } from "./searchStore";

const resultLimit = 50;

export function SearchDialog() {
  const isOpen = useSearchOpen((s) => s.isOpen);
  const { spaceId } = useParams({ strict: false });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // By the physical key too: in layouts like Russian it types ".".
      const isSlash =
        event.key === "/" || (event.code === "Slash" && !event.shiftKey);
      if (
        !isSlash ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        event.defaultPrevented ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      if (isEditingText(event.target)) return;

      event.preventDefault();
      openSearch();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return (
    <Dialog
      open={isOpen && spaceId !== undefined}
      onOpenChange={(open) => {
        if (!open) closeSearch();
      }}
    >
      {isOpen && spaceId && <SearchPalette spaceId={spaceId} />}
    </Dialog>
  );
}

const plainTitle = (title: string) =>
  richTextMarkdownToPlainText(title, "title").trim();

const hitId = (hit: SearchHit) =>
  hit.type === "task"
    ? hit.task.id
    : hit.type === "note"
      ? hit.note.id
      : hit.node.id;

function SearchPalette({ spaceId }: { spaceId: string }) {
  const navigate = useNavigate();
  const openItemPage = useOpenItemPage();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const { data: hits = [], isPlaceholderData } = useAsyncSelector({
    selector: searchSpace,
    args: { query: deferredQuery, limit: resultLimit },
    placeholderData: (previous) => previous ?? [],
  });
  const mindmapIds = [
    ...new Set(
      hits.flatMap((hit) =>
        hit.type === "mindmapNode" ? [hit.node.mindmapId] : [],
      ),
    ),
  ];
  const { data: mindmaps = [] } = useAsyncSelector({
    selector: mindmapsWithTitlesByIds,
    args: { ids: mindmapIds },
    placeholderData: (previous) => previous ?? [],
  });
  const mindmapTitles = new Map(
    mindmaps.map(({ mindmap, title }) => [mindmap.id, mindmapTitle(title)]),
  );
  const projectSectionIds = [
    ...new Set(
      hits.flatMap((hit) =>
        hit.type === "task"
          ? [hit.task.projectSectionId]
          : hit.type === "note"
            ? [hit.note.projectSectionId]
            : [],
      ),
    ),
  ];
  const { data: projects = {} } = useAsyncSelector({
    selector: projectsOfProjectSections,
    args: { projectSectionIds },
    placeholderData: (previous) => previous ?? {},
  });
  const isSearching = deferredQuery.trim() !== "";
  const [selectedId, setSelectedId] = useState("");
  const selected = hits.some((hit) => hitId(hit) === selectedId)
    ? selectedId
    : hits[0] && hitId(hits[0]);

  useEffect(() => {
    useFocusStore.getState().disableFocus();
    return () => useFocusStore.getState().enableFocus();
  }, []);

  const open = (hit: SearchHit) => {
    closeSearch();
    if (hit.type === "mindmapNode") {
      const { node } = hit;
      void navigate({
        to: "/spaces/$spaceId/mindmaps/$mindmapId",
        params: { spaceId, mindmapId: node.mindmapId },
        // The central topic is the map's own root, shown on open anyway.
        search: {
          projectId: "inbox",
          ...(node.id === node.mindmapId ? {} : { itemId: node.id }),
        },
      });
      return;
    }
    openItemPage(hit.type === "task" ? hit.task : hit.note);
  };

  return (
    <DialogContent
      // Anchored to the top so typing only moves its bottom edge.
      className="top-[12vh] z-[10000] translate-y-0 gap-0 overflow-hidden rounded-xl border-dialog-border bg-dialog-bg p-0 shadow-[0_32px_90px_rgba(0,0,0,0.8)] sm:max-w-2xl [&>button]:hidden"
      overlayClassName="z-[10000] bg-black/60 backdrop-blur-sm"
      // Focus goes to the opened result, not back to what had it before.
      onCloseAutoFocus={(e) => e.preventDefault()}
    >
      <DialogTitle className="sr-only">Search</DialogTitle>
      <DialogDescription className="sr-only">
        Search tasks, notes, and mindmap topics.
      </DialogDescription>
      {/* A grid item; without min-w-0 long titles widen it past the dialog. */}
      <Command
        shouldFilter={false}
        loop
        value={selected ?? ""}
        onValueChange={setSelectedId}
        className="min-w-0"
      >
        <div className="flex items-center gap-3 px-4">
          <Search className="h-4 w-4 shrink-0 text-content-tinted" />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search tasks, notes, and topics..."
            className="h-13 w-full bg-transparent text-[15px] text-content outline-none placeholder:text-content-tinted/60"
          />
        </div>
        {isSearching && (
          <Command.List className="max-h-[min(60vh,480px)] scroll-py-1.5 overflow-y-auto overscroll-contain border-t border-white/10 p-1.5">
            {!isPlaceholderData && (
              <Command.Empty className="px-3 py-8 text-center text-sm text-content-tinted">
                Nothing found
              </Command.Empty>
            )}
            {hits.map((hit) => (
              <Command.Item
                key={hitId(hit)}
                value={hitId(hit)}
                onSelect={() => open(hit)}
                className="group flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm text-calendar-day data-[selected=true]:bg-panel-tinted data-[selected=true]:text-content"
              >
                <HitRow
                  hit={hit}
                  query={deferredQuery}
                  project={projects[hitSectionId(hit) ?? ""]}
                  mindmapTitle={
                    hit.type === "mindmapNode"
                      ? mindmapTitles.get(hit.node.mindmapId)
                      : undefined
                  }
                />
              </Command.Item>
            ))}
          </Command.List>
        )}
        <div className="hidden items-center gap-4 border-t border-white/10 px-4 py-2 text-[11px] text-content-tinted sm:flex">
          <span className="flex items-center gap-1.5">
            <Keycap>↑</Keycap>
            <Keycap>↓</Keycap>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Keycap>
              <CornerDownLeft className="h-2.5 w-2.5" />
            </Keycap>
            open
          </span>
          <span className="flex items-center gap-1.5">
            <Keycap>esc</Keycap>
            close
          </span>
        </div>
      </Command>
    </DialogContent>
  );
}

const hitSectionId = (hit: SearchHit) =>
  hit.type === "task"
    ? hit.task.projectSectionId
    : hit.type === "note"
      ? hit.note.projectSectionId
      : undefined;

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border border-white/12 bg-white/[0.055] px-1 font-sans text-[10px] leading-none text-content-tinted">
      {children}
    </kbd>
  );
}

function HitRow({
  hit,
  query,
  project,
  mindmapTitle,
}: {
  hit: SearchHit;
  query: string;
  project: Project | undefined;
  mindmapTitle: string | undefined;
}) {
  const iconClass = "mt-0.5 h-4 w-4 shrink-0 text-content-tinted";
  const done = hit.type === "task" && hit.task.state === "done";
  const icon =
    hit.type === "mindmapNode" ? (
      <Network className={iconClass} />
    ) : hit.type === "note" ? (
      <StickyNote className={iconClass} />
    ) : done ? (
      <CircleCheck className={iconClass} />
    ) : (
      <Circle className={iconClass} />
    );
  const title =
    hit.type === "task"
      ? hit.task.title
      : hit.type === "note"
        ? hit.note.title
        : hit.node.title;

  return (
    <>
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Title
          title={title}
          query={query}
          fallback={hit.type === "mindmapNode" ? "Untitled topic" : "Untitled"}
          done={done}
        />
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-content-tinted">
          {hit.type === "mindmapNode" ? (
            <>
              <Network className="h-3 w-3 shrink-0" />
              <span className="truncate">{mindmapTitle}</span>
            </>
          ) : (
            project && (
              <>
                <span className="shrink-0 text-[11px] leading-none">
                  <ProjectIcon icon={project.icon} />
                </span>
                <span className="truncate">{project.title}</span>
              </>
            )
          )}
        </span>
      </div>
    </>
  );
}

function Title({
  title,
  query,
  fallback,
  done,
}: {
  title: string;
  query: string;
  fallback: string;
  done: boolean;
}) {
  const text = plainTitle(title);
  let offset = 0;
  const segments = searchHighlights(text, query).map((segment) => {
    const start = offset;
    offset += segment.text.length;
    return { ...segment, start };
  });
  return (
    <span
      className={
        done
          ? "truncate text-content-tinted line-through decoration-content-tinted/60"
          : "truncate"
      }
    >
      {text
        ? segments.map((segment) =>
            segment.match ? (
              <strong
                key={segment.start}
                className="font-semibold text-content"
              >
                {segment.text}
              </strong>
            ) : (
              segment.text
            ),
          )
        : fallback}
    </span>
  );
}
