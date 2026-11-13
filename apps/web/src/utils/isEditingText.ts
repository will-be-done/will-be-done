// Unlike isInputElement, focused cards, links and buttons still get global
// shortcuts; only keys typed into text must win.
export const isEditingText = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);
