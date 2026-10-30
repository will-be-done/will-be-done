import { useLayoutEffect, useRef, useState } from "react";
import { Clock, Folder, Hash, Hourglass, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { DurationInput, TimeInput } from "@/components/Task/TaskTimeInputs";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/RichText/RichTextEditor";
import { RichTextView } from "@/components/RichText/RichTextView";
import { viewTextOffset } from "@/components/RichText/caret";
import { useSavedRichText } from "@/components/RichText/useSavedRichText";

// Editable title

export function EditableTitle({
  icon,
  isEditing,
  title,
  titleDoc,
  titleClassName,
  onSave,
  setIsEditingTitle,
}: {
  icon: React.ReactNode;
  isEditing: boolean;
  title: string;
  titleDoc: string | undefined;
  titleClassName?: string;
  onSave: (titleDoc: string) => void;
  setIsEditingTitle: (v: boolean) => void;
}) {
  const { text, saveDoc } = useSavedRichText(title, "title", onSave);
  const [caretOffset, setCaretOffset] = useState<number>();
  return (
    <div className="flex items-start gap-2">
      <div className="shrink-0">{icon}</div>
      {isEditing ? (
        <RichTextEditor
          kind="title"
          doc={titleDoc}
          text={text}
          onSave={saveDoc}
          onExit={() => setIsEditingTitle(false)}
          onFocus={() => setCaretOffset(undefined)}
          onBlur={() => setIsEditingTitle(false)}
          required
          autoFocus
          caretOffset={caretOffset}
          placeholder="Untitled"
          ariaLabel="Edit task title"
          className={cn(
            "text-sm font-medium leading-snug",
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
          onClick={(event) => {
            setCaretOffset(viewTextOffset(event));
            setIsEditingTitle(true);
          }}
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
          {text ? (
            <RichTextView text={text} />
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

// Always an editor, so its text, links, and remote edits are live.
export function EditableDescription({
  isEditing,
  content,
  contentDoc,
  onSave,
  setIsEditingDescription,
}: {
  isEditing: boolean;
  content: string;
  contentDoc: string | undefined;
  onSave: (contentDoc: string) => void;
  setIsEditingDescription: (v: boolean) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<RichTextEditorHandle | null>(null);

  // The `e` shortcut asks to edit the description.
  useLayoutEffect(() => {
    if (isEditing && !boxRef.current?.contains(document.activeElement)) {
      editorRef.current?.focusEnd();
    }
  }, [isEditing]);

  return (
    <div
      ref={boxRef}
      data-testid="task-description"
      className="min-h-[94px] w-full cursor-text rounded-md border border-task-panel-ring/30 bg-task-panel-hover/40 px-2 py-1.5 text-xs leading-5 text-content focus-within:ring-1 focus-within:ring-accent"
      onClick={() => editorRef.current?.focusEnd()}
    >
      <RichTextEditor
        ref={editorRef}
        kind="content"
        doc={contentDoc}
        text={content}
        onSave={onSave}
        onFocus={() => setIsEditingDescription(true)}
        onExit={() => {
          setIsEditingDescription(false);
          editorRef.current?.blur();
        }}
        onBlur={() => setIsEditingDescription(false)}
        toolbar
        placeholder="Add a description"
        ariaLabel="Edit task description"
        className="min-h-[56px]"
      />
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
