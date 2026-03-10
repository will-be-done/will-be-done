import { useState, useRef } from "react";
import { useDispatch } from "@will-be-done/hyperdb";
import { backupSlice, parseTickTickCSV } from "@will-be-done/slices/space";
import { Upload } from "lucide-react";

export function ImportSection() {
  const dispatch = useDispatch();
  const tickTickInputRef = useRef<HTMLInputElement>(null);
  const [tickTickImporting, setTickTickImporting] = useState(false);
  const [tickTickError, setTickTickError] = useState<string | null>(null);
  const [tickTickSuccess, setTickTickSuccess] = useState(false);

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
        dispatch(backupSlice.loadBackup(backup));
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

  return (
    <div className="flex flex-col gap-5 px-6 py-7 sm:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold text-content mb-1.5">
            Import from TickTick
          </h3>
          <p className="text-[13px] text-content-tinted leading-relaxed">
            Import tasks from a TickTick CSV export. This will{" "}
            <span className="text-notice font-medium">
              replace all existing data
            </span>{" "}
            in this space.
          </p>
          {tickTickError && (
            <p className="mt-2 text-[12px] text-red-400">{tickTickError}</p>
          )}
          {tickTickSuccess && (
            <p className="mt-2 text-[12px] text-green-400">
              Imported successfully.
            </p>
          )}
        </div>
        <button
          onClick={() => tickTickInputRef.current?.click()}
          disabled={tickTickImporting}
          className="flex cursor-pointer items-center gap-1.5 self-start sm:self-auto rounded-lg bg-panel px-3 py-2 text-[12px] font-medium text-content-tinted ring-1 ring-white/10 transition-all hover:text-content hover:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Upload className="h-3.5 w-3.5 flex-shrink-0" />
          {tickTickImporting ? "Importing…" : "Upload CSV"}
        </button>
        <input
          ref={tickTickInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleTickTickImport}
        />
      </div>
    </div>
  );
}
