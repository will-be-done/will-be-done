import { Suspense, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusStore } from "@/store/focusSlice.ts";
import { ItemView } from "./ItemPage.tsx";
import { useItemPeek } from "./useItemPeek.ts";

// Not a Radix or Headless UI dialog: their focus traps and inert outsides
// break the portaled pickers and modals the item body opens. Nested pickers
// and modals sit above it at z-index 1100 and higher.
export function ItemPopup({
  itemId,
  onClose,
  onItemIdChange,
}: {
  itemId: string;
  onClose: () => void;
  onItemIdChange: (itemId: string) => void;
}) {
  const pressedBackdrop = useRef(false);

  // The list behind keeps its focused item but stops taking shortcuts.
  useEffect(() => {
    useFocusStore.getState().disableFocus();
    return () => useFocusStore.getState().enableFocus();
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in-0 duration-150 sm:p-8"
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="item-popup"
        className="h-full max-h-[56rem] w-full max-w-5xl overflow-hidden rounded-xl border border-dialog-border bg-dialog-bg shadow-[0_32px_90px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-150"
      >
        <ItemView
          itemId={itemId}
          isPopup
          onClose={onClose}
          onItemIdChange={(item) => onItemIdChange(item.id)}
        />
      </div>
    </div>,
    document.body,
  );
}

// Mounted before the popup opens, so opening and replacing the item wait for
// its details to load instead of showing an empty popup.
export function ItemPeek() {
  const peek = useItemPeek();
  return (
    <Suspense fallback={null}>
      {peek.itemId && (
        <ItemPopup
          itemId={peek.itemId}
          onClose={peek.close}
          onItemIdChange={peek.replace}
        />
      )}
    </Suspense>
  );
}
