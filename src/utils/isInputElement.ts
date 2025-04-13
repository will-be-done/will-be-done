export const isInputElement = (activeElement: Element) => {
  return (
    activeElement.tagName === "TEXTAREA" ||
    activeElement.tagName === "SELECT" ||
    // Cast to HTMLElement to access isContentEditable
    (activeElement instanceof HTMLElement
      ? activeElement.isContentEditable
      : false) ||
    activeElement.closest("label") ||
    activeElement.closest("[role='textbox']") ||
    activeElement.closest("[role='button']") ||
    activeElement.closest("[role='combobox']") ||
    activeElement.closest("[role='slider']") ||
    activeElement.closest("[role='checkbox']") ||
    activeElement.closest("[role='radio']") ||
    activeElement.closest("[role='switch']")
  );
};
