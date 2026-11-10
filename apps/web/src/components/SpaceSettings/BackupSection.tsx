import { useState, useRef } from "react";
import { useDB } from "@will-be-done/hyperdb/react";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { format } from "date-fns";
import { Effect } from "effect";
import {
  createBackupArchive,
  InvalidBackupError,
  restoreBackupFile,
} from "@/store/attachments/backupArchive";
import { Database } from "@/store/database";
import {
  ReplaceWarning,
  SettingsGroup,
  SettingsRow,
  SuccessNote,
  settingsButtonClass,
} from "./SettingsUI";

export function BackupSection() {
  const db = useDB();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [exporting, setExporting] = useState(false);
  const runWithDB = <A, E>(effect: Effect.Effect<A, E, Database>) =>
    Effect.runPromise(effect.pipe(Effect.provide(Database.layer(db))));

  const handleExport = () => {
    void (async () => {
      setExporting(true);
      try {
        const { archive, missing } = await runWithDB(createBackupArchive);
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
        await runWithDB(restoreBackupFile(file));
        setImportSuccess(true);
      } catch (error) {
        console.error("Backup restore failed", error);
        setImportError(
          error instanceof InvalidBackupError
            ? "Failed to read the backup. Make sure it's a .zip or .json backup."
            : "Couldn't restore the backup.",
        );
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    })();
  };

  return (
    <SettingsGroup title="Backup">
      <SettingsRow
        title="Export backup"
        description="Download all your tasks, projects, templates, and files as a ZIP archive."
      >
        <button
          onClick={handleExport}
          disabled={exporting}
          className={settingsButtonClass}
        >
          <Download className="h-3.5 w-3.5 flex-shrink-0" />
          {exporting ? "Preparing…" : "Download"}
        </button>
      </SettingsRow>
      <SettingsRow
        title="Restore backup"
        description={
          <>
            Restore from a previously exported ZIP or JSON backup.
            <ReplaceWarning />
            {importError && (
              <p className="mt-2 text-[12px] text-red-400">{importError}</p>
            )}
            {importSuccess && <SuccessNote>Restored successfully</SuccessNote>}
          </>
        }
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className={settingsButtonClass}
        >
          <Upload className="h-3.5 w-3.5 flex-shrink-0" />
          {importing ? "Restoring…" : "Upload file"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          data-testid="backup-restore-input"
          accept=".zip,.json"
          className="hidden"
          onChange={handleImport}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
