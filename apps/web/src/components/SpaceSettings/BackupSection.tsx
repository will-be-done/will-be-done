import { useState, useRef } from "react";
import { useDispatch } from "@will-be-done/hyperdb";
import { backupSlice } from "@will-be-done/slices/space";
import { Download, Upload, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";

export function BackupSection() {
  const dispatch = useDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const handleExport = () => {
    const backup = dispatch(backupSlice.getBackup());
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = format(new Date(), "yyyy-MM-dd");
    a.href = url;
    a.download = `backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    void (async () => {
      const file = e.target.files?.[0];
      if (!file) return;

      const confirmed = window.confirm(
        "This will replace all existing data in this space. Continue?",
      );
      if (!confirmed) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setImporting(true);
      setImportError(null);
      setImportSuccess(false);

      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as Parameters<
          typeof backupSlice.loadBackup
        >[0];
        dispatch(backupSlice.loadBackup(parsed));
        setImportSuccess(true);
      } catch {
        setImportError(
          "Failed to parse backup file. Make sure it's a valid JSON backup.",
        );
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    })();
  };

  return (
    <div className="flex flex-col gap-3 px-5 py-5">
      {/* Export card */}
      <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/8 p-4">
        <div>
          <button
            onClick={handleExport}
            className="float-right ml-3 mb-1 flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/[0.07] px-3 py-2 text-[12px] font-medium text-content ring-1 ring-white/12 transition-all hover:bg-white/10 hover:ring-white/20 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 flex-shrink-0" />
            Download
          </button>
          <h3 className="text-[13px] font-semibold text-content">
            Export Backup
          </h3>
          <p className="text-[12px] text-content-tinted leading-relaxed mt-1">
            Download all your tasks, projects, and templates as a JSON file.
          </p>
        </div>
      </div>

      {/* Import card */}
      <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/8 p-4">
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="float-right ml-3 mb-1 flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/[0.07] px-3 py-2 text-[12px] font-medium text-content ring-1 ring-white/12 transition-all hover:bg-white/10 hover:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5 flex-shrink-0" />
            {importing ? "Restoring…" : "Upload file"}
          </button>
          <h3 className="text-[13px] font-semibold text-content">
            Restore Backup
          </h3>
          <p className="text-[12px] text-content-tinted leading-relaxed mt-1">
            Restore from a previously exported JSON backup file.
          </p>
          <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-amber-400/80">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            <span>Replaces all existing data in this space</span>
          </div>
          {importError && (
            <p className="mt-2 text-[11px] text-red-400">{importError}</p>
          )}
          {importSuccess && (
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-green-400">
              <CheckCircle className="h-3 w-3 flex-shrink-0" />
              <span>Restored successfully</span>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </div>
    </div>
  );
}
