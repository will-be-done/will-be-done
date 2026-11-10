import { useState } from "react";

export function BriefDescriptionField({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  return (
    <label className="block space-y-1.5 text-xs text-content-tinted">
      <span className="font-medium">Brief description</span>
      <textarea
        aria-label="Brief description"
        rows={2}
        placeholder="Add a short summary to show on cards…"
        value={editing ? draft : (value ?? "")}
        onFocus={() => {
          setDraft(value ?? "");
          setEditing(true);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={() => setEditing(false)}
        className="block w-full resize-y rounded-md border border-task-panel-divider bg-task-panel-hover px-2.5 py-2 text-sm text-content placeholder:text-content-tinted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <span className="block text-[10px] text-content-tinted/70">
        Shown on cards. Saves automatically.
      </span>
    </label>
  );
}
