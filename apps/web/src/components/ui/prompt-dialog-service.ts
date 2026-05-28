export type PromptRequest = {
  title: string;
  defaultValue?: string;
  resolve: (value: string | null) => void;
};

type PromptDialogSetter = (req: PromptRequest | null) => void;

let mountedSetter: PromptDialogSetter | null = null;

export function mountPromptDialog(setter: PromptDialogSetter) {
  mountedSetter = setter;

  return () => {
    if (mountedSetter === setter) {
      mountedSetter = null;
    }
  };
}

/**
 * Imperative prompt dialog — drop-in replacement for `window.prompt()`.
 *
 * Returns the entered string, or `null` if the user cancelled.
 */
export function promptDialog(
  title: string,
  defaultValue?: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!mountedSetter) {
      resolve(window.prompt(title, defaultValue));
      return;
    }
    mountedSetter({ title, defaultValue, resolve });
  });
}
