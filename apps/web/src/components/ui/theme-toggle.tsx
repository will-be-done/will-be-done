import { Monitor, Moon, Sun } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { type Theme, useTheme } from "@/components/ui/theme-provider";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-0.5 rounded-lg bg-overlay p-0.5 ring-1 ring-border",
        className,
      )}
      role="radiogroup"
      aria-label="Color theme"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors",
              selected
                ? "bg-panel text-content shadow-sm"
                : "text-content-tinted hover:text-content",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export const ThemeCycleButton = forwardRef<
  HTMLButtonElement,
  { className?: string }
>(function ThemeCycleButton({ className }, ref) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const nextTheme: Theme =
    theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const label =
    theme === "system"
      ? `Theme: system (${resolvedTheme})`
      : `Theme: ${theme}`;

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      onClick={() => setTheme(nextTheme)}
      className={cn(
        "shrink-0 cursor-pointer text-content-tinted/40 transition-colors hover:text-content",
        className,
      )}
    >
      {theme === "system" ? (
        <Monitor className="h-3.5 w-3.5" strokeWidth={1.6} />
      ) : resolvedTheme === "dark" ? (
        <Moon className="h-3.5 w-3.5" strokeWidth={1.6} />
      ) : (
        <Sun className="h-3.5 w-3.5" strokeWidth={1.6} />
      )}
    </button>
  );
});
