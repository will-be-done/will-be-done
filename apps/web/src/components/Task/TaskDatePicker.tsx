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
import { useDispatch } from "@will-be-done/hyperdb-lib";
import {
  dailyListsSlice,
  dailyListsProjectionsSlice,
  getDMY,
} from "@will-be-done/slices/space";

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
  const dispatch = useDispatch();

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    // Format date to "yyyy-MM-dd" using getDMY utility
    const dateString = getDMY(date);

    // Create daily list if it doesn't exist
    const dailyList = dispatch(dailyListsSlice.createIfNotPresent(dateString));

    // Add task to the daily list
    dispatch(
      dailyListsProjectionsSlice.addToDailyList(taskId, dailyList.id, "append"),
    );

    // Close popover
    setIsOpen(false);
  };

  const handleClearDate = () => {
    dispatch(dailyListsProjectionsSlice.removeFromDailyList(taskId));
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
