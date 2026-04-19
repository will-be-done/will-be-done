import { cn } from "@/lib/utils.ts";
import { useCallback } from "react";

interface ResizableDividerProps {
  onResize?: (deltaX: number) => void;
  onResizePosition?: (position: number, delta: number) => void;
  isHidden?: boolean;
  onHideClick?: () => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export const ResizableDivider = ({
  onResize,
  onResizePosition,
  isHidden = false,
  onHideClick,
  orientation = "horizontal",
  className,
}: ResizableDividerProps) => {
  const isHorizontal = orientation === "horizontal";

  const resizeHandleClassName = cn(
    "absolute z-20 border-0 bg-transparent p-0 transition-all ease-linear after:absolute after:bg-ring after:transition-colors after:ease-linear hover:after:bg-content-tinted/50",
    isHorizontal
      ? "bottom-0 left-0 right-0 h-4 translate-y-1/2 cursor-row-resize after:left-0 after:right-0 after:top-1/2 after:h-[2px] after:-translate-y-1/2"
      : "inset-y-0 left-0 w-4 -translate-x-1/2 cursor-col-resize after:inset-y-0 after:left-1/2 after:w-[2px] after:-translate-x-1/2",
    className,
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const handleRect = e.currentTarget.getBoundingClientRect();
      const handlePosition = isHorizontal
        ? handleRect.top + handleRect.height / 2
        : handleRect.left + handleRect.width / 2;
      const pointerPosition = isHorizontal ? e.clientY : e.clientX;
      const pointerOffset = pointerPosition - handlePosition;
      let startPosition = handlePosition;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const pointerPosition = isHorizontal
          ? moveEvent.clientY
          : moveEvent.clientX;
        const position = pointerPosition - pointerOffset;
        const delta = position - startPosition;

        onResizePosition?.(position, delta);
        onResize?.(delta);
        startPosition = position;
      };

      const onMouseUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      document.body.style.cursor = isHorizontal ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [isHorizontal, onResize, onResizePosition],
  );

  if (!isHorizontal) {
    return (
      <button
        type="button"
        tabIndex={-1}
        aria-label="Resize"
        title="Resize"
        className={resizeHandleClassName}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
    );
  }

  return (
    <div
      className={cn("h-[6px] flex items-center group relative w-full", {
        "translate-y-[-6px]": isHidden,
      })}
    >
      {onHideClick && (
        <div className="absolute bottom-px left-0 right-0 z-30 flex justify-center items-end">
          <button
            type="button"
            className="w-6 h-3 bg-surface-elevated border border-ring border-b-0 rounded-t-md flex justify-center items-center cursor-pointer transition-colors"
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
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
    </div>
  );
};
