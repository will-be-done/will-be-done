import { AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const settingsButtonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-white/[0.06] px-3 py-2 text-[13px] font-medium text-content ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:ring-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

export function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-1 text-[14px] font-medium text-content-tinted/80">
        {title}
      </h2>
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-white/[0.025] ring-1 ring-white/[0.07]">
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <h3 className="text-[14px] font-medium text-content">{title}</h3>
        {description && (
          <div className="mt-1 text-[13px] leading-relaxed text-content-tinted/60">
            {description}
          </div>
        )}
      </div>
      {children && <div className="flex-shrink-0">{children}</div>}
    </div>
  );
}

export function SettingsSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "inline-flex h-6 w-11 cursor-pointer items-center rounded-full px-0.5 outline-none ring-1 transition-colors focus-visible:ring-2 focus-visible:ring-accent/50",
        checked
          ? "bg-accent ring-accent/30"
          : "bg-white/[0.07] ring-white/12 hover:bg-white/10 hover:ring-white/20",
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full transition-transform",
          checked
            ? "translate-x-6 bg-white"
            : "translate-x-0 bg-content-tinted/70",
        )}
      />
    </button>
  );
}

export function ReplaceWarning() {
  return (
    <span className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-400/80">
      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
      Replaces all existing data in this space
    </span>
  );
}

export function SuccessNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-2 flex items-center gap-1.5 text-[12px] text-green-400">
      <CheckCircle className="h-3 w-3 flex-shrink-0" />
      {children}
    </span>
  );
}
