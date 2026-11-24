import { useCallback } from "react";
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";

// The history entry the app pushed for the open peek. Closing it goes back,
// so Back and the close button agree; a peek loaded from a URL is replaced.
let pushedPeekKey: string | undefined;

// The item shown in a popup over the current view, kept in `?peek=`.
export function useItemPeek() {
  const navigate = useNavigate();
  const router = useRouter();
  const { peek } = useSearch({ strict: false });

  const currentKey = () => router.history.location.state.__TSR_key;

  const open = useCallback(
    (itemId: string) => {
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, peek: itemId }),
      }).then(() => {
        pushedPeekKey = router.history.location.state.__TSR_key;
      });
    },
    [navigate, router],
  );

  const close = () => {
    if (pushedPeekKey && currentKey() === pushedPeekKey) {
      pushedPeekKey = undefined;
      router.history.back();
      return;
    }
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, peek: undefined }),
      replace: true,
    });
  };

  // Converting between a task and a note replaces the row with a new ID.
  const replace = (itemId: string) => {
    const wasPushed = !!pushedPeekKey && currentKey() === pushedPeekKey;
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, peek: itemId }),
      replace: true,
    }).then(() => {
      if (wasPushed) pushedPeekKey = currentKey();
    });
  };

  return { itemId: peek, open, close, replace };
}
