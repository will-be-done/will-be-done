import { Maximize, Minus, Plus } from "lucide-react";

const buttonClass =
  "flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-white/10 hover:text-content";

export function MindmapZoomControls({
  zoomPercent,
  onZoom,
  onReset,
  onFit,
}: {
  zoomPercent: number;
  onZoom: (factor: number) => void;
  onReset: () => void;
  onFit: () => void;
}) {
  return (
    <div
      className="absolute right-4 bottom-4 flex items-center gap-0.5 rounded-lg bg-task-dropdown p-0.5 text-content-tinted ring-1 ring-white/10"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Zoom out"
        className={buttonClass}
        onClick={() => onZoom(1 / 1.2)}
      >
        <Minus className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Reset zoom"
        className="h-7 w-12 cursor-pointer rounded-md text-[11px] tabular-nums hover:bg-white/10 hover:text-content"
        onClick={onReset}
      >
        {zoomPercent}%
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        className={buttonClass}
        onClick={() => onZoom(1.2)}
      >
        <Plus className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Fit to screen"
        className={buttonClass}
        onClick={onFit}
      >
        <Maximize className="size-3.5" />
      </button>
    </div>
  );
}
