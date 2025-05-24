import { useEffect, useRef } from "react";

interface ResizableDividerProps {
  onResize: (deltaX: number) => void;
}

export const ResizableDivider = ({ onResize }: ResizableDividerProps) => {
  const isDragging = useRef(false);
  const startX = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const deltaX = e.clientX - startX.current;
      onResize(deltaX);
      startX.current = e.clientX;
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
      className="w-[6px] flex items-center justify-center cursor-col-resize group"
      onMouseDown={handleMouseDown}
    >
      <div className="w-[2px] h-full bg-transparent group-hover:bg-blue-500 transition-colors" />
    </div>
  );
};
