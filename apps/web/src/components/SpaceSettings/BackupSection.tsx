import { useState, useRef } from "react";
import { useDB } from "@will-be-done/hyperdb/react";
import { toast } from "sonner";
import { Download, Upload, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import {
  createBackupArchive,
  restoreBackupFile,
} from "@/store/attachments/backupArchive";

export function BackupSection() {
  const db = useDB();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const [exporting, setExporting] = useState(false);

  const handleExport = () => {
    void (async () => {
      setExporting(true);
      try {
        const { archive, missing } = await createBackupArchive(db);
        const url = URL.createObjectURL(archive);
        const a = document.createElement("a");
        const dateStr = format(new Date(), "yyyy-MM-dd");
        a.href = url;
        a.download = `backup-${dateStr}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        if (missing.length > 0) {
          toast(
            `${missing.length} ${missing.length === 1 ? "file was" : "files were"} not available and are missing from the backup`,
          );
        }
      } catch (error) {
        console.error("Backup export failed", error);
        toast("Couldn't create the backup");
      } finally {
        setExporting(false);
      }
    })();
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
        await restoreBackupFile(db, file);
        setImportSuccess(true);
      } catch {
        setImportError(
          "Failed to read the backup. Make sure it's a .zip or .json backup.",
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
            disabled={exporting}
            className="float-right ml-3 mb-1 flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/[0.07] px-3 py-2 text-[12px] font-medium text-content ring-1 ring-white/12 transition-all hover:bg-white/10 hover:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 flex-shrink-0" />
            {exporting ? "Preparing…" : "Download"}
          </button>
          <h3 className="text-[13px] font-semibold text-content">
            Export Backup
          </h3>
          <p className="text-[12px] text-content-tinted leading-relaxed mt-1">
            Download all your tasks, projects, templates, and files as a ZIP
            archive.
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
            Restore from a previously exported ZIP or JSON backup.
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
          data-testid="backup-restore-input"
          accept=".zip,.json"
          className="hidden"
          onChange={handleImport}
        />
      </div>
    </div>
  );
}
