import { Clock, Hourglass } from "lucide-react";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import {
  isDailyOrCoarser,
  updateTemplate,
  type TaskTemplate,
} from "@will-be-done/slices/space";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { DurationInput, TimeInput } from "./TaskTimeInputs";

export function TemplateTimePicker({
  template,
  anchor,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  template: TaskTemplate;
  anchor: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const dispatch = useAsyncDispatch();
  const update = (changes: Partial<TaskTemplate>) =>
    void dispatch(updateTemplate({ id: template.id, template: changes }));

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        className="z-[1100] w-auto p-0"
        align="end"
        onDoubleClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="flex min-w-48 flex-col gap-1.5 px-3 py-2 text-xs text-content-tinted">
          {/* Sub-daily rules carry their own time in each occurrence. */}
          {isDailyOrCoarser(template.repeatRule) && (
            <label className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 shrink-0" />
                Time
              </span>
              <TimeInput
                time={template.time ?? null}
                onChange={(time) => update({ time })}
              />
            </label>
          )}
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <Hourglass className="h-3 w-3 shrink-0" />
              Duration
            </span>
            <DurationInput
              durationMinutes={template.durationMinutes ?? null}
              onChange={(durationMinutes) => update({ durationMinutes })}
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
