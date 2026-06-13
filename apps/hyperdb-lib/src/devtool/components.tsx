import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { css, setup, styled } from "goober";
import type { SubscribableDB } from "../hyperdb/runtime/subscribable-db";
import {
  getTraceDBInfo,
  hyperDBTraceStore,
  safeSerialize,
  type MutationEvent,
  type RootTrace,
  type SelectCommandEvent,
  type TraceFrame,
  type TraceStatus,
} from "../hyperdb/tracing/store";

setup(React.createElement);

export type HyperDBDevtoolsPosition = "top" | "bottom" | "left" | "right";
export type HyperDBDevtoolsButtonPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
export type HyperDBDevtoolsTheme = "dark" | "light" | "system";

export type HyperDBDevtoolsProps = {
  db?: SubscribableDB;
  initialIsOpen?: boolean;
  position?: HyperDBDevtoolsPosition;
  buttonPosition?: HyperDBDevtoolsButtonPosition;
  maxTraces?: number;
  theme?: HyperDBDevtoolsTheme;
};

export type HyperDBDevtoolsPanelProps = {
  db?: SubscribableDB;
  maxTraces?: number;
  theme?: HyperDBDevtoolsTheme;
  position?: HyperDBDevtoolsPosition;
  embedded?: boolean;
  onClose?: () => void;
};

const storageKey = "hyperdb-devtools-open";
const unassignedDBId = "__hyperdb_unassigned__";

const readStoredOpenState = (initialIsOpen: boolean): boolean => {
  try {
    if (typeof globalThis.localStorage === "undefined") return initialIsOpen;
    const stored = globalThis.localStorage.getItem(storageKey);
    if (stored === null) return initialIsOpen;
    return stored === "true";
  } catch {
    return initialIsOpen;
  }
};

const writeStoredOpenState = (isOpen: boolean): void => {
  try {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.setItem(storageKey, String(isOpen));
  } catch {
    // Ignore storage failures so devtools can still mount in restricted contexts.
  }
};

const useTraces = (maxTraces: number): RootTrace[] => {
  useEffect(() => {
    hyperDBTraceStore.setMaxTraces(maxTraces);
  }, [maxTraces]);

  return useSyncExternalStore(
    hyperDBTraceStore.subscribe,
    hyperDBTraceStore.getSnapshot,
    hyperDBTraceStore.getSnapshot,
  );
};

type TraceDBOption = {
  id: string;
  label: string;
  traceCount: number;
};

const traceDBId = (trace: RootTrace): string =>
  trace.dbId ?? unassignedDBId;

const getTraceDBOptions = (traces: RootTrace[]): TraceDBOption[] => {
  const optionMap = new Map<string, TraceDBOption>();

  for (const trace of traces) {
    const id = traceDBId(trace);
    const existing = optionMap.get(id);

    if (existing) {
      existing.traceCount += 1;
      continue;
    }

    optionMap.set(id, {
      id,
      label: trace.dbLabel ?? "Unknown DB",
      traceCount: 1,
    });
  }

  return [...optionMap.values()];
};

const panelPositionStyle = (position: HyperDBDevtoolsPosition): string => {
  switch (position) {
    case "top":
      return "top:0;left:0;right:0;height:min(44vh,520px);border-bottom:1px solid var(--hdb-border);";
    case "left":
      return "top:0;bottom:0;left:0;width:min(620px,92vw);border-right:1px solid var(--hdb-border);";
    case "right":
      return "top:0;bottom:0;right:0;width:min(620px,92vw);border-left:1px solid var(--hdb-border);";
    case "bottom":
    default:
      return "left:0;right:0;bottom:0;height:min(46vh,560px);border-top:1px solid var(--hdb-border);";
  }
};

const buttonPositionStyle = (
  position: HyperDBDevtoolsButtonPosition,
): string => {
  switch (position) {
    case "top-left":
      return "top:16px;left:16px;";
    case "top-right":
      return "top:16px;right:16px;";
    case "bottom-left":
      return "bottom:16px;left:16px;";
    case "bottom-right":
    default:
      return "bottom:16px;right:16px;";
  }
};

type ShellStyleProps = {
  position: HyperDBDevtoolsPosition;
  embedded: boolean;
  theme: HyperDBDevtoolsTheme;
};

const ShellElement = (
  props: React.HTMLAttributes<HTMLElement> & ShellStyleProps,
) => {
  const { position, embedded, theme, ...domProps } = props;
  void position;
  void embedded;
  void theme;
  return <section {...domProps} />;
};

