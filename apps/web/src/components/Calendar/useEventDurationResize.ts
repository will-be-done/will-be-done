import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  durationMinutesFromEndPointer,
} from "./timeGrid.ts";

export function useEventDurationResize({
  startMinutes,
  durationMinutes,
  onCommit,
}: {
  startMinutes: number;
  durationMinutes: number;
  onCommit: (durationMinutes: number) => void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const skipClickRef = useRef(false);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget;
    const column = handle.closest("[data-calendar-column]");
    if (!(column instanceof HTMLElement)) return;

    const readDuration = (clientY: number) =>
      durationMinutesFromEndPointer({
        startMinutes,
        clientY,
        columnTop: column.getBoundingClientRect().top,
      });

    skipClickRef.current = true;
    handle.setPointerCapture(event.pointerId);
    setPreview(readDuration(event.clientY));

    const onMove = (next: PointerEvent) => {
      setPreview(readDuration(next.clientY));
    };
    const onUp = (next: PointerEvent) => {
      const duration = readDuration(next.clientY);
      setPreview(null);
      onCommit(duration);
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  return {
    displayDuration: preview ?? durationMinutes,
    consumeClick: () => {
      if (!skipClickRef.current) return false;
      skipClickRef.current = false;
      return true;
    },
    handleProps: {
      "data-calendar-resize": true,
      "aria-label": "Resize duration",
      onPointerDown,
      onMouseDown: (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
      },
      onClick: (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
      },
      className: "calendar-event-resize",
    },
  };
}
