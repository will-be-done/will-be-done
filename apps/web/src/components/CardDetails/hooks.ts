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
      e.stopPropagation();
      saveTitle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      saveTitle();
    }
  };

  const textareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();
    el.selectionStart = el.value.length;
  }, []);

  return { editingTitle, setTitleDraft, saveTitle, handleTitleKeyDown, textareaRef };
}

export function useDescriptionEditing({
  description,
  setIsEditingDescription,
  onSave,
}: {
  description: string;
  setIsEditingDescription: (v: boolean) => void;
  onSave: (nextDescription: string) => void;
}) {
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  const editingDescription = descriptionDraft ?? description;

  const saveDescription = useCallback(() => {
    if (descriptionDraft !== null) {
      const normalized = descriptionDraft.trim()
        ? descriptionDraft.trimEnd()
        : "";

      if (normalized !== description) {
        onSave(normalized);
      }

      setDescriptionDraft(null);
    }

    setIsEditingDescription(false);
  }, [description, descriptionDraft, onSave, setIsEditingDescription]);

  const handleDescriptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      saveDescription();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      saveDescription();
    }
  };

  const textareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();
    el.selectionStart = el.value.length;
  }, []);

  return {
    editingDescription,
    setDescriptionDraft,
    saveDescription,
    handleDescriptionKeyDown,
    textareaRef,
  };
}
