import { useCallback } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { type Task, taskType } from "@will-be-done/slices/space";
import { Route as SpaceRoute } from "@/routes/spaces.$spaceId.tsx";
import {
  buildFocusKey,
  type FocusKey,
  scrollFocusedIntoView,
  useFocusStore,
} from "@/store/focusSlice.ts";

const timelineDatePattern = /\/timeline\/([^/]+)/;

// The project's lists render from async selectors, so the item may land a few
// frames after navigation, or never when its section is hidden.
function revealWhenRendered(key: FocusKey, framesLeft = 30) {
  if (useFocusStore.getState().focusItemKey !== key) return;
  const el = document.querySelector<HTMLElement>(
    `[data-focusable-key="${key}"]`,
  );
  if (el) {
    el.focus({ preventScroll: true });
    scrollFocusedIntoView(el);
  } else if (framesLeft > 0) {
    requestAnimationFrame(() => revealWhenRendered(key, framesLeft - 1));
  }
}

export function useOpenProject() {
  const navigate = useNavigate();
  const { spaceId } = SpaceRoute.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Done tasks may sit past the project's done-list limit, so only todo tasks
  // are focused.
  return useCallback(
    (projectId: string, reveal?: Pick<Task, "id" | "type" | "state">) => {
      const timelineDate = pathname.match(timelineDatePattern)?.[1];

      const navigation = timelineDate
        ? navigate({
            to: "/spaces/$spaceId/timeline/$date",
            params: { spaceId, date: timelineDate },
            search: { projectId },
          })
        : navigate({
            to: "/spaces/$spaceId/projects/$projectId",
            params: { spaceId, projectId },
          });

      if (reveal?.type !== taskType || reveal.state !== "todo") return;
      const key = buildFocusKey(reveal.id, reveal.type);
      void navigation.then(() => {
        useFocusStore.getState().focusByKey(key, true);
        revealWhenRendered(key);
      });
    },
    [navigate, pathname, spaceId],
  );
}
