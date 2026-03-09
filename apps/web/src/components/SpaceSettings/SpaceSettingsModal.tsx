import { useState, useRef } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { useDispatch } from "@will-be-done/hyperdb";
import { backupSlice } from "@will-be-done/slices/space";
import { Download, Upload, HardDrive, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Section = "data";

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  {
    id: "data",
    label: "Backup",
    icon: <HardDrive className="h-5 w-5" />,
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  spaceName: string;
}

function DataSection() {
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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  return (
    <div className="flex flex-col gap-5 px-6 py-7 sm:px-8">
      {/* Export */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold text-content mb-1.5">
            Export Backup
          </h3>
          <p className="text-[13px] text-content-tinted leading-relaxed">
            Download all your tasks, projects, and templates as a JSON file.
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex cursor-pointer items-center gap-1.5 self-start sm:self-auto rounded-lg bg-panel px-3 py-2 text-[12px] font-medium text-content-tinted ring-1 ring-white/10 transition-all hover:text-content hover:ring-white/20 whitespace-nowrap"
        >
          <Download className="h-3.5 w-3.5 flex-shrink-0" />
          Download backup
        </button>
      </div>

      <div className="h-px bg-dialog-border" />

      {/* Import */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold text-content mb-1.5">
            Import Backup
          </h3>
          <p className="text-[13px] text-content-tinted leading-relaxed">
            Restore from a backup file. This will{" "}
            <span className="text-notice font-medium">
              replace all existing data
            </span>{" "}
            in this space.
          </p>
          {importError && (
            <p className="mt-2 text-[12px] text-red-400">{importError}</p>
          )}
          {importSuccess && (
            <p className="mt-2 text-[12px] text-green-400">
              Imported successfully.
            </p>
          )}
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="flex cursor-pointer items-center gap-1.5 self-start sm:self-auto rounded-lg bg-panel px-3 py-2 text-[12px] font-medium text-content-tinted ring-1 ring-white/10 transition-all hover:text-content hover:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Upload className="h-3.5 w-3.5 flex-shrink-0" />
          {importing ? "Importing…" : "Upload file"}
        </button>
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

export function SpaceSettingsModal({ open, onClose, spaceName }: Props) {
  const [activeSection, setActiveSection] = useState<Section>("data");

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-6">
        <DialogPanel className="w-full max-w-[680px] flex flex-col max-h-[90vh] overflow-hidden rounded-2xl bg-dialog-bg ring-1 ring-dialog-border shadow-[0_32px_80px_rgba(0,0,0,0.85)]">
          {/* Header row: title + space name + close */}
          <div className="flex items-center justify-between px-6 pt-5 pb-0">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[14px] font-semibold text-content">
                Settings
              </h2>
              <span className="text-[12px] text-content-tinted">
                · {spaceName}
              </span>
            </div>
            <button
              onClick={onClose}
              className="cursor-pointer rounded-lg p-1.5 text-content-tinted/50 transition-colors hover:text-content hover:bg-white/8"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Top tab nav */}
          <div className="flex gap-1 overflow-x-auto px-4 pt-4 pb-0 scrollbar-none">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 px-5 py-3 rounded-xl cursor-pointer transition-colors min-w-[72px] flex-shrink-0",
                  activeSection === s.id
                    ? "bg-dialog-item-active text-content"
                    : "text-content-tinted/60 hover:text-content-tinted hover:bg-white/5",
                )}
              >
                {s.icon}
                <span className="text-[11px] font-medium leading-none">
                  {s.label}
                </span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="mx-0 mt-3 h-px bg-dialog-border" />

          {/* Content — flex-1 so it fills remaining height, scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeSection === "data" && <DataSection />}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
