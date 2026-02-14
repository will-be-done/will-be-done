import { useSyncSelector } from "@will-be-done/hyperdb";
import { projectsAllSlice } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { SidebarProjectItem } from "./SidebarProjectItem.tsx";
import { ProjectTaskPanel } from "./ProjectTaskPanel.tsx";

export const DateViewSidebar = ({
  selectedProjectId,
  onProjectSelect,
}: {
  selectedProjectId: string | null;
  onProjectSelect: (id: string) => void;
}) => {
  const inbox = useSyncSelector(() => projectsAllSlice.inbox(), []);
  const projectIdsWithoutInbox = useSyncSelector(
    () => projectsAllSlice.childrenIdsWithoutInbox(),
    [],
  );

  return (
    <div className="flex h-full shrink-0">
      {/* Sidebar project list */}
      <div className="w-56 h-full bg-surface-elevated flex flex-col shrink-0 ring-1 ring-ring z-10">
        <div className="px-3 py-3 text-xs uppercase text-subheader font-semibold">
          Projects
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
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
      </div>

      {/* Sliding panel */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          selectedProjectId ? "w-80" : "w-0",
        )}
      >
        <div className="w-80 h-full ring-1 ring-ring bg-surface-elevated">
          {selectedProjectId && (
            <ProjectTaskPanel projectId={selectedProjectId} />
          )}
        </div>
      </div>
    </div>
  );
};
