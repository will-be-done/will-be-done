import { Clock, Folder, Hash, Hourglass, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { DurationInput, TimeInput } from "@/components/Task/TaskTimeInputs";
import TextareaAutosize from "react-textarea-autosize";
import { LinkifiedText } from "@/components/LinkifiedText";
import { ProjectIcon } from "@/components/ui/emoji";

// Editable title

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
      {isEditing ? (
        <TextareaAutosize
          ref={textareaRef}
          value={editingTitle}
          onChange={(e) => setTitleDraft(e.target.value)}
          onKeyDown={handleTitleKeyDown}
          onBlur={saveTitle}
          placeholder="Untitled"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
          aria-label="Edit task title"
          className={cn(
            "flex-1 resize-none bg-transparent text-sm font-medium leading-snug focus:outline-none placeholder:italic placeholder:text-content-tinted",
            titleClassName ?? "text-content",
          )}
        />
      ) : (
        <div
          data-testid="task-title"
          data-disable-task-shortcuts
          className={cn(
            "min-h-5 flex-1 cursor-text rounded-sm text-sm font-medium leading-snug focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent",
            titleClassName ?? "text-content",
          )}
          tabIndex={0}
          onClick={() => setIsEditingTitle(true)}
          onKeyDown={(event) => {
            if (
              event.target === event.currentTarget &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              setIsEditingTitle(true);
            }
          }}
        >
          {editingTitle ? (
            <LinkifiedText text={editingTitle} />
          ) : (
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
        <span className="text-content-tinted mr-1 shrink-0">{label}: </span>
        <div className="min-w-0 flex-1 text-content">{children}</div>
      </div>
    </div>
  );
}

export function EditableDescription({
  isEditing,
  editingDescription,
  setDescriptionDraft,
  handleDescriptionKeyDown,
  textareaRef,
  saveDescription,
  setIsEditingDescription,
}: {
  isEditing: boolean;
  editingDescription: string;
  setDescriptionDraft: (v: string) => void;
  handleDescriptionKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => void;
  textareaRef: (el: HTMLTextAreaElement | null) => void;
  saveDescription: () => void;
  setIsEditingDescription: (v: boolean) => void;
}) {
  return isEditing ? (
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
  ) : (
    <div
      data-testid="task-description"
      data-disable-task-shortcuts
      className="min-h-[94px] w-full cursor-text whitespace-break-spaces [overflow-wrap:anywhere] rounded-md border border-task-panel-ring/30 bg-task-panel-hover/40 px-2 py-1.5 text-xs leading-5 text-content focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      tabIndex={0}
      onClick={() => setIsEditingDescription(true)}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          setIsEditingDescription(true);
        }
      }}
    >
      {editingDescription ? (
        <LinkifiedText text={editingDescription} />
      ) : (
        <span className="italic text-content-tinted">Add a description</span>
      )}
    </div>
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
          <ProjectIcon icon={project.icon} /> {project.title}
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

// ─── TimeDetailRow ───────────────────────────────────────────────────────────

export function TimeDetailRow({
  time,
  onChange,
}: {
  time: string | null;
  onChange: (time: string | null) => void;
}) {
  return (
    <DetailRow icon={<Clock className="h-3 w-3 shrink-0" />} label="Time">
      <TimeInput time={time} onChange={onChange} />
    </DetailRow>
  );
}

// ─── DurationDetailRow ───────────────────────────────────────────────────────

export function DurationDetailRow({
  durationMinutes,
  onChange,
}: {
  durationMinutes: number | null;
  onChange: (durationMinutes: number | null) => void;
}) {
  return (
    <DetailRow
      icon={<Hourglass className="h-3 w-3 shrink-0" />}
      label="Duration"
    >
      <DurationInput durationMinutes={durationMinutes} onChange={onChange} />
    </DetailRow>
  );
}
