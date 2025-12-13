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
        "h-[6px] flex items-center cursor-row-resize group translate-y-[3px] relative w-full",
        {
          "translate-y-[-3px]": isHidden,
        },
      )}
      onMouseDown={handleMouseDown}
    >
      <div className="fixed flex bottom-[3px] left-0 right-0 justify-center items-center">
        <button
          type="button"
          className="w-6 h-3 bg-panel-2 rounded-t-md flex justify-center items-center cursor-pointer "
          onClick={onHideClick}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={6}
            height={3}
            fill="none"
            className={cn({
              "rotate-180": !isHidden,
            })}
          >
            <path
              stroke="#CBD5E1"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M.5 2.167 2.737.5l2.237 1.667"
            />
          </svg>
        </button>
      </div>
      <div className="h-[1px] w-full bg-panel-2 transition-colors" />
    </div>
  );
};
