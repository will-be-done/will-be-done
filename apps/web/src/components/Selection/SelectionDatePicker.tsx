import { X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";

export function SelectionDatePicker({
  open,
  onOpenChange,
  onSelectDate,
  onClearDate,
  onCloseAutoFocus,
  anchor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectDate: (date: Date) => void;
  onClearDate: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  anchor: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        className="z-[1100] w-auto p-0"
        align="end"
        onDoubleClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <Calendar
          mode="single"
          onSelect={(date) => {
            if (!date) return;
            onSelectDate(date);
            onOpenChange(false);
          }}
          modifiers={{ today: new Date() }}
        />
        <div className="p-3 border-t border-ring">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onClearDate();
              onOpenChange(false);
            }}
            className="w-full flex items-center justify-center gap-2 text-content bg-transparent border-ring hover:bg-panel-hover hover:text-primary"
          >
            <X className="h-4 w-4" />
            Clear Date
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
