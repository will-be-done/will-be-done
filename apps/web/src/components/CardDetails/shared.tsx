import { Folder, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import TextareaAutosize from "react-textarea-autosize";

// ─── EditableTitle ────────────────────────────────────────────────────────────

export function EditableTitle({
  icon,
  isEditing,
  editingTitle,
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
      <TextareaAutosize
        ref={isEditing ? textareaRef : undefined}
        value={editingTitle}
        onChange={(e) => setTitleDraft(e.target.value)}
        onKeyDown={handleTitleKeyDown}
        onFocus={() => setIsEditingTitle(true)}
        onBlur={saveTitle}
        placeholder="Untitled"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        className={cn(
          "flex-1 resize-none bg-transparent text-sm font-medium leading-snug focus:outline-none placeholder:italic placeholder:text-content-tinted",
          titleClassName ?? "text-content",
        )}
      />
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
        <span className="text-content-tinted mr-1 shrink-0">{label}: </span>
        <div className="min-w-0 flex-1 text-content">{children}</div>
      </div>
    </div>
  );
}

export function EditableDescription({
  editingDescription,
  setDescriptionDraft,
  handleDescriptionKeyDown,
  textareaRef,
  saveDescription,
  setIsEditingDescription,
}: {
  editingDescription: string;
  setDescriptionDraft: (v: string) => void;
  handleDescriptionKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => void;
  textareaRef: (el: HTMLTextAreaElement | null) => void;
  saveDescription: () => void;
  setIsEditingDescription: (v: boolean) => void;
}) {
  return (
    <TextareaAutosize
      ref={textareaRef}
      value={editingDescription}
      onChange={(e) => setDescriptionDraft(e.target.value)}
      onKeyDown={handleDescriptionKeyDown}
      onFocus={() => setIsEditingDescription(true)}
      onBlur={saveDescription}
      minRows={4}
      className="w-full rounded-md border border-task-panel-ring/30 bg-task-panel-hover/40 px-2 py-1.5 text-xs leading-5 text-content resize-none focus:outline-none focus:ring-1 focus:ring-accent placeholder:italic placeholder:text-content-tinted"
      placeholder="Add a description"
      aria-label="Edit task description"
    />
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
