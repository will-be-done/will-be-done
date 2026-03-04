import { Folder, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import TextareaAutosize from "react-textarea-autosize";

// ─── EditableTitle ────────────────────────────────────────────────────────────

export function EditableTitle({
  icon,
  isEditing,
  editingTitle,
  title,
  titleClassName,
  setTitleDraft,
  handleTitleKeyDown,
  textareaRef,
  saveTitle,
  setIsEditingTitle,
}: {
  icon: React.ReactNode;
  isEditing: boolean;
  editingTitle: string;
  title: string;
  titleClassName?: string;
  setTitleDraft: (v: string) => void;
  handleTitleKeyDown: (e: React.KeyboardEvent) => void;
  textareaRef: (el: HTMLTextAreaElement | null) => void;
  saveTitle: () => void;
  setIsEditingTitle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2 whitespace-break-spaces [overflow-wrap:anywhere] ">
      <div className="shrink-0">{icon}</div>
      {isEditing ? (
        <TextareaAutosize
          ref={textareaRef}
          value={editingTitle}
          onChange={(e) => setTitleDraft(e.target.value)}
          onKeyDown={handleTitleKeyDown}
          onBlur={saveTitle}
          className="flex-1 bg-transparent resize-none focus:outline-none text-sm font-medium text-content leading-snug"
        />
      ) : (
        <div
          className={cn(
            "flex-1 text-sm font-medium leading-snug cursor-text select-none",
            titleClassName ?? "text-content",
          )}
          onDoubleClick={() => setIsEditingTitle(true)}
          title="Double-click to edit"
        >
          {title || (
            <span className="italic text-content-tinted">Untitled</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DetailRow ────────────────────────────────────────────────────────────────

export function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-content-tinted mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0 flex">
        <span className="text-content-tinted mr-1">{label}: </span>
        <span className="text-content">{children}</span>
      </div>
    </div>
  );
}

// ─── ProjectDetailRow ─────────────────────────────────────────────────────────

export function ProjectDetailRow({
  project,
  onEditClick,
}: {
  project: { icon: string; title: string };
  onEditClick: () => void;
}) {
  return (
    <DetailRow icon={<Folder className="h-3 w-3 shrink-0" />} label="Project">
      <button
        className="cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors text-left"
        onClick={onEditClick}
      >
        {project.icon || "🟡"} {project.title}
      </button>
    </DetailRow>
  );
}

// ─── CategoryDetailRow ────────────────────────────────────────────────────────

export function CategoryDetailRow({
  projectCategoryId,
  projectCategories,
  onChange,
}: {
  projectCategoryId: string;
  projectCategories: { id: string; title: string }[];
  onChange: (categoryId: string) => void;
}) {
  return (
    <DetailRow icon={<Hash className="h-3 w-3 shrink-0" />} label="Category">
      <select
        value={projectCategoryId}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-content text-xs focus:outline-none cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors"
      >
        {projectCategories.map((cat) => (
          <option key={cat.id} value={cat.id} className="bg-panel text-content">
            {cat.title}
          </option>
        ))}
      </select>
    </DetailRow>
  );
}
