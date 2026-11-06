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
      // An accepted request mounts an autofocused editor; asking again after
      // the user has blurred it would reopen it.
      const accepted =
        item !== null &&
        !item.dispatchEvent(
          new CustomEvent("checklist-item-edit", { cancelable: true }),
        );
      if (!accepted && attempts > 0) {
        focusChecklistItem(itemId, { ...options, attempts: attempts - 1 });
      }
      return;
    }

    editor.focus();
  });
};