const ButtonElement = (
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    selected?: boolean;
    buttonPosition?: HyperDBDevtoolsButtonPosition;
    theme?: HyperDBDevtoolsTheme;
  },
) => {
  const { selected, buttonPosition, theme, ...domProps } = props;
  void selected;
  void buttonPosition;
  void theme;
  return <button {...domProps} />;
};

const SpanElement = (
  props: React.HTMLAttributes<HTMLSpanElement> & {
    tone?: "green" | "blue" | "red" | "amber" | "duration" | "rows";
  },
) => {
  const { tone, ...domProps } = props;
  void tone;
  return <span {...domProps} />;
};

const Shell = styled(ShellElement)<ShellStyleProps>`
  --hdb-bg: #111318;
  --hdb-panel: #171a22;
  --hdb-surface: #202432;
  --hdb-soft: #2a2f3e;
  --hdb-lift: #343a4d;
  --hdb-border: #343a46;
  --hdb-border-strong: #2f81f7;
  --hdb-text: #e4e7ec;
  --hdb-muted: #a7adba;
  --hdb-faint: #747b8b;
  --hdb-accent: #22c55e;
  --hdb-blue: #3b82f6;
  --hdb-warn: #f59e0b;
  --hdb-danger: #ef4444;
  --hdb-shadow: 0 -14px 44px rgba(0, 0, 0, 0.38);

  ${({ theme }) =>
    theme === "light"
      ? `
        --hdb-bg: #f8fafc;
        --hdb-panel: #ffffff;
        --hdb-surface: #f1f5f9;
        --hdb-soft: #e2e8f0;
        --hdb-lift: #cbd5e1;
        --hdb-border: #cbd5e1;
        --hdb-border-strong: #2563eb;
        --hdb-text: #0f172a;
        --hdb-muted: #475569;
        --hdb-faint: #64748b;
        --hdb-accent: #16a34a;
        --hdb-blue: #2563eb;
        --hdb-warn: #d97706;
        --hdb-danger: #dc2626;
        --hdb-shadow: 0 -14px 38px rgba(15, 23, 42, 0.14);
      `
      : ""}

  ${({ theme }) =>
    theme === "system"
      ? `
        @media (prefers-color-scheme: light) {
          --hdb-bg: #f8fafc;
          --hdb-panel: #ffffff;
          --hdb-surface: #f1f5f9;
          --hdb-soft: #e2e8f0;
          --hdb-lift: #cbd5e1;
          --hdb-border: #cbd5e1;
          --hdb-border-strong: #2563eb;
          --hdb-text: #0f172a;
          --hdb-muted: #475569;
          --hdb-faint: #64748b;
          --hdb-accent: #16a34a;
          --hdb-blue: #2563eb;
          --hdb-warn: #d97706;
          --hdb-danger: #dc2626;
          --hdb-shadow: 0 -14px 38px rgba(15, 23, 42, 0.14);
        }
      `
      : ""}

  ${({ embedded, position }) =>
    embedded
      ? "position:relative;width:100%;height:100%;border:1px solid var(--hdb-border);"
      : `position:fixed;z-index:2147483646;${panelPositionStyle(position)}`}
  display:grid;
  grid-template-columns: minmax(320px, 38%) minmax(0, 1fr);
  min-height: 280px;
  overflow: hidden;
  background: var(--hdb-bg);
  color: var(--hdb-text);
  box-shadow: var(--hdb-shadow);
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  font-size: 12px;
  letter-spacing: 0;
`;

const TraceList = styled("aside")`
  min-width: 0;
  border-right: 1px solid var(--hdb-border);
  background: var(--hdb-panel);
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const Toolbar = styled("div")`
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--hdb-border);
  background: var(--hdb-surface);
`;

const Title = styled("strong")`
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 12px;
  font-weight: 800;
  color: var(--hdb-text);
`;

const Mark = styled("span")`
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--hdb-blue);
`;

const ToolbarActions = styled("div")`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const TraceCount = styled("span")`
  height: 24px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--hdb-border);
  border-radius: 6px;
  padding: 0 8px;
  background: var(--hdb-panel);
  color: var(--hdb-muted);
  font:
    700 11px ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
`;

