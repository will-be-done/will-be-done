import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  Code,
  Heading2,
  Italic,
  List,
  ListOrdered,
  type LucideIcon,
  SquareCode,
  Strikethrough,
  TextQuote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ALT_KEY, MOD_KEY } from "./keys";

type ToolbarAction = {
  label: string;
  shortcut: string;
  icon: LucideIcon;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

const groups: ToolbarAction[][] = [
  [
    {
      label: "Bold",
      shortcut: `${MOD_KEY}+B`,
      icon: Bold,
      isActive: (editor) => editor.isActive("bold"),
      run: (editor) => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      shortcut: `${MOD_KEY}+I`,
      icon: Italic,
      isActive: (editor) => editor.isActive("italic"),
      run: (editor) => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Strikethrough",
      shortcut: `${MOD_KEY}+Shift+S`,
      icon: Strikethrough,
      isActive: (editor) => editor.isActive("strike"),
      run: (editor) => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: "Inline code",
      shortcut: `${MOD_KEY}+E`,
      icon: Code,
      isActive: (editor) => editor.isActive("code"),
      run: (editor) => editor.chain().focus().toggleCode().run(),
    },
  ],
  [
    {
      label: "Heading",
      shortcut: `${MOD_KEY}+${ALT_KEY}+2`,
      icon: Heading2,
      isActive: (editor) => editor.isActive("heading"),
      run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Bulleted list",
      shortcut: `${MOD_KEY}+Shift+8`,
      icon: List,
      isActive: (editor) => editor.isActive("bulletList"),
      run: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      shortcut: `${MOD_KEY}+Shift+7`,
      icon: ListOrdered,
      isActive: (editor) => editor.isActive("orderedList"),
      run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Quote",
      shortcut: `${MOD_KEY}+Shift+B`,
      icon: TextQuote,
      isActive: (editor) => editor.isActive("blockquote"),
      run: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Code block",
      shortcut: `${MOD_KEY}+${ALT_KEY}+C`,
      icon: SquareCode,
      isActive: (editor) => editor.isActive("codeBlock"),
      run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
  ],
];

const actions = groups.flat();

export function RichTextToolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      actions.map((action) => current.isFocused && action.isActive(current)),
    equalityFn: (a, b) => !!b && a.every((value, index) => value === b[index]),
  });

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="-mx-1 mb-1 flex flex-wrap items-center gap-0.5 border-b border-task-panel-ring/20 pb-1"
    >
      {groups.map((group, groupIndex) => (
        <div key={group[0]!.label} className="flex items-center gap-0.5">
          {groupIndex > 0 && (
            <span className="mx-1 h-4 w-px bg-task-panel-ring/30" />
          )}
          {group.map((action) => {
            const isActive = active[actions.indexOf(action)] ?? false;
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                tabIndex={-1}
                aria-label={action.label}
                aria-pressed={isActive}
                title={`${action.label} (${action.shortcut})`}
                // Keeps focus, and the selection, in the editor.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => action.run(editor)}
                className={cn(
                  "flex size-6 cursor-pointer items-center justify-center rounded text-content-tinted transition-colors hover:bg-task-panel-hover hover:text-content",
                  isActive && "bg-task-panel-hover text-content",
                )}
              >
                <Icon className="size-3.5" strokeWidth={2.2} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
