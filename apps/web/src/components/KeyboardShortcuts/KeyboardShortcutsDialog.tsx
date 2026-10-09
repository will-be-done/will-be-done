import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { Keyboard, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { useDevtoolsEnabled } from "@/lib/devtools";
import { useFocusStore } from "@/store/focusSlice";
import { isInputElement } from "@/utils/isInputElement";

const DESKTOP_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
const TOUCH_DEVICE_PATTERN = /Android|iPad|iPhone|iPod|Mobile|Tablet/i;

function isTabletOrPhone() {
  return (
    TOUCH_DEVICE_PATTERN.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function getHasDesktopPointer() {
  return !isTabletOrPhone() && window.matchMedia(DESKTOP_POINTER_QUERY).matches;
}

function subscribeToDesktopPointer(onChange: () => void) {
  const mediaQuery = window.matchMedia(DESKTOP_POINTER_QUERY);
  mediaQuery.addEventListener("change", onChange);

  return () => mediaQuery.removeEventListener("change", onChange);
}

function useHasDesktopPointer() {
  return useSyncExternalStore(
    subscribeToDesktopPointer,
    getHasDesktopPointer,
    () => false,
  );
}

type Shortcut = {
  bindings: string[][];
  description: string;
};

type ShortcutGroup = {
  title: string;
  description: string;
  shortcuts: Shortcut[];
};

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Global",
    description: "Available anywhere in a space",
    shortcuts: [
      { bindings: [["\\"]], description: "Toggle stash" },
      { bindings: [["V"]], description: "Toggle task details" },
      { bindings: [["P"]], description: "Toggle project view" },
      { bindings: [["Z"]], description: "Enter zen mode" },
      { bindings: [["?"]], description: "Show keyboard shortcuts" },
    ],
  },
  {
    title: "Focused task",
    description: "Actions for the selected task",
    shortcuts: [
      { bindings: [["I"], ["Enter"]], description: "Edit task" },
      { bindings: [["Esc"]], description: "Stop editing" },
      { bindings: [["J"], ["K"]], description: "Move between tasks" },
      { bindings: [["H"], ["L"]], description: "Move between columns" },
      {
        bindings: [
          ["Ctrl", "J"],
          ["Ctrl", "K"],
          ["Ctrl", "↓"],
          ["Ctrl", "↑"],
        ],
        description: "Move task up or down",
      },
      {
        bindings: [
          ["Ctrl", "H"],
          ["Ctrl", "L"],
          ["Ctrl", "←"],
          ["Ctrl", "→"],
        ],
        description: "Move task left or right",
      },
      { bindings: [["O"]], description: "Create task below" },
      { bindings: [["Shift", "O"]], description: "Create task above" },
      { bindings: [["Space"]], description: "Toggle task state" },
      { bindings: [["M"]], description: "Move to another project" },
      { bindings: [["Shift", "S"]], description: "Stash task" },
      { bindings: [["S"]], description: "Schedule date" },
      { bindings: [["T"]], description: "Schedule for today" },
      { bindings: [["R"]], description: "Reset schedule" },
      {
        bindings: [["D"], ["X"], ["Backspace"]],
        description: "Delete task",
      },
      { bindings: [["E"]], description: "Edit description" },
      { bindings: [["C"]], description: "Add checklist item" },
      { bindings: [["A"]], description: "Open action menu" },
    ],
  },
  {
    title: "Focused project",
    description: "Actions for the selected project",
    shortcuts: [
      { bindings: [["I"]], description: "Edit project" },
      { bindings: [["J"], ["K"]], description: "Move between projects" },
      {
        bindings: [["D"], ["X"], ["Backspace"]],
        description: "Delete project",
      },
    ],
  },
];

function Keycap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-white/12 bg-white/[0.055] px-1.5 py-1 font-sans text-[10px] font-semibold leading-none text-content shadow-[inset_0_-1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.35)]">
      {children}
    </kbd>
  );
}

