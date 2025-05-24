import { ColumnListProvider } from "@/features/focus/components/ParentListProvider.tsx";
import { cn } from "@/lib/utils";
import { buildFocusKey } from "@/store/slices/focusSlice.ts";
import { Link } from "@tanstack/react-router";

export const Sidebar = function SidebarComp({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ColumnListProvider
      focusKey={buildFocusKey("sidebar", "sidebar", "Sidebar")}
      priority="0"
    >
      <div className="flex align-center justify-center w-full gap-2">
        <Link
          to="/projects"
          className={cn(
            "text-white text-sm rounded-md border px-2 py-1  [&.active]:bg-gray-800",
          )}
        >
          <span className="text-white text-sm">Projects</span>
        </Link>

        <Link
          to="/timeline"
          className={cn(
            "text-white text-sm rounded-md border px-2 py-1 [&.active]:bg-gray-800",
          )}
        >
          <span className="text-white text-sm">Timeline</span>
        </Link>
      </div>
      <div className="overflow-y-hidden mb-4 mt-2">{children}</div>
    </ColumnListProvider>
  );
};
