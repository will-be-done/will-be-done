import { useState } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { HardDrive, X, ArrowDownToLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackupSection } from "./BackupSection";
import { ImportSection } from "./ImportSection";

type Section = "data" | "import";

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  {
    id: "data",
    label: "Backup",
    icon: <HardDrive className="h-5 w-5" />,
  },
  {
    id: "import",
    label: "Import",
    icon: <ArrowDownToLine className="h-5 w-5" />,
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  spaceName: string;
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
            {activeSection === "data" && <BackupSection />}
            {activeSection === "import" && <ImportSection />}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
