import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { useDebouncedPersistedDraft } from "./useDebouncedPersistedDraft";

export async function checkDraftOwnership() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let current!: ReturnType<typeof useDebouncedPersistedDraft<string>>;
  let value = "Original";
  let sourceKey = "task-a";
  let rejectSave!: (error: Error) => void;
  const persist = () =>
    new Promise<void>((_resolve, reject) => {
      rejectSave = reject;
    });
  const snapshots: Record<string, { draft: string; displayed: string }> = {};

  function Harness({ value, sourceKey }: { value: string; sourceKey: string }) {
    const state = useDebouncedPersistedDraft({
      value,
      sourceKey,
      persist,
      delay: 60_000,
    });
    useLayoutEffect(() => {
      current = state;
    });
    return null;
  }

  const update = (callback: () => void) =>
    act(async () => {
      callback();
    });
  const render = () =>
    update(() => root.render(createElement(Harness, { value, sourceKey })));
  const snapshot = (name: string) => {
    snapshots[name] = {
      draft: current.draft,
      displayed: current.isDraftCurrent ? current.draft : value,
    };
  };

  try {
    await render();
    await update(() => current.setDraft("Edited"));
    await update(() => current.flush());
    snapshot("pending");

    value = "Edited";
    await render();
    snapshot("acknowledged");

    await update(() => current.setDraft("Unsaved"));
    value = "External update";
    await render();
    snapshot("external");

    // Reverting the source must not revive an invalidated draft.
    value = "Edited";
    await render();
    snapshot("externalReverted");

    await update(() => current.setDraft("Owned by task A"));
    snapshot("beforeTaskChange");
    sourceKey = "task-b";
    await render();
    snapshot("differentTaskSameTitle");

    await update(() => current.setDraft("Failed edit"));
    await update(() => current.flush());
    snapshot("beforeFailure");
    await act(async () => {
      rejectSave(new Error("Expected save failure"));
      await Promise.resolve();
    });
    snapshot("failed");

    await update(() => current.setDraft("Older edit"));
    await update(() => current.flush());
    const rejectOlderSave = rejectSave;
    await update(() => current.setDraft("Newer edit"));
    await update(() => current.flush());
    await act(async () => {
      rejectOlderSave(new Error("Expected older save failure"));
      await Promise.resolve();
    });
    snapshot("olderFailure");

    value = "Newer edit";
    await render();
    sourceKey = "task-c";
    value = "Task C title";
    await render();
    snapshot("differentTaskCleanDraft");
    return snapshots;
  } finally {
    await update(() => root.unmount());
    container.remove();
  }
}
