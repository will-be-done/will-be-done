export const isInputElement = (activeElement: Element) => {
  return (
    (activeElement.tagName === "INPUT" &&
      "type" in activeElement &&
      (activeElement.type === "search" || activeElement.type === "text")) ||
    activeElement.tagName === "TEXTAREA" ||
    activeElement.tagName === "SELECT" ||
    // Cast to HTMLElement to access isContentEditable
    (activeElement instanceof HTMLElement
      ? activeElement.isContentEditable
      : false) ||
    activeElement.closest("label") ||
    activeElement.closest("[role='textbox']") ||
    // Focusable task cards take the task shortcuts.
    activeElement.closest("[role='button']:not([data-focusable-key])") ||
    activeElement.closest("[role='combobox']") ||
    activeElement.closest("[role='slider']") ||
    activeElement.closest("[role='checkbox']") ||
    activeElement.closest("[role='radio']") ||
    activeElement.closest("[role='switch']") ||
    activeElement.closest("[data-disable-task-shortcuts]") ||
    activeElement.closest("a[href]")
  );
};