const Button = styled("button")`
  height: 24px;
  border: 1px solid var(--hdb-border);
  background: var(--hdb-panel);
  color: var(--hdb-text);
  font:
    700 11px ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
  border-radius: 6px;
  padding: 0 8px;
  cursor: pointer;
  transition:
    background 120ms ease,
    border-color 140ms ease,
    color 140ms ease;

  &:hover {
    border-color: var(--hdb-blue);
    background: var(--hdb-soft);
    color: var(--hdb-text);
  }

  &:focus-visible {
    outline: 2px solid var(--hdb-blue);
    outline-offset: 2px;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
  }
`;

const DBSelect = styled("select")`
  box-sizing: border-box;
  max-width: 150px;
  height: 24px;
  border: 1px solid var(--hdb-border);
  border-radius: 6px;
  padding: 0 24px 0 8px;
  background: var(--hdb-panel);
  color: var(--hdb-text);
  font:
    700 11px ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--hdb-blue);
    outline-offset: 2px;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
  }
`;

const ToggleButton = styled(ButtonElement)<{
  buttonPosition: HyperDBDevtoolsButtonPosition;
  theme: HyperDBDevtoolsTheme;
}>`
  --hdb-toggle-surface: #202432;
  --hdb-toggle-soft: #2a2f3e;
  --hdb-toggle-border: #343a46;
  --hdb-toggle-text: #e4e7ec;
  --hdb-toggle-blue: #3b82f6;

  ${({ theme }) =>
    theme === "light"
      ? `
        --hdb-toggle-surface:#ffffff;
        --hdb-toggle-soft:#f1f5f9;
        --hdb-toggle-border:#cbd5e1;
        --hdb-toggle-text:#0f172a;
        --hdb-toggle-blue:#2563eb;
      `
      : ""}

  ${({ theme }) =>
    theme === "system"
      ? `
        @media (prefers-color-scheme: light) {
          --hdb-toggle-surface:#ffffff;
          --hdb-toggle-soft:#f1f5f9;
          --hdb-toggle-border:#cbd5e1;
          --hdb-toggle-text:#0f172a;
          --hdb-toggle-blue:#2563eb;
        }
      `
      : ""}

  position:fixed;
  ${({ buttonPosition }) => buttonPositionStyle(buttonPosition)}
  z-index:2147483647;
  height: 34px;
  min-width: 50px;
  border: 1px solid var(--hdb-toggle-border);
  border-radius: 8px;
  background: var(--hdb-toggle-surface);
  color: var(--hdb-toggle-text);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.28);
  font:
    700 12px ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
  letter-spacing: 0;
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background 150ms ease;

  &:hover {
    border-color: var(--hdb-toggle-blue);
    background: var(--hdb-toggle-soft);
  }

  &:focus-visible {
    outline: 2px solid var(--hdb-toggle-blue);
    outline-offset: 2px;
    box-shadow:
      0 0 0 3px rgba(59, 130, 246, 0.16),
      0 8px 26px rgba(0, 0, 0, 0.28);
  }
`;

const Rows = styled("div")`
  overflow: auto;
  min-height: 0;
`;

const TraceRow = styled(ButtonElement)<{ selected: boolean }>`
  position: relative;
  appearance: none;
  box-sizing: border-box;
  width: 100%;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  height: 48px;
  padding: 6px 10px 6px 20px;
  border: 0;
  border-bottom: 1px solid var(--hdb-border);
  border-radius: 0;
  background: ${({ selected }) =>
    selected
      ? "color-mix(in srgb, var(--hdb-blue) 13%, var(--hdb-panel))"
      : "transparent"};
  color: var(--hdb-text);
  font: inherit;
  line-height: 1;
  text-align: left;
  cursor: pointer;
  outline: 0;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background: ${({ selected }) =>
      selected ? "var(--hdb-blue)" : "transparent"};
  }

  &:hover {
    background: ${({ selected }) =>
      selected
        ? "color-mix(in srgb, var(--hdb-blue) 13%, var(--hdb-panel))"
        : "var(--hdb-surface)"};
  }

  &:focus-visible {
    outline: 2px solid var(--hdb-blue);
    outline-offset: -2px;
    box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.16);
  }
`;

const RowName = styled("div")`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
`;

const RowMeta = styled("div")`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  color: var(--hdb-muted);
  font:
    10px ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
`;

const RowBody = styled("div")`
  min-width: 0;
  display: grid;
  gap: 3px;
  align-content: center;
`;

const RowTop = styled("div")`
  min-width: 0;
  display: flex;
  align-items: center;
`;

const RowStats = styled("div")`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
`;

