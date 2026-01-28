import { cn } from "@/lib/utils.ts";
import { useEffect, useRef } from "react";

interface ResizableDividerProps {
  onResize: (deltaX: number) => void;
  isHidden: boolean;
  onHideClick: () => void;
}

export const ResizableDivider = ({
  onResize,
  isHidden,
  onHideClick,
}: ResizableDividerProps) => {
  const isDragging = useRef(false);
  const startY = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const deltaX = e.clientY - startY.current;
      onResize(deltaX);
      startY.current = e.clientY;
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onResize]);

  return (
    <div
      className={cn(
        "h-[6px] flex items-center cursor-row-resize group relative w-full",
        {
          "translate-y-[-6px]": isHidden,
        },
      )}
      onMouseDown={handleMouseDown}
    >
      <div className="absolute bottom-px left-0 right-0 flex justify-center items-end">
        <button
          type="button"
          className="w-6 h-3 bg-surface-elevated border border-ring border-b-0 rounded-t-md flex justify-center items-center cursor-pointer hover:bg-panel-hover transition-colors"
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
      <div className="absolute bottom-0 left-0 right-0 h-px bg-ring transition-colors" />
    </div>
  );
};
