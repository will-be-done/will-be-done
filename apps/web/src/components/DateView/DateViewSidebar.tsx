import { useSyncSelector } from "@will-be-done/hyperdb";
import { projectsAllSlice } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { SidebarProjectItem } from "./SidebarProjectItem.tsx";
import { ProjectTaskPanel } from "./ProjectTaskPanel.tsx";
import { Link } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import {
  Sidebar,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar.tsx";

export const DateViewSidebar = ({
  selectedProjectId,
  onProjectSelect,
}: {
  selectedProjectId: string | null;
  onProjectSelect: (id: string) => void;
}) => {
  const spaceId = Route.useParams().spaceId;
  const { open } = useSidebar();
  const inbox = useSyncSelector(() => projectsAllSlice.inbox(), []);
  const projectIdsWithoutInbox = useSyncSelector(
    () => projectsAllSlice.childrenIdsWithoutInbox(),
    [],
  );

  return (
    <>
      <Sidebar side="left" collapsible="offcanvas" className="border-r-0 [&_[data-slot=sidebar-inner]]:bg-surface-elevated [&_[data-slot=sidebar-inner]]:ring-1 [&_[data-slot=sidebar-inner]]:ring-ring">
        <SidebarHeader className="px-3 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase text-subheader font-semibold">
              Projects
            </span>
            <Link
              to="/spaces/$spaceId/timeline"
              params={{ spaceId }}
              className="text-xs text-content-tinted hover:text-primary transition-colors"
            >
              timeline
            </Link>
          </div>
        </SidebarHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
          <SidebarProjectItem
            projectId={inbox.id}
            isSelected={selectedProjectId === inbox.id}
            onSelect={onProjectSelect}
          />
          {projectIdsWithoutInbox.map((id) => (
            <SidebarProjectItem
              key={id}
              projectId={id}
              isSelected={selectedProjectId === id}
              onSelect={onProjectSelect}
            />
          ))}
        </div>
      </Sidebar>

      {/* Sliding project panel — only when sidebar is open, desktop only */}
      {open && (
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out hidden md:block",
            selectedProjectId ? "w-80" : "w-0",
          )}
        >
          <div className="w-80 h-full ring-1 ring-ring bg-surface-elevated">
            {selectedProjectId && (
              <ProjectTaskPanel projectId={selectedProjectId} />
            )}
          </div>
        </div>
      )}
    </>
  );
};
