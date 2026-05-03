import { Folder, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import TextareaAutosize from "react-textarea-autosize";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-2 text-base font-semibold leading-6 text-content">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2 text-sm font-semibold leading-6 text-content">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1 text-xs font-semibold leading-5 tracking-wide text-content">
      {children}
    </h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="whitespace-pre-wrap text-content [&:not(:last-child)]:mb-2">
      {children}
    </p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc space-y-1 pl-4 text-content">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal space-y-1 pl-4 text-content">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-content">{children}</li>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-task-panel-hover px-1 py-0.5 font-mono text-[11px] text-content">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="overflow-x-auto rounded-md bg-task-panel-hover px-2 py-1.5 font-mono text-[11px] text-content">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-task-panel-ring/40 pl-3 text-content-tinted">
      {children}
    </blockquote>
  ),
  br: () => <br />,
};

function MarkdownWithBlankLines({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={markdownComponents}
    >
      {children}
    </Markdown>
  );
}

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
        <span className="text-content-tinted mr-1 shrink-0">{label}: </span>
        <div className="min-w-0 flex-1 text-content">{children}</div>
      </div>
    </div>
  );
}

export function EditableMarkdownDescription({
  isEditing,
  editingDescription,
  description,
  setDescriptionDraft,
  handleDescriptionKeyDown,
  textareaRef,
  saveDescription,
  setIsEditingDescription,
}: {
  isEditing: boolean;
  editingDescription: string;
  description: string;
  setDescriptionDraft: (v: string) => void;
  handleDescriptionKeyDown: (e: React.KeyboardEvent) => void;
  textareaRef: (el: HTMLTextAreaElement | null) => void;
  saveDescription: () => void;
  setIsEditingDescription: (v: boolean) => void;
}) {
  if (isEditing) {
    return (
      <TextareaAutosize
        ref={textareaRef}
        value={editingDescription}
        onChange={(e) => setDescriptionDraft(e.target.value)}
        onKeyDown={handleDescriptionKeyDown}
        onBlur={saveDescription}
        minRows={4}
        className="w-full rounded-md border border-task-panel-ring/30 bg-task-panel-hover/40 px-2 py-1.5 text-xs leading-5 text-content resize-none focus:outline-none focus:ring-1 focus:ring-accent"
        placeholder="Write a description in markdown..."
        aria-label="Edit task description"
      />
    );
  }

  return (
    <div
      className="rounded-md px-2 py-1.5 -mx-2 -my-1.5 cursor-text"
      onDoubleClick={() => setIsEditingDescription(true)}
      title="Double-click to edit"
    >
      {description ? (
        <div className="text-xs leading-5 text-content">
          <MarkdownWithBlankLines>{description}</MarkdownWithBlankLines>
        </div>
      ) : (
        <span className="text-xs italic text-content-tinted">
          Add a description
        </span>
      )}
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
