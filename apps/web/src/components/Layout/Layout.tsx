import { Sidebar } from "../Sidebar/Sidebar";
import { TaskDetails } from "../TaskDetails/TaskDetails";
import { useEffect, useRef } from "react";
import { useLayoutStore } from "../../stores/layoutStore";

export const Layout = ({
  children,
  sidebarContent,
}: {
  children?: React.ReactNode;
  sidebarContent: React.ReactNode;
}) => {
  const { sidebarWidth, setSidebarWidth } = useLayoutStore();
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const deltaX = e.clientX - startX.current;
      const containerWidth = window.innerWidth;
      const deltaPercentage = (deltaX / containerWidth) * 100;
      const newWidth = Math.max(
        15,
        Math.min(40, startWidth.current + deltaPercentage)
      );

      setSidebarWidth(newWidth);
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
  }, [setSidebarWidth]);

  return (
    <div className="w-full h-screen bg-gray-900 overflow-hidden flex gap-2 py-2 px-2">
      <div
        className="overflow-hidden flex flex-col"
        style={{ width: `${sidebarWidth}%` }}
      >
        <Sidebar>{sidebarContent}</Sidebar>
      </div>

      <div
        className="w-[6px] flex items-center justify-center cursor-col-resize group"
        onMouseDown={handleMouseDown}
      >
        <div className="w-[2px] h-full bg-transparent group-hover:bg-blue-500 transition-colors" />
      </div>

      <div className="flex-1 overflow-hidden">{children}</div>

      <div className="w-1/4">
        <TaskDetails />
      </div>
    </div>
  );
};