const Badge = styled(SpanElement)<{
  tone?: "green" | "blue" | "red" | "amber";
}>`
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-height: 18px;
  padding: 0 6px;
  border-radius: 5px;
  border: 1px solid
    ${({ tone }) =>
      tone === "red"
        ? "var(--hdb-danger)"
        : tone === "amber"
          ? "var(--hdb-warn)"
          : tone === "blue"
            ? "var(--hdb-blue)"
            : "var(--hdb-accent)"};
  color: ${({ tone }) =>
    tone === "red"
      ? "var(--hdb-danger)"
      : tone === "amber"
        ? "var(--hdb-warn)"
        : tone === "blue"
          ? "var(--hdb-blue)"
          : "var(--hdb-accent)"};
  background: ${({ tone }) =>
    tone === "red"
      ? "color-mix(in srgb, var(--hdb-danger) 14%, transparent)"
      : tone === "amber"
        ? "color-mix(in srgb, var(--hdb-warn) 16%, transparent)"
        : tone === "blue"
          ? "color-mix(in srgb, var(--hdb-blue) 15%, transparent)"
          : "color-mix(in srgb, var(--hdb-accent) 14%, transparent)"};
  font:
    700 10px ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
  text-transform: uppercase;
`;

const KindBadge = styled(Badge)`
  width: 28px;
  height: 22px;
  min-height: 22px;
  padding: 0;
  line-height: 1;
`;

const DurationBadge = styled(Badge)`
  width: 72px;
  min-width: 72px;
  height: 24px;
  min-height: 24px;
  padding: 0 8px;
  line-height: 1;
`;

const HeaderBadges = styled("div")`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex: 0 0 auto;
`;

const Detail = styled("main")`
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--hdb-bg);
`;

const DetailHeader = styled("header")`
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--hdb-border);
  background: var(--hdb-panel);
`;

const DetailTitle = styled("div")`
  min-width: 0;
  display: grid;
  gap: 2px;

  strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    line-height: 1.2;
    font-weight: 750;
  }

  span {
    color: var(--hdb-muted);
    font:
      10px ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      monospace;
  }
`;

const Tabs = styled("div")`
  display: flex;
  gap: 4px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--hdb-border);
  background: var(--hdb-panel);
`;

const Tab = styled(ButtonElement)<{ selected: boolean }>`
  position: relative;
  height: 26px;
  padding: 0 10px;
  border: 1px solid
    ${({ selected }) => (selected ? "var(--hdb-border)" : "transparent")};
  border-radius: 6px;
  color: ${({ selected }) =>
    selected ? "var(--hdb-text)" : "var(--hdb-muted)"};
  background: ${({ selected }) =>
    selected ? "var(--hdb-surface)" : "transparent"};
  font:
    700 11px ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
  cursor: pointer;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease;

  &:hover {
    background: var(--hdb-surface);
    color: var(--hdb-text);
  }

  &:focus-visible {
    outline: 2px solid var(--hdb-blue);
    outline-offset: 2px;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
  }
`;

const Content = styled("div")`
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
`;

const Empty = styled("div")`
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--hdb-faint);
  font:
    800 11px ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
  text-transform: uppercase;
`;

const Grid = styled("div")`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
  gap: 8px;
`;

const ResultGrid = styled(Grid)`
  margin-top: 8px;
`;

const Stat = styled("div")`
  border: 1px solid var(--hdb-border);
  border-radius: 6px;
  padding: 7px 9px;
  background: var(--hdb-panel);

  span {
    display: block;
    color: var(--hdb-muted);
    font:
      800 9px ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      monospace;
    text-transform: uppercase;
  }

  strong {
    display: block;
    margin-top: 4px;
    color: var(--hdb-text);
    font:
      800 13px ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      monospace;
  }
`;

const DataBlock = styled("pre")`
  margin: 8px 0 0;
  padding: 8px 10px;
  border: 1px solid var(--hdb-border);
  border-radius: 6px;
  background: var(--hdb-panel);
  color: var(--hdb-text);
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font:
    11px/1.42 ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
`;

const EventBlock = styled("article")`
  border: 1px solid var(--hdb-border);
  border-radius: 6px;
  background: var(--hdb-panel);
  padding: 8px;
  margin-bottom: 8px;
`;

const EventHeader = styled("div")`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  color: var(--hdb-text);
  font:
    800 11px ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
`;

