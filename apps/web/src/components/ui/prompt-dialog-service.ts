export type PromptRequest =
  | {
      kind: "prompt";
      title: string;
      defaultValue?: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: "confirm";
      title: string;
      description?: string;
      confirmLabel: string;
      resolve: (confirmed: boolean) => void;
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
    mountedSetter({ kind: "prompt", title, defaultValue, resolve });
  });
}

// Drop-in replacement for `window.confirm()` with a destructive action.
export function confirmDialog({
  title,
  description,
  confirmLabel,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!mountedSetter) {
      resolve(
        window.confirm(description ? `${title}\n\n${description}` : title),
      );
      return;
    }
    mountedSetter({
      kind: "confirm",
      title,
      description,
      confirmLabel,
      resolve,
    });
  });
}
