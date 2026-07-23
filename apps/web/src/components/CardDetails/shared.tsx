import { Folder, Hash, Pencil } from "lucide-react";
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
  onOpenClick,
  onEditClick,
}: {
  project: { id: string; icon: string; title: string };
  onOpenClick: () => void;
  onEditClick: () => void;
}) {
  return (
    <DetailRow icon={<Folder className="h-3 w-3 shrink-0" />} label="Project">
      <span className="inline-flex min-w-0 items-center gap-1">
        <button
          className="min-w-0 cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors text-left truncate"
          onClick={onOpenClick}
        >
          {project.icon || "🟡"} {project.title}
        </button>
        <button
          type="button"
          title="Move to project"
          aria-label="Move to project"
          className="cursor-pointer rounded p-0.5 text-content-tinted hover:bg-task-panel-hover hover:text-content transition-colors"
          onClick={onEditClick}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    </DetailRow>
  );
}

// ─── SectionDetailRow ────────────────────────────────────────────────────────

export function SectionDetailRow({
  projectSectionId,
  projectSections,
  onChange,
}: {
  projectSectionId: string;
  projectSections: { id: string; title: string }[];
  onChange: (projectSectionId: string) => void;
}) {
  return (
    <DetailRow icon={<Hash className="h-3 w-3 shrink-0" />} label="Section">
      <select
        value={projectSectionId}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-content text-xs focus:outline-none cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors"
      >
        {projectSections.map((section) => (
          <option
            key={section.id}
            value={section.id}
            className="bg-panel text-content"
          >
            {section.title}
          </option>
        ))}
      </select>
    </DetailRow>
  );
}
