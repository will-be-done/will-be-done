import { useSyncSelector } from "@will-be-done/hyperdb";
import { projectsSlice } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";

export const SidebarProjectItem = ({
  projectId,
  isSelected,
  onSelect,
}: {
  projectId: string;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) => {
  const project = useSyncSelector(
    () => projectsSlice.byIdOrDefault(projectId),
    [projectId],
  );

  const notDoneCount = useSyncSelector(
    () => projectsSlice.notDoneTasksCountExceptDailiesCount(projectId, []),
    [projectId],
  );

  return (
    <button
      type="button"
      onClick={() => onSelect(projectId)}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg cursor-pointer transition-colors w-full text-left",
        isSelected
          ? "text-accent bg-accent/10"
          : "text-content-tinted hover:text-content hover:bg-surface-elevated",
      )}
    >
      <span className="text-base flex-shrink-0">
        {project.icon || "🟡"}
      </span>
      <span className="flex-1 truncate">{project.title}</span>
      {notDoneCount > 0 && (
        <span
          className={cn(
            "text-xs tabular-nums",
            isSelected ? "text-accent" : "text-content-tinted",
          )}
        >
          {notDoneCount}
        </span>
      )}
    </button>
  );
};
