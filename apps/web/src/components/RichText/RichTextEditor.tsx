import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";
import { Selection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  encodeRichTextDoc,
  loadRichTextDoc,
  richTextDocToMarkdown,
  seedRichTextDoc,
  type RichTextKind,
} from "@will-be-done/slices/common";
import { cn } from "@/lib/utils";
import { registerPendingDraftFlush } from "@/store/pendingDraftFlushes";
import { useUnmount } from "@/utils";
import { richTextExtensions } from "./extensions";
import { RichTextToolbar } from "./RichTextToolbar";

const SAVE_DELAY_MS = 200;
const storedUpdateOrigin = { source: "stored-doc" };

export type RichTextEditorHandle = {
  focusEnd: () => void;
  flush: () => void;
};

export type RichTextExitKey = "Enter" | "Escape";

export function RichTextEditor({
  ref,
  kind,
  doc,
  text,
  onSave,
  onExit,
  onFocus,
  onBlur,
  onEmptyBackspace,
  required = false,
  autoFocus = false,
  toolbar = false,
  placeholder = "",
  ariaLabel,
  className,
}: {
  ref?: Ref<RichTextEditorHandle>;
  kind: RichTextKind;
  // Stored Yjs state; the editor seeds one from `text` until it exists.
  doc: string | undefined;
  text: string;
  onSave: (doc: string) => void | Promise<void>;
  onExit?: (key: RichTextExitKey) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onEmptyBackspace?: () => void;
  // An emptied required field keeps its last saved value.
  required?: boolean;
  autoFocus?: boolean;
  toolbar?: boolean;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}) {
  const [ydoc] = useState(() =>
    loadRichTextDoc(doc ?? seedRichTextDoc(text, kind)),
  );
  const hasUnsavedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  const onExitRef = useRef(onExit);
  const onBlurRef = useRef(onBlur);
  const onEmptyBackspaceRef = useRef(onEmptyBackspace);
  useEffect(() => {
    onSaveRef.current = onSave;
    onExitRef.current = onExit;
    onBlurRef.current = onBlur;
    onEmptyBackspaceRef.current = onEmptyBackspace;
  });

  const flush = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
    if (!hasUnsavedRef.current) return;
    hasUnsavedRef.current = false;

    const encoded = encodeRichTextDoc(ydoc);
    if (required && !richTextDocToMarkdown(encoded, kind).trim()) return;
    const result = onSaveRef.current(encoded);
    if (result) {
      void result.catch((error: unknown) => {
        console.error("Failed to save rich text", error);
      });
    }
  }, [kind, required, ydoc]);

  useEffect(() => {
    const handleUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === storedUpdateOrigin) return;
      hasUnsavedRef.current = true;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(flush, SAVE_DELAY_MS);
    };
    ydoc.on("updateV2", handleUpdate);
    return () => ydoc.off("updateV2", handleUpdate);
  }, [flush, ydoc]);

  // Remote and other-tab edits merge into the open editor.
  useEffect(() => {
    if (doc) loadRichTextDoc(doc, ydoc, storedUpdateOrigin);
  }, [doc, ydoc]);

  useEffect(() => registerPendingDraftFlush(flush), [flush]);
  useUnmount(flush);

  const editor = useEditor(
    {
      extensions: richTextExtensions({ kind, doc: ydoc, placeholder }),
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: cn("rich-text focus:outline-none", className),
          role: "textbox",
          "aria-label": ariaLabel,
          ...(kind === "content" ? { "aria-multiline": "true" } : {}),
          spellcheck: "false",
          "data-gramm": "false",
          "data-gramm_editor": "false",
          "data-enable-grammarly": "false",
        },
        handleKeyDown: (view, event) => {
          const { doc: editorDoc } = view.state;
          if (
            event.key === "Backspace" &&
            onEmptyBackspaceRef.current &&
            editorDoc.childCount === 1 &&
            editorDoc.textContent === ""
          ) {
            event.preventDefault();
            event.stopPropagation();
            onEmptyBackspaceRef.current();
            return true;
          }
          const exitKey =
            event.key === "Escape"
              ? "Escape"
              : event.key === "Enter" &&
                  (kind === "title" ? !event.shiftKey : event.shiftKey)
                ? "Enter"
                : undefined;
          if (!exitKey || event.isComposing) return false;
          event.preventDefault();
          event.stopPropagation();
          flush();
          onExitRef.current?.(exitKey);
          return true;
        },
      },
      onFocus: () => onFocus?.(),
      onBlur: ({ editor: blurred }) => {
        flush();
        // Remounting the view (StrictMode, moving the editor) blurs it for a
        // moment; only a blur that is still in effect a tick later counts.
        setTimeout(() => {
          if (!blurred.isDestroyed && blurred.view.hasFocus()) return;
          onBlurRef.current?.();
        });
      },
    },
    [ydoc],
  );

  // Tiptap's focus command waits a frame: keys typed meanwhile reach the
  // global task shortcuts, and the late caret jump undoes arrow presses.
  const focusEnd = useCallback(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.focus();
    editor.view.dispatch(
      editor.state.tr.setSelection(Selection.atEnd(editor.state.doc)),
    );
  }, [editor]);

  useLayoutEffect(() => {
    if (autoFocus) focusEnd();
  }, [autoFocus, focusEnd]);

  useImperativeHandle(
    ref,
    () => ({
      focusEnd,
      flush,
    }),
    [flush, focusEnd],
  );

  return (
    <div
      className="min-w-0 flex-1"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {toolbar && editor && <RichTextToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
