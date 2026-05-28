import { useCallback, useEffect, useRef } from "react";
import { useDebouncedPersistedDraft } from "@/hooks/useDebouncedPersistedDraft";

export function useTitleEditing({
  title,
  setIsEditingTitle,
  onSave,
}: {
  title: string;
  setIsEditingTitle: (v: boolean) => void;
  onSave: (trimmed: string) => void;
}) {
  const persistTitle = useCallback(
    (nextTitle: string) => {
      const trimmed = nextTitle.trim();
      if (trimmed) {
        onSave(trimmed);
      }
    },
    [onSave],
  );

  const {
    draft: editingTitle,
    setDraft: setTitleDraft,
    flush: flushTitle,
  } = useDebouncedPersistedDraft({
    value: title,
    persist: persistTitle,
  });

  const saveTitle = useCallback(() => {
    flushTitle();
    setIsEditingTitle(false);
  }, [flushTitle, setIsEditingTitle]);

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
    if (!el || document.activeElement === el) return;
    el.focus();
  }, []);

  return {
    editingTitle,
    setTitleDraft,
    saveTitle,
    handleTitleKeyDown,
    textareaRef,
  };
}

export function useDescriptionEditing({
  description,
  isEditingDescription,
  setIsEditingDescription,
  onSave,
}: {
  description: string;
  isEditingDescription: boolean;
  setIsEditingDescription: (v: boolean) => void;
  onSave: (nextDescription: string) => void;
}) {
  const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    draft: editingDescription,
    setDraft: setDescriptionDraft,
    flush: flushDescription,
  } = useDebouncedPersistedDraft({
    value: description,
    persist: onSave,
  });

  const saveDescription = useCallback(() => {
    flushDescription();
    setIsEditingDescription(false);
  }, [flushDescription, setIsEditingDescription]);

  const handleDescriptionKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      saveDescription();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      const textarea = e.currentTarget;
      saveDescription();
      textarea.blur();
      window.requestAnimationFrame(() => {
        if (document.activeElement === textarea) {
          textarea.blur();
        }
      });
    }
  };

  const textareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    descriptionTextareaRef.current = el;
  }, []);

  useEffect(() => {
    if (!isEditingDescription) return;

    const textarea = descriptionTextareaRef.current;
    if (!textarea || document.activeElement === textarea) return;

    textarea.focus();
    textarea.selectionStart = textarea.value.length;
  }, [isEditingDescription]);

  return {
    editingDescription,
    setDescriptionDraft,
    saveDescription,
    handleDescriptionKeyDown,
    textareaRef,
  };
}
