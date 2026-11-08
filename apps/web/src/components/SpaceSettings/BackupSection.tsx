import { useState, useRef } from "react";
import { useAsyncDispatch, useDB } from "@will-be-done/hyperdb/react";
import { getSpaceBackup, loadSpaceBackup } from "@will-be-done/slices/space";
import { Download, Upload } from "lucide-react";
import { format } from "date-fns";
import { restoreSpaceBackup } from "@/store/undo";
import {
  ReplaceWarning,
  SettingsGroup,
  SettingsRow,
  SuccessNote,
  settingsButtonClass,
} from "./SettingsUI";

export function BackupSection() {
  const db = useDB();
  const dispatch = useAsyncDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const handleExport = () => {
    void (async () => {
      const backup = await dispatch(getSpaceBackup({}));
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = format(new Date(), "yyyy-MM-dd");
      a.href = url;
      a.download = `backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
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
        const text = await file.text();
        const parsed = JSON.parse(text) as Parameters<
          typeof loadSpaceBackup
        >[0]["backup"];
        await restoreSpaceBackup(db, parsed);
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
    <SettingsGroup title="JSON backup">
      <SettingsRow
        title="Export backup"
        description="Download all your tasks, projects, and templates as a JSON file."
      >
        <button onClick={handleExport} className={settingsButtonClass}>
          <Download className="h-3.5 w-3.5 flex-shrink-0" />
          Download
        </button>
      </SettingsRow>
      <SettingsRow
        title="Restore backup"
        description={
          <>
            Restore from a previously exported JSON backup file.
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
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
