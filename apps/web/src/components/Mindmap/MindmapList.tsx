import { useState } from "react";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  deleteMindmap,
  type MindmapListItem,
  mindmapsWithTitles,
  updateMindmap,
} from "@will-be-done/slices/space";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { NavBar } from "@/components/NavBar/NavBar";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { useUndoToast } from "@/store/undo";
import { mindmapTitle, useCreateMindmap } from "./useCreateMindmap.ts";

const rowButtonClass =
  "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-content-tinted transition-colors hover:bg-white/10 hover:text-content";

function MindmapRow({ item: { mindmap, title } }: { item: MindmapListItem }) {
  const { spaceId } = Route.useParams();
  const dispatch = useAsyncDispatch();
  const deleteWithUndo = useUndoToast();
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft.trim() !== mindmap.title) {
      void dispatch(
        updateMindmap({ id: mindmap.id, mindmap: { title: draft.trim() } }),
      );
    }
  };

  return (
    <li className="group/row flex items-center gap-1 rounded-lg bg-surface pr-1.5 ring-1 ring-ring/40 transition-colors hover:bg-white/[0.04]">
      {draft !== null ? (
        <input
          autoFocus
          aria-label="Rename mindmap"
          value={draft}
          // An empty name falls back to the central topic, shown here.
          placeholder={mindmapTitle(title)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setDraft(null);
          }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base sm:text-[13px] text-content outline-none placeholder:text-content-tinted/50"
        />
      ) : (
        <Link
          to="/spaces/$spaceId/mindmaps/$mindmapId"
          params={{ spaceId, mindmapId: mindmap.id }}
          search={{ projectId: "inbox" }}
          className="min-w-0 flex-1 truncate px-3 py-2.5 text-[13px] text-content"
        >
          {mindmapTitle(title)}
        </Link>
      )}
      {draft === null && (
        <div className="flex items-center opacity-100 transition-opacity [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-focus-within/row:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover/row:opacity-100">
          <button
            type="button"
            title="Rename"
            aria-label="Rename mindmap"
            className={rowButtonClass}
            onClick={() => setDraft(mindmap.title)}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title="Delete"
            aria-label="Delete mindmap"
            className={rowButtonClass}
            onClick={() =>
              void deleteWithUndo(() =>
                dispatch(deleteMindmap({ id: mindmap.id })),
              )
            }
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

export const MindmapList = () => {
  const { spaceId } = Route.useParams();
  const { createAndOpen, preload } = useCreateMindmap();
  const { data: mindmaps = [] } = useAsyncSelector({
    selector: mindmapsWithTitles,
    args: {},
  });

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex h-14 shrink-0 items-start [app-region:no-drag]">
        <NavBar spaceId={spaceId} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg px-4 pt-5 pb-8">
          <div className="mb-6 flex items-end gap-3">
            <h1 className="flex-1 text-3xl font-bold leading-tight text-content">
              Mindmaps
            </h1>
            <button
              type="button"
              onClick={() => void createAndOpen()}
              onPointerEnter={preload}
              onFocus={preload}
              className="flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium text-content-tinted transition-colors hover:bg-accent/10 hover:text-accent"
            >
              <Plus className="size-3.5" />
              New mindmap
            </button>
          </div>

          {mindmaps.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-content-tinted/60">
              Lay out ideas around a central topic and drop tasks from any
              project onto them.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {mindmaps.map((item) => (
                <MindmapRow key={item.mindmap.id} item={item} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
