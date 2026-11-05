import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { mindmapsOrdered } from "@will-be-done/slices/space";
import { Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { NavBar } from "@/components/NavBar/NavBar";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { mindmapTitle, useCreateMindmap } from "./useCreateMindmap.ts";

export const MindmapList = () => {
  const { spaceId } = Route.useParams();
  const { createAndOpen, preload } = useCreateMindmap();
  const { data: mindmaps = [] } = useAsyncSelector({
    selector: mindmapsOrdered,
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
              onClick={createAndOpen}
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
              {mindmaps.map((mindmap) => (
                <li key={mindmap.id}>
                  <Link
                    to="/spaces/$spaceId/mindmaps/$mindmapId"
                    params={{ spaceId, mindmapId: mindmap.id }}
                    search={{ projectId: "inbox" }}
                    className="block truncate rounded-lg bg-surface px-3 py-2.5 text-[13px] text-content ring-1 ring-ring/40 transition-colors hover:bg-white/[0.04]"
                  >
                    {mindmapTitle(mindmap.title)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
