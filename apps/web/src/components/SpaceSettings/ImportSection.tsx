import { useState, useRef } from "react";
import { useAsyncDispatch } from "@will-be-done/hyperdb";
import { backupSlice, parseTickTickCSV } from "@will-be-done/slices/space";
import { Upload, Download, AlertTriangle, CheckCircle } from "lucide-react";
import { trpcClient } from "@/lib/trpc";

export function ImportSection() {
  const dispatch = useAsyncDispatch();
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

      try {
        const text = await file.text();
        const backup = parseTickTickCSV(text);
        void dispatch(backupSlice.loadBackup(backup));
        setTickTickSuccess(true);
      } catch {
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

      try {
        const backup = await trpcClient.importTodoist.mutate({
          apiToken: todoistToken.trim(),
        });
        void dispatch(backupSlice.loadBackup(backup));
        setTodoistSuccess(true);
        setTodoistToken("");
      } catch {
        setTodoistError(
          "Failed to import from Todoist. Check your API token and try again.",
        );
      } finally {
        setTodoistImporting(false);
      }
    })();
  };

  return (
    <div className="flex flex-col gap-3 px-5 py-5">
      {/* TickTick card */}
      <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/8 p-4">
        <div>
          <button
            onClick={() => tickTickInputRef.current?.click()}
            disabled={tickTickImporting}
            className="float-right ml-3 mb-1 flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/[0.07] px-3 py-2 text-[12px] font-medium text-content ring-1 ring-white/12 transition-all hover:bg-white/10 hover:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5 flex-shrink-0" />
            {tickTickImporting ? "Importing…" : "Upload CSV"}
          </button>
          <h3 className="text-[13px] font-semibold text-content">
            Import from TickTick
          </h3>
          <p className="text-[12px] text-content-tinted leading-relaxed mt-1">
            Upload a CSV file exported from TickTick.
          </p>
          <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-amber-400/80">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            <span>Replaces all existing data in this space</span>
          </div>
          {tickTickError && (
            <p className="mt-2 text-[11px] text-red-400">{tickTickError}</p>
          )}
          {tickTickSuccess && (
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-green-400">
              <CheckCircle className="h-3 w-3 flex-shrink-0" />
              <span>Imported successfully</span>
            </div>
          )}
        </div>
        <input
          ref={tickTickInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleTickTickImport}
        />
      </div>

      {/* Todoist card */}
      <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/8 p-4">
        <h3 className="text-[13px] font-semibold text-content">
          Import from Todoist
        </h3>
        <p className="text-[12px] text-content-tinted leading-relaxed mt-1">
          Connect using your Todoist API token. Find it in{" "}
          <a
            href="https://app.todoist.com/app/settings/integrations/developer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-content/70 underline underline-offset-2 hover:text-content transition-colors"
          >
            Integrations → Developer
          </a>
          .
        </p>
        <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-amber-400/80">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          <span>Replaces all existing data in this space</span>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <input
            type="password"
            value={todoistToken}
            onChange={(e) => setTodoistToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTodoistImport()}
            placeholder="Paste your API token…"
            className="flex-1 min-w-0 rounded-lg bg-white/[0.05] px-3 py-2 text-[12px] text-content placeholder:text-content-tinted/40 ring-1 ring-white/10 outline-none focus:ring-white/20 transition-all"
          />
          <button
            onClick={handleTodoistImport}
            disabled={todoistImporting || !todoistToken.trim()}
            className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-white/[0.07] px-3 py-2 text-[12px] font-medium text-content ring-1 ring-white/12 transition-all hover:bg-white/10 hover:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 flex-shrink-0" />
            {todoistImporting ? "Importing…" : "Import"}
          </button>
        </div>

        {todoistError && (
          <p className="mt-2 text-[11px] text-red-400">{todoistError}</p>
        )}
        {todoistSuccess && (
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-green-400">
            <CheckCircle className="h-3 w-3 flex-shrink-0" />
            <span>Imported successfully</span>
          </div>
        )}
      </div>
    </div>
  );
}
