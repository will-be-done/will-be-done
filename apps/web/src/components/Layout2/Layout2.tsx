import { Details } from "../Details/Details";
import { ResizableDivider } from "@/lib/resizable-divider/ResizableDivider";
import { useLayoutStore } from "../Layout/useLayoutStore";
import { Sidebar } from "lucide-react";

export const Layout2 = ({ children }: { children?: React.ReactNode }) => {
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
      15,
      Math.min(40, rightSidebarWidth - deltaPercentage),
    );
    setRightSidebarWidth(newWidth);
  };

  return (
    <div className="w-full h-screen bg-surface overflow-hidden flex">
      {/* <div */}
      {/*   className="overflow-hidden flex flex-col" */}
      {/*   style={{ width: `${leftSidebarWidth}%` }} */}
      {/* > */}
      {/*   <Sidebar>{sidebarContent}</Sidebar> */}
      {/* </div> */}

      {/* <ResizableDivider onResize={handleLeftResize} /> */}

      {children}

      {/* <div className="flex-1 overflow-hidden">{children}</div> */}

      {/* <ResizableDivider onResize={handleRightResize} /> */}
      {/**/}
      {/* <div */}
      {/*   className="overflow-hidden" */}
      {/*   style={{ width: `${rightSidebarWidth}%` }} */}
      {/* > */}
      {/*   <Details /> */}
      {/* </div> */}
    </div>
  );
};