const TreeRow = styled("div")`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 6px;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: var(--hdb-bg);
  font:
    800 11px/1.35 ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;

  & + & {
    margin-top: 4px;
  }
`;

const TreeLabel = styled("span")`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TreeBadge = styled(SpanElement)<{ tone: "duration" | "rows" }>`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  min-height: 16px;
  padding: 0 5px;
  border-radius: 5px;
  border: 1px solid
    ${({ tone }) => (tone === "rows" ? "var(--hdb-accent)" : "var(--hdb-blue)")};
  color: ${({ tone }) =>
    tone === "rows" ? "var(--hdb-accent)" : "var(--hdb-blue)"};
  background: ${({ tone }) =>
    tone === "rows"
      ? "color-mix(in srgb, var(--hdb-accent) 12%, transparent)"
      : "color-mix(in srgb, var(--hdb-blue) 12%, transparent)"};
  font-size: 10px;
  line-height: 1.3;
  font-weight: 700;
`;

const frameIndent = css`
  margin-top: 4px;
  margin-left: 10px;
  padding-left: 9px;
  border-left: 1px solid var(--hdb-border);
`;

const statusTone = (status: TraceStatus): "green" | "red" | "amber" => {
  if (status === "error") return "red";
  if (status === "running") return "amber";
  return "green";
};

const traceKindLabel = (kind: RootTrace["kind"]): string => {
  if (kind === "selector") return "S";
  if (kind === "action") return "A";
  return "?";
};

const formatDuration = (durationMs?: number): string =>
  durationMs === undefined ? "..." : `${durationMs.toFixed(1)}ms`;

const formatTime = (time: number): string =>
  new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const renderSerialized = (value: unknown) => safeSerialize(value).text;

const conditionOperators = [
  ["eq", "="],
  ["gt", ">"],
  ["gte", ">="],
  ["lt", "<"],
  ["lte", "<="],
] as const;

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

const formatIdentifier = (identifier: string): string =>
  identifierPattern.test(identifier)
    ? identifier
    : `"${identifier.replace(/"/g, '""')}"`;

const formatLiteral = (value: unknown): string => {
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value === null) return "NULL";
  return `'${safeSerialize(value).text.replace(/'/g, "''")}'`;
};

const formatWhereClause = (
  clause: SelectCommandEvent["where"][number],
): string => {
  const conditions = conditionOperators.flatMap(([key, operator]) =>
    clause[key].map(
      ({ col, val }) =>
        `${formatIdentifier(col)} ${operator} ${formatLiteral(val)}`,
    ),
  );

  return conditions.join(" AND ");
};

export const formatSelectQuery = (event: SelectCommandEvent): string => {
  const whereGroups = event.where.map(formatWhereClause).filter(Boolean);
  const lines = [
    `SELECT ${formatIdentifier(event.index)}`,
    `FROM ${formatIdentifier(event.tableName)}`,
  ];

  if (whereGroups.length === 1) {
    lines.push(`WHERE ${whereGroups[0]}`);
  } else if (whereGroups.length > 1) {
    lines.push(
      `WHERE ${whereGroups.map((group) => `(${group})`).join(" OR ")}`,
    );
  }

  if (event.order !== undefined) {
    lines.push(
      `ORDER BY ${formatIdentifier(event.index)} ${event.order.toUpperCase()}`,
    );
  }

  if (event.limit !== undefined) {
    lines.push(`LIMIT ${event.limit}`);
  }

  return `${lines.join("\n")};`;
};

const formatRecordCount = (event: SelectCommandEvent): string => {
  if (event.status === "running") return "...";
  if (event.status === "error") return "error";
  return String(event.resultCount ?? 0);
};

type CallTreeOperation =
  | {
      kind: "frame";
      id: string;
      startedAt: number;
      order: number;
      frame: TraceFrame;
    }
  | {
      kind: "select";
      id: string;
      startedAt: number;
      order: number;
      event: SelectCommandEvent;
    }
  | {
      kind: "mutation";
      id: string;
      startedAt: number;
      order: number;
      event: MutationEvent;
    };

