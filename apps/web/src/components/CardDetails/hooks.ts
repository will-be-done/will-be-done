import { useState, useCallback } from "react";

export function useTitleEditing({
  title,
  setIsEditingTitle,
  onSave,
}: {
  title: string;
  setIsEditingTitle: (v: boolean) => void;
  onSave: (trimmed: string) => void;
}) {
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const editingTitle = titleDraft ?? title;

  const saveTitle = useCallback(() => {
    if (titleDraft !== null) {
      const trimmed = titleDraft.trim();
      if (trimmed && trimmed !== title) {
        onSave(trimmed);
      }
      setTitleDraft(null);
    }
    setIsEditingTitle(false);
  }, [title, titleDraft, setIsEditingTitle, onSave]);

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveTitle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setTitleDraft(null);
      setIsEditingTitle(false);
    }
  };

  const textareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();
    el.selectionStart = el.value.length;
  }, []);

  return { editingTitle, setTitleDraft, saveTitle, handleTitleKeyDown, textareaRef };
}
