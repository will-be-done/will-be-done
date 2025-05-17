import { Sidebar } from "../Sidebar/Sidebar";
import { TaskDetails } from "../TaskDetails/TaskDetails";

export const Layout = ({
  children,
  sidebarContent,
}: {
  children?: React.ReactNode;
  sidebarContent: React.ReactNode;
}) => {
  return (
    <div className="w-full h-screen bg-gray-900 overflow-hidden grid grid-cols-20 gap-2 py-2 px-2">
      <div className="col-span-4 overflow-hidden flex flex-col">
        <Sidebar>{sidebarContent}</Sidebar>
      </div>
      <div className="flex-1 overflow-hidden col-span-12">{children}</div>

      <div className="col-span-4">
        <TaskDetails />
      </div>
    </div>
  );
};
