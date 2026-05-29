const syncClonedFormControls = (source: HTMLElement, clone: HTMLElement) => {
  const sourceControls = source.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");
  const clonedControls = clone.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");

  sourceControls.forEach((sourceControl, index) => {
    const clonedControl = clonedControls[index];
    if (!clonedControl) return;

    if (
      sourceControl instanceof HTMLTextAreaElement &&
      clonedControl instanceof HTMLTextAreaElement
    ) {
      clonedControl.value = sourceControl.value;
      clonedControl.textContent = sourceControl.value;
      return;
    }

    if (
      sourceControl instanceof HTMLInputElement &&
      clonedControl instanceof HTMLInputElement
    ) {
      clonedControl.value = sourceControl.value;

      if (sourceControl.type === "checkbox" || sourceControl.type === "radio") {
        clonedControl.checked = sourceControl.checked;
      }

      return;
    }

    if (
      sourceControl instanceof HTMLSelectElement &&
      clonedControl instanceof HTMLSelectElement
    ) {
      clonedControl.value = sourceControl.value;
    }
  });
};

export const createElementDragPreview = ({
  source,
  rect,
}: {
  source: HTMLElement;
  rect: DOMRect;
}) => {
  const preview = source.cloneNode(true) as HTMLElement;

  syncClonedFormControls(source, preview);
  preview.setAttribute("aria-hidden", "true");
  Object.assign(preview.style, {
    boxSizing: "border-box",
    width: `${rect.width}px`,
    minWidth: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    pointerEvents: "none",
    transform: "none",
  });

  return preview;
};
