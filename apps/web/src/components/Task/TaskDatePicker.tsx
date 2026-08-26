import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import {
  addToDailyList,
  createDailyListIfNotPresent,
  getDMY,
  removeFromDailyList,
} from "@will-be-done/slices/space";
import { differenceInCalendarDays } from "date-fns";
import { captureWebAnalytics } from "@/lib/analytics";

interface TaskDatePickerProps {
  taskId: string;
  currentDate: Date | undefined;
  trigger?: React.ReactNode;
  anchor?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function TaskDatePicker({
  taskId,
  currentDate,
  trigger,
  anchor,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: TaskDatePickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const setIsOpen = onOpenChange ?? setUncontrolledOpen;
  const dispatch = useAsyncDispatch();

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    void (async () => {
      const dateString = getDMY(date);

      const dailyList = await dispatch(
        createDailyListIfNotPresent({ date: dateString }),
      );

      await dispatch(
        addToDailyList({
          taskId: taskId,
          dailyListId: dailyList.id,
          position: "append",
        }),
      );
      captureWebAnalytics({
        name: "task_scheduled",
        properties: {
          days_ahead: differenceInCalendarDays(date, new Date()),
          scheduling_method: "date_picker",
        },
      });

      setIsOpen(false);
    })();
  };

  const handleClearDate = () => {
    void dispatch(removeFromDailyList({ taskId: taskId }));
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      {anchor && <PopoverAnchor asChild>{anchor}</PopoverAnchor>}
      <PopoverContent
        className="z-[1100] w-auto p-0"
        align="end"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="flex flex-col">
          <Calendar
            mode="single"
            selected={currentDate}
            onSelect={handleDateSelect}
            modifiers={{
              today: new Date(),
            }}
          />
          {currentDate && isOpen && (
            <div className="p-3 border-t border-ring">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearDate}
                className="w-full flex items-center justify-center gap-2 text-content bg-transparent border-ring hover:bg-panel-hover hover:text-primary"
              >
                <X className="h-4 w-4" />
                Clear Date
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
