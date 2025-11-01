import { useEffect, useRef } from "react";

interface ResizableDividerProps {
  onResize: (deltaX: number) => void;
}

export const ResizableDivider = ({ onResize }: ResizableDividerProps) => {
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
      className="h-[6px] flex items-center justify-center cursor-row-resize group"
      onMouseDown={handleMouseDown}
    >
      <div className="h-[2px] w-full bg-transparent group-hover:bg-blue-500 transition-colors" />
    </div>
  );
};
