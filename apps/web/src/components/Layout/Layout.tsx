import { Sidebar } from "./Sidebar";
import { TaskDetails } from "../TaskDetails/TaskDetails";
import { useLayoutStore } from "./useLayoutStore.ts";
import { ResizableDivider } from "@/lib/resizable-divider/ResizableDivider";

export const Layout = ({
  children,
  sidebarContent,
}: {
  children?: React.ReactNode;
  sidebarContent: React.ReactNode;
}) => {
  const {
    leftSidebarWidth,
    rightSidebarWidth,
    setLeftSidebarWidth,
    setRightSidebarWidth,
  } = useLayoutStore();

  const handleLeftResize = (deltaX: number) => {
    const containerWidth = window.innerWidth;
    const deltaPercentage = (deltaX / containerWidth) * 100;
    const newWidth = Math.max(
      15,
      Math.min(40, leftSidebarWidth + deltaPercentage),
    );
    setLeftSidebarWidth(newWidth);
  };

  const handleRightResize = (deltaX: number) => {
    const containerWidth = window.innerWidth;
    const deltaPercentage = (deltaX / containerWidth) * 100;
    const newWidth = Math.max(
      20,
      Math.min(40, rightSidebarWidth - deltaPercentage),
    );
    setRightSidebarWidth(newWidth);
  };

  return (
    <div className="w-full h-screen bg-gray-900 overflow-hidden flex gap-2 py-2 px-2">
      <div
        className="overflow-hidden flex flex-col"
        style={{ width: `${leftSidebarWidth}%` }}
      >
        <Sidebar>{sidebarContent}</Sidebar>
      </div>

      <ResizableDivider onResize={handleLeftResize} />

      <div className="flex-1 overflow-hidden">{children}</div>

      <ResizableDivider onResize={handleRightResize} />

      <div
        className="overflow-hidden"
        style={{ width: `${rightSidebarWidth}%` }}
      >
        <TaskDetails />
      </div>
    </div>
  );
};
