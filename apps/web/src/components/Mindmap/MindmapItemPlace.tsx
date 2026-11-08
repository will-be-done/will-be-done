import { useState } from "react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  type MindmapTreeNode,
  projectSectionsByProjectId,
} from "@will-be-done/slices/space";
import { format } from "date-fns";
import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MindmapNodeActions } from "./MindmapNodeCard.tsx";

const placeButtonClass =
  "min-w-0 cursor-pointer truncate rounded px-0.5 -mx-0.5 transition-colors hover:bg-white/10 hover:text-content";

// "Project · Section · date" under a task or note; project and section open
// pickers to change them.
export function MindmapItemPlace({
  id,
  tree,
  actions,
  scheduledAt,
}: {
  id: string;
  tree: MindmapTreeNode;
  actions: MindmapNodeActions;
  scheduledAt: Date | undefined;
}) {
  const [isPickingSection, setIsPickingSection] = useState(false);
  const { project, section } = tree;
  const { data: sections = [] } = useAsyncSelector({
    selector: projectSectionsByProjectId,
    args: { projectId: project?.id ?? "" },
    enabled: isPickingSection && !!project,
  });
  if (!project && !scheduledAt) return null;

  return (
    <div
      className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] font-normal text-content-tinted/60"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {project && (
        <button
          type="button"
          tabIndex={-1}
          title="Move to project (m)"
          className={placeButtonClass}
          onClick={() => actions.moveToProject(id)}
        >
          {project.icon} {project.title}
        </button>
      )}
      {project && section && (
        <>
          <span aria-hidden>·</span>
          <DropdownMenu
            open={isPickingSection}
            onOpenChange={setIsPickingSection}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                title="Change section"
                className={placeButtonClass}
              >
                {section.title || "Untitled section"}
              </button>
            </DropdownMenuTrigger>
            {isPickingSection && (
              <DropdownMenuContent
                align="start"
                sideOffset={4}
                className="min-w-40 bg-task-dropdown shadow-2xl ring-0 backdrop-blur-none"
              >
                {sections.map((option) => (
                  <DropdownMenuItem
                    key={option.id}
                    onSelect={() => actions.moveToSection(id, option.id)}
                  >
                    <Check
                      className={
                        option.id === section.id ? undefined : "invisible"
                      }
                    />
                    {option.title || "Untitled section"}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        </>
      )}
      {project && scheduledAt && <span aria-hidden>·</span>}
      {scheduledAt && (
        <button
          type="button"
          tabIndex={-1}
          title="Change date (s)"
          className={`${placeButtonClass} shrink-0`}
          onClick={() => actions.schedule(id)}
        >
          {format(scheduledAt, "MMM d")}
        </button>
      )}
    </div>
  );
}