function ShortcutBinding({
  bindings,
  align = "end",
}: Pick<Shortcut, "bindings"> & { align?: "start" | "end" }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${align === "start" ? "justify-start" : "justify-end"}`}
    >
      {bindings.map((binding, bindingIndex) => (
        <div className="flex items-center gap-1" key={binding.join("+")}>
          {bindingIndex > 0 && (
            <span className="mr-0.5 text-[9px] text-content-tinted-2">or</span>
          )}
          {binding.map((key, keyIndex) => (
            <div className="flex items-center gap-1" key={key}>
              {keyIndex > 0 && (
                <span className="text-[9px] text-content-tinted-2">+</span>
              )}
              <Keycap>{key}</Keycap>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ShortcutSection({ group }: { group: ShortcutGroup }) {
  return (
    <section className="overflow-hidden rounded-xl border border-dialog-border bg-white/[0.025]">
      <div className="border-b border-dialog-border px-4 py-3">
        <h3 className="text-[13px] font-semibold text-content">
          {group.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-content-tinted-2">
          {group.description}
        </p>
      </div>
      <dl className="divide-y divide-white/[0.045] px-4">
        {group.shortcuts.map((shortcut) => {
          const isLongBinding = shortcut.bindings.length > 3;

          return (
            <div
              className={`flex min-h-10 gap-4 py-2 ${isLongBinding ? "flex-col items-start gap-2" : "items-center justify-between"}`}
              key={`${group.title}-${shortcut.description}`}
            >
              <dt className="text-[12px] leading-snug text-content-tinted">
                {shortcut.description}
              </dt>
              <dd className="shrink-0">
                <ShortcutBinding
                  align={isLongBinding ? "start" : "end"}
                  bindings={shortcut.bindings}
                />
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export function KeyboardShortcutsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const hasDesktopPointer = useHasDesktopPointer();
  const devtoolsEnabled = useDevtoolsEnabled();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "?" ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.defaultPrevented ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }

      const target =
        event.target instanceof Element ? event.target : document.activeElement;
      if (target && isInputElement(target)) return;

      event.preventDefault();
      setIsOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    useFocusStore.getState().disableFocus();
    return () => useFocusStore.getState().enableFocus();
  }, [isOpen]);

  return (
    <>
      {hasDesktopPointer && !isOpen && (
        <button
          aria-keyshortcuts="?"
          aria-label="Show keyboard shortcuts"
          className={`fixed bottom-4 z-40 flex size-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-dialog-bg/90 text-[14px] font-semibold text-content-tinted shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-[color,background-color,border-color,transform] hover:scale-105 hover:border-blue-400/35 hover:bg-dialog-item-active hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 active:scale-95 motion-reduce:transition-none ${devtoolsEnabled ? "right-20" : "right-4"}`}
          onClick={() => setIsOpen(true)}
          title="Keyboard shortcuts (?)"
          type="button"
        >
          ?
        </button>
      )}

      <Dialog
        className="fixed inset-0 z-[10000]"
        onClose={() => setIsOpen(false)}
        open={isOpen}
      >
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-black/75 backdrop-blur-sm"
        />

        <div className="fixed inset-0 overflow-y-auto p-3 sm:p-6">
          <div className="flex min-h-full items-center justify-center">
            <DialogPanel className="relative flex max-h-[min(90vh,780px)] w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-dialog-border bg-dialog-bg shadow-[0_32px_90px_rgba(0,0,0,0.8)]">
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-dialog-border px-5 py-4 sm:px-6 sm:py-5">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300 shadow-[0_0_24px_rgba(59,130,246,0.12)]">
                    <Keyboard className="size-5" strokeWidth={1.8} />
                  </div>
                  <div>
                    <DialogTitle className="text-[15px] font-semibold text-content sm:text-base">
                      Keyboard shortcuts
                    </DialogTitle>
                    <p className="mt-1 text-[11px] text-content-tinted-2 sm:text-xs">
                      Keep your hands on the keyboard and your plans moving.
                    </p>
                  </div>
                </div>
                <button
                  aria-label="Close keyboard shortcuts"
                  className="cursor-pointer rounded-lg p-2 text-content-tinted-2 transition-colors hover:bg-white/[0.06] hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                  onClick={() => setIsOpen(false)}
                  type="button"
                >
                  <X className="size-4" />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
                <div className="grid items-start gap-3 md:grid-cols-2">
                  <div className="grid gap-3">
                    <ShortcutSection group={shortcutGroups[0]!} />
                    <ShortcutSection group={shortcutGroups[2]!} />
                  </div>
                  <ShortcutSection group={shortcutGroups[1]!} />
                </div>
              </div>

              <footer className="flex shrink-0 items-center justify-center gap-2 border-t border-dialog-border px-5 py-3 text-[10px] text-content-tinted-2">
                <Keycap>Esc</Keycap>
                <span>to close</span>
              </footer>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </>
  );
}
