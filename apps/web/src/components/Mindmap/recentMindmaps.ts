import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";

export const RECENT_MINDMAPS_LIMIT = 5;

// Per device, so opening a map doesn't write a synced row.
export const useRecentMindmaps = create<{
  idsBySpace: Record<string, string[]>;
  markOpened: (spaceId: string, mindmapId: string) => void;
}>()(
  persist(
    (set) => ({
      idsBySpace: {},
      markOpened: (spaceId, mindmapId) =>
        set(({ idsBySpace }) => ({
          idsBySpace: {
            ...idsBySpace,
            // Keeps a few extra so deleted maps don't shrink the list.
            [spaceId]: [
              mindmapId,
              ...(idsBySpace[spaceId] ?? []).filter((id) => id !== mindmapId),
            ].slice(0, RECENT_MINDMAPS_LIMIT * 2),
          },
        })),
    }),
    {
      name: "recent-mindmaps",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
