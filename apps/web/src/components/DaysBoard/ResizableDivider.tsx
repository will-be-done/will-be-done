import { cn } from "@/lib/utils.ts";
import { useCallback } from "react";

interface ResizableDividerProps {
  onResize?: (deltaX: number) => void;
  onResizePosition?: (position: number, delta: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  isHidden?: boolean;
  onHideClick?: () => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export const ResizableDivider = ({
  onResize,
  onResizePosition,
  onResizeStart,
  onResizeEnd,
  isHidden = false,
  onHideClick,
  orientation = "horizontal",
  className,
}: ResizableDividerProps) => {
  const isHorizontal = orientation === "horizontal";

  const resizeHandleClassName = cn(
    "absolute z-20 touch-none border-0 bg-transparent p-0 transition-all ease-linear after:absolute after:bg-ring after:transition-colors after:ease-linear hover:after:bg-content-tinted/50",
    isHorizontal
      ? "left-0 right-0 top-0 h-4 pointer-coarse:h-8 -translate-y-1/2 cursor-row-resize after:left-0 after:right-0 after:top-1/2 after:h-[2px] after:-translate-y-1/2"
      : "inset-y-0 left-0 w-4 pointer-coarse:w-8 -translate-x-1/2 cursor-col-resize after:inset-y-0 after:left-1/2 after:w-[2px] after:-translate-x-1/2",
    className,
  );

  // Pointer events, so a finger resizes as a mouse does.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const handleRect = e.currentTarget.getBoundingClientRect();
      const handlePosition = isHorizontal
        ? handleRect.top + handleRect.height / 2
        : handleRect.left + handleRect.width / 2;
      const pointerPosition = isHorizontal ? e.clientY : e.clientX;
      const pointerOffset = pointerPosition - handlePosition;
      let startPosition = handlePosition;

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== e.pointerId) return;
        const pointerPosition = isHorizontal
          ? moveEvent.clientY
          : moveEvent.clientX;
        const position = pointerPosition - pointerOffset;
        const delta = position - startPosition;

        onResizePosition?.(position, delta);
        onResize?.(delta);
        startPosition = position;
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== e.pointerId) return;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        onResizeEnd?.();
      };

      document.body.style.cursor = isHorizontal ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
      onResizeStart?.();
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [isHorizontal, onResize, onResizeEnd, onResizePosition, onResizeStart],
  );

  if (!isHorizontal) {
    return (
      <button
        type="button"
        tabIndex={-1}
        aria-label="Resize"
        title="Resize"
        className={resizeHandleClassName}
        onPointerDown={handlePointerDown}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
    );
  }

  return (
    <div className="absolute left-0 right-0 top-0 z-30 h-0 w-full">
      {onHideClick && (
        // Only the button takes input, so the resize handle stays reachable.
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex -translate-y-full justify-center">
          <button
            type="button"
            aria-label={isHidden ? "Show panel" : "Hide panel"}
            className="pointer-events-auto w-6 h-3 pointer-coarse:w-12 pointer-coarse:h-5 bg-surface-elevated border border-ring border-b-0 rounded-t-md flex justify-center items-center cursor-pointer transition-colors"
            onClick={onHideClick}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={6}
              height={3}
              fill="none"
              className={cn("text-content-tinted", {
                "rotate-180": !isHidden,
              })}
            >
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M.5 2.167 2.737.5l2.237 1.667"
              />
            </svg>
          </button>
        </div>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Resize"
        title="Resize"
        className={resizeHandleClassName}
        onPointerDown={handlePointerDown}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
    </div>
  );
};
