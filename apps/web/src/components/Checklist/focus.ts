export const focusChecklistItem = (
  itemId: string,
  options?: { attempts?: number; root?: ParentNode | null },
) => {
  const attempts = options?.attempts ?? 12;
  const root = options?.root ?? document;

  window.requestAnimationFrame(() => {
    const item = root.querySelector<HTMLElement>(
      `[data-checklist-item-id="${CSS.escape(itemId)}"]`,
    );
    const editor = item?.querySelector<HTMLElement>("[contenteditable]");

    if (!editor) {
      item?.dispatchEvent(new CustomEvent("checklist-item-edit"));
      if (attempts > 0) {
        focusChecklistItem(itemId, { ...options, attempts: attempts - 1 });
      }
      return;
    }

    editor.focus();
  });
};