const idOrder = (id: string): number => {
  const match = /-(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
};

export const getCallTreeOperations = (
  frame: TraceFrame,
  trace: RootTrace,
): CallTreeOperation[] =>
  [
    ...trace.commandEvents
      .filter((event) => event.frameId === frame.id)
      .map((event) => ({
        kind: "select" as const,
        id: event.id,
        startedAt: event.startedAt,
        order: idOrder(event.id),
        event,
      })),
    ...trace.mutationEvents
      .filter((event) => event.frameId === frame.id)
      .map((event) => ({
        kind: "mutation" as const,
        id: event.id,
        startedAt: event.startedAt,
        order: idOrder(event.id),
        event,
      })),
    ...frame.children.map((child) => ({
      kind: "frame" as const,
      id: child.id,
      startedAt: child.startedAt,
      order: idOrder(child.id),
      frame: child,
    })),
  ].sort(
    (left, right) =>
      left.startedAt - right.startedAt || left.order - right.order,
  );

export const formatCallTreeOperation = (
  operation: CallTreeOperation,
): string => {
  if (operation.kind === "frame") {
    return `@${operation.frame.name}`;
  }

  if (operation.kind === "select") {
    return `select ${operation.event.tableName}.${operation.event.index}`;
  }

  return `${operation.event.kind} ${operation.event.tableName}`;
};

const callTreeOperationDuration = (operation: CallTreeOperation): string => {
  const durationMs =
    operation.kind === "frame"
      ? operation.frame.durationMs
      : operation.event.durationMs;

  if (durationMs === undefined) return "...";
  return Number.isInteger(durationMs)
    ? `${durationMs}ms`
    : `${durationMs.toFixed(1)}ms`;
};

const mutationRecordCount = (event: MutationEvent): number | undefined => {
  if (event.rows !== undefined) return event.rows.length;
  if (event.newValue !== undefined) return event.newValue.length;
  if (event.ids !== undefined) return event.ids.length;
  if (event.oldValue !== undefined) return event.oldValue.length;
  return undefined;
};

const callTreeOperationRecordCount = (
  operation: CallTreeOperation,
): number | undefined => {
  if (operation.kind === "frame") return undefined;
  if (operation.kind === "select") return operation.event.resultCount;
  return mutationRecordCount(operation.event);
};

const formatRowCount = (count: number): string =>
  `${count} ${count === 1 ? "row" : "rows"}`;

export const getCallTreeOperationBadges = (
  operation: CallTreeOperation,
): { text: string; tone: "duration" | "rows" }[] => {
  const badges: { text: string; tone: "duration" | "rows" }[] = [
    { text: callTreeOperationDuration(operation), tone: "duration" },
  ];
  const recordCount = callTreeOperationRecordCount(operation);

  if (recordCount !== undefined) {
    badges.push({ text: formatRowCount(recordCount), tone: "rows" });
  }

  return badges;
};

const EventData = ({
  event,
}: {
  event: SelectCommandEvent | MutationEvent;
}) => <DataBlock>{renderSerialized(event)}</DataBlock>;

const SelectEventData = ({ event }: { event: SelectCommandEvent }) => (
  <>
    <DataBlock>{formatSelectQuery(event)}</DataBlock>
    <ResultGrid>
      <Stat>
        <span>Records returned</span>
        <strong>{formatRecordCount(event)}</strong>
      </Stat>
    </ResultGrid>
  </>
);

const TraceOverview = ({ trace }: { trace: RootTrace }) => (
  <>
    <Grid>
      <Stat>
        <span>Duration</span>
        <strong>{formatDuration(trace.durationMs)}</strong>
      </Stat>
      <Stat>
        <span>Selects</span>
        <strong>{trace.commandEvents.length}</strong>
      </Stat>
      <Stat>
        <span>Mutations</span>
        <strong>{trace.mutationEvents.length}</strong>
      </Stat>
    </Grid>
    <DataBlock>
      {renderSerialized({ args: trace.args, error: trace.error })}
    </DataBlock>
  </>
);

const SelectEvents = ({ events }: { events: SelectCommandEvent[] }) => {
  if (events.length === 0) return <Empty>No selects</Empty>;

  return (
    <>
      {events.map((event) => (
        <EventBlock key={event.id}>
          <EventHeader>
            <span>
              {event.tableName}.{event.index}
            </span>
            <RowMeta>
              <span>{formatRecordCount(event)} rows</span>
              <Badge tone={statusTone(event.status)}>
                {formatDuration(event.durationMs)}
              </Badge>
            </RowMeta>
          </EventHeader>
          <SelectEventData event={event} />
        </EventBlock>
      ))}
    </>
  );
};

const MutationEvents = ({ events }: { events: MutationEvent[] }) => {
  if (events.length === 0) return <Empty>No mutations</Empty>;

  return (
    <>
      {events.map((event) => (
        <EventBlock key={event.id}>
          <EventHeader>
            <span>
              {event.kind} {event.tableName}
            </span>
            <Badge tone={statusTone(event.status)}>
              {formatDuration(event.durationMs)}
            </Badge>
          </EventHeader>
          <EventData event={event} />
        </EventBlock>
      ))}
    </>
  );
};

const CallTreeOperationView = ({
  operation,
  trace,
}: {
  operation: CallTreeOperation;
  trace: RootTrace;
}) => {
  const childOperations =
    operation.kind === "frame"
      ? getCallTreeOperations(operation.frame, trace)
      : [];
  const badges = getCallTreeOperationBadges(operation);

  return (
    <div>
      <TreeRow>
        <TreeLabel>{formatCallTreeOperation(operation)}</TreeLabel>
        {badges.map((badge) => (
          <TreeBadge key={badge.text} tone={badge.tone}>
            {badge.text}
          </TreeBadge>
        ))}
      </TreeRow>
      {childOperations.length > 0 && (
        <div className={frameIndent}>
          {childOperations.map((child) => (
            <CallTreeOperationView
              key={child.id}
              operation={child}
              trace={trace}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CallTree = ({ trace }: { trace: RootTrace }) => (
  <EventBlock>
    <CallTreeOperationView
      operation={{
        kind: "frame",
        id: trace.frames[0]!.id,
        startedAt: trace.frames[0]!.startedAt,
        order: idOrder(trace.frames[0]!.id),
        frame: trace.frames[0]!,
      }}
      trace={trace}
    />
  </EventBlock>
);

const TraceDetails = ({ trace }: { trace: RootTrace }) => {
  const [tab, setTab] = useState<"overview" | "data" | "mutations" | "tree">(
    "overview",
  );

  useEffect(() => {
    setTab("overview");
  }, [trace.id]);

  return (
    <Detail>
      <DetailHeader>
        <DetailTitle>
          <strong>{trace.name}</strong>
          <span>
            {trace.kind} / {formatTime(trace.startedAt)}
          </span>
        </DetailTitle>
        <HeaderBadges>
          <Badge tone={statusTone(trace.status)}>
            {formatDuration(trace.durationMs)}
          </Badge>
        </HeaderBadges>
      </DetailHeader>
      <Tabs>
        <Tab selected={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </Tab>
        <Tab selected={tab === "data"} onClick={() => setTab("data")}>
          Queries
        </Tab>
        <Tab selected={tab === "mutations"} onClick={() => setTab("mutations")}>
          Mutations
        </Tab>
        <Tab selected={tab === "tree"} onClick={() => setTab("tree")}>
          Call Tree
        </Tab>
      </Tabs>
      <Content>
        {tab === "overview" && <TraceOverview trace={trace} />}
        {tab === "data" && <SelectEvents events={trace.commandEvents} />}
        {tab === "mutations" && (
          <MutationEvents events={trace.mutationEvents} />
        )}
        {tab === "tree" && <CallTree trace={trace} />}
      </Content>
    </Detail>
  );
};

const DevtoolsPanelInner = ({
  db,
  maxTraces = 200,
  theme = "system",
  position = "bottom",
  embedded = false,
  onClose,
}: HyperDBDevtoolsPanelProps) => {
  const currentDBInfo = useMemo(() => (db ? getTraceDBInfo(db) : undefined), [
    db,
  ]);
  const traces = useTraces(maxTraces);
  const dbOptions = useMemo(() => getTraceDBOptions(traces), [traces]);
  const hasMultipleDBs = dbOptions.length > 1;
  const [selectedDBId, setSelectedDBId] = useState<string | undefined>(
    currentDBInfo?.id,
  );
  const [selectedTraceId, setSelectedTraceId] = useState<string | undefined>();
  const fallbackDBId =
    dbOptions.find((option) => option.id === currentDBInfo?.id)?.id ??
    dbOptions[0]?.id;
  const activeDBId =
    hasMultipleDBs && selectedDBId
      ? dbOptions.some((option) => option.id === selectedDBId)
        ? selectedDBId
        : fallbackDBId
      : hasMultipleDBs
        ? fallbackDBId
        : undefined;
  const visibleTraces = useMemo(
    () =>
      activeDBId
        ? traces.filter((trace) => traceDBId(trace) === activeDBId)
        : traces,
    [activeDBId, traces],
  );
  const selectedTrace = useMemo(
    () =>
      visibleTraces.find((trace) => trace.id === selectedTraceId) ??
      visibleTraces[0],
    [selectedTraceId, visibleTraces],
  );

  useEffect(() => {
    if (!hasMultipleDBs) return;
    if (activeDBId && activeDBId !== selectedDBId) {
      setSelectedDBId(activeDBId);
    }
  }, [activeDBId, hasMultipleDBs, selectedDBId]);

  useEffect(() => {
    if (!selectedTraceId) return;
    if (!visibleTraces.some((trace) => trace.id === selectedTraceId)) {
      setSelectedTraceId(undefined);
    }
  }, [selectedTraceId, visibleTraces]);

  const clearVisibleTraces = () => {
    if (hasMultipleDBs && activeDBId) {
      hyperDBTraceStore.clearDB(
        activeDBId === unassignedDBId ? undefined : activeDBId,
      );
      return;
    }

    hyperDBTraceStore.clear();
  };

  return (
    <Shell position={position} embedded={embedded} theme={theme}>
      <TraceList>
        <Toolbar>
          <Title>
            <Mark />
            HyperDB
          </Title>
          <ToolbarActions>
            {hasMultipleDBs ? (
              <DBSelect
                aria-label="HyperDB database"
                value={activeDBId}
                onChange={(event) => {
                  setSelectedDBId(event.currentTarget.value);
                  setSelectedTraceId(undefined);
                }}
              >
                {dbOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </DBSelect>
            ) : null}
            <TraceCount>{visibleTraces.length} traces</TraceCount>
            <Button onClick={clearVisibleTraces}>Clear</Button>
            {onClose ? (
              <Button aria-label="Close HyperDB Devtools" onClick={onClose}>
                Close
              </Button>
            ) : null}
          </ToolbarActions>
        </Toolbar>
        <Rows>
          {visibleTraces.length === 0 ? (
            <Empty>No traces</Empty>
          ) : (
            visibleTraces.map((trace) => (
              <TraceRow
                key={trace.id}
                selected={trace.id === selectedTrace?.id}
                onClick={() => setSelectedTraceId(trace.id)}
              >
                <KindBadge tone={trace.kind === "action" ? "green" : "blue"}>
                  {traceKindLabel(trace.kind)}
                </KindBadge>
                <RowBody>
                  <RowTop>
                    <RowName>{trace.name}</RowName>
                  </RowTop>
                  <RowStats>
                    <RowMeta>
                      <span>{trace.commandEvents.length} sel</span>
                      <span>{trace.mutationEvents.length} mut</span>
                      <span>{formatTime(trace.startedAt)}</span>
                    </RowMeta>
                  </RowStats>
                </RowBody>
                <DurationBadge tone={statusTone(trace.status)}>
                  {formatDuration(trace.durationMs)}
                </DurationBadge>
              </TraceRow>
            ))
          )}
        </Rows>
      </TraceList>
      {selectedTrace ? (
        <TraceDetails trace={selectedTrace} />
      ) : (
        <Empty>No traces</Empty>
      )}
    </Shell>
  );
};

const ContextPanel = (props: Omit<HyperDBDevtoolsPanelProps, "db">) => {
  return <DevtoolsPanelInner {...props} />;
};

export const HyperDBDevtoolsPanel = (props: HyperDBDevtoolsPanelProps) =>
  props.db ? (
    <DevtoolsPanelInner {...props} />
  ) : (
    <ContextPanel
      maxTraces={props.maxTraces}
      theme={props.theme}
      position={props.position}
      embedded={props.embedded}
      onClose={props.onClose}
    />
  );

export const HyperDBDevtools = ({
  db,
  initialIsOpen = false,
  position = "bottom",
  buttonPosition = "bottom-right",
  maxTraces = 200,
  theme = "system",
}: HyperDBDevtoolsProps) => {
  const [isOpen, setIsOpen] = useState(() =>
    readStoredOpenState(initialIsOpen),
  );

  useEffect(() => {
    writeStoredOpenState(isOpen);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <ToggleButton
        buttonPosition={buttonPosition}
        theme={theme}
        aria-label={isOpen ? "Close HyperDB Devtools" : "Open HyperDB Devtools"}
        onClick={() => setIsOpen((open) => !open)}
      >
        HDB
      </ToggleButton>
      {isOpen && (
        <HyperDBDevtoolsPanel
          db={db}
          maxTraces={maxTraces}
          theme={theme}
          position={position}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
};
