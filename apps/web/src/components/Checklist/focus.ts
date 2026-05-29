export const focusChecklistItem = (
  itemId: string,
  options?: { caret?: "end"; attempts?: number; root?: ParentNode | null },
) => {
  const attempts = options?.attempts ?? 12;
  const root = options?.root ?? document;

  window.requestAnimationFrame(() => {
    const item = root.querySelector<HTMLElement>(
      `[data-checklist-item-id="${CSS.escape(itemId)}"]`,
    );
    const textarea = item?.querySelector<HTMLTextAreaElement>("textarea");

    if (!textarea) {
      item?.dispatchEvent(new CustomEvent("checklist-item-edit"));
      if (attempts > 0) {
        focusChecklistItem(itemId, { ...options, attempts: attempts - 1 });
      }
      return;
    }

    textarea.focus();

    if (options?.caret === "end") {
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    }
  });
};
