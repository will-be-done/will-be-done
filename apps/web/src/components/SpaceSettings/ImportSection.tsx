import { useState, useRef } from "react";
import { useDB } from "@will-be-done/hyperdb/react";
import { parseTickTickCSV } from "@will-be-done/slices/space";
import { restoreSpaceBackup } from "@/store/undo";
import { Upload, Download } from "lucide-react";
import { trpcClient } from "@/lib/trpc";
import { captureWebAnalytics } from "@/lib/analytics";
import {
  ReplaceWarning,
  SettingsGroup,
  SettingsRow,
  SuccessNote,
  settingsButtonClass,
} from "./SettingsUI";

export function ImportSection() {
  const db = useDB();
  const tickTickInputRef = useRef<HTMLInputElement>(null);
  const [tickTickImporting, setTickTickImporting] = useState(false);
  const [tickTickError, setTickTickError] = useState<string | null>(null);
  const [tickTickSuccess, setTickTickSuccess] = useState(false);

  const [todoistToken, setTodoistToken] = useState("");
  const [todoistImporting, setTodoistImporting] = useState(false);
  const [todoistError, setTodoistError] = useState<string | null>(null);
  const [todoistSuccess, setTodoistSuccess] = useState(false);

  const handleTickTickImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    void (async () => {
      const file = e.target.files?.[0];
      if (!file) return;

      const confirmed = window.confirm(
        "This will replace all existing data in this space. Continue?",
      );
      if (!confirmed) {
        if (tickTickInputRef.current) tickTickInputRef.current.value = "";
        return;
      }

      setTickTickImporting(true);
      setTickTickError(null);
      setTickTickSuccess(false);
      captureWebAnalytics({
        name: "import_started",
        properties: { provider: "ticktick" },
      });

      try {
        const text = await file.text();
        const backup = parseTickTickCSV(text);
        await restoreSpaceBackup(db, backup);
        captureWebAnalytics({
          name: "import_completed",
          properties: {
            provider: "ticktick",
            task_count: backup.tasks.length,
          },
        });
        setTickTickSuccess(true);
      } catch {
        captureWebAnalytics({
          name: "import_failed",
          properties: { provider: "ticktick" },
        });
        setTickTickError(
          "Failed to parse TickTick CSV file. Make sure it's a valid TickTick export.",
        );
      } finally {
        setTickTickImporting(false);
        if (tickTickInputRef.current) tickTickInputRef.current.value = "";
      }
    })();
  };

  const handleTodoistImport = () => {
    void (async () => {
      if (!todoistToken.trim()) return;

      const confirmed = window.confirm(
        "This will replace all existing data in this space. Continue?",
      );
      if (!confirmed) return;

      setTodoistImporting(true);
      setTodoistError(null);
      setTodoistSuccess(false);
      captureWebAnalytics({
        name: "import_started",
        properties: { provider: "todoist" },
      });

      try {
        const backup = await trpcClient.importTodoist.mutate({
          apiToken: todoistToken.trim(),
        });
        await restoreSpaceBackup(db, backup);
        captureWebAnalytics({
          name: "import_completed",
          properties: {
            provider: "todoist",
            task_count: backup.tasks.length,
          },
        });
        setTodoistSuccess(true);
        setTodoistToken("");
      } catch {
        captureWebAnalytics({
          name: "import_failed",
          properties: { provider: "todoist" },
        });
        setTodoistError(
          "Failed to import from Todoist. Check your API token and try again.",
        );
      } finally {
        setTodoistImporting(false);
      }
    })();
  };

  return (
    <SettingsGroup title="Other apps">
      <SettingsRow
        title="TickTick"
        description={
          <>
            Upload a CSV file exported from TickTick.
            <ReplaceWarning />
            {tickTickError && (
              <p className="mt-2 text-[12px] text-red-400">{tickTickError}</p>
            )}
            {tickTickSuccess && (
              <SuccessNote>Imported successfully</SuccessNote>
            )}
          </>
        }
      >
        <button
          onClick={() => tickTickInputRef.current?.click()}
          disabled={tickTickImporting}
          className={settingsButtonClass}
        >
          <Upload className="h-3.5 w-3.5 flex-shrink-0" />
          {tickTickImporting ? "Importing…" : "Upload CSV"}
        </button>
        <input
          ref={tickTickInputRef}
          type="file"
          data-testid="ticktick-import-input"
          accept=".csv"
          className="hidden"
          onChange={handleTickTickImport}
        />
      </SettingsRow>
      <SettingsRow
        title="Todoist"
        description={
          <>
            Connect using your Todoist API token. Find it in{" "}
            <a
              href="https://app.todoist.com/app/settings/integrations/developer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-content/70 underline underline-offset-2 transition-colors hover:text-content"
            >
              Integrations → Developer
            </a>
            .
            <ReplaceWarning />
            {todoistError && (
              <p className="mt-2 text-[12px] text-red-400">{todoistError}</p>
            )}
            {todoistSuccess && <SuccessNote>Imported successfully</SuccessNote>}
          </>
        }
      >
        <div className="flex items-center gap-2 sm:w-80">
          <input
            type="password"
            value={todoistToken}
            onChange={(e) => setTodoistToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTodoistImport()}
            placeholder="Paste your API token…"
            className="min-w-0 flex-1 rounded-lg bg-white/[0.05] px-3 py-2 text-[13px] text-content outline-none ring-1 ring-white/10 transition-all placeholder:text-content-tinted/40 focus:ring-white/20"
          />
          <button
            onClick={handleTodoistImport}
            disabled={todoistImporting || !todoistToken.trim()}
            className={settingsButtonClass}
          >
            <Download className="h-3.5 w-3.5 flex-shrink-0" />
            {todoistImporting ? "Importing…" : "Import"}
          </button>
        </div>
      </SettingsRow>
    </SettingsGroup>
  );
}
