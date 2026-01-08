import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useDispatch } from "@will-be-done/hyperdb";
import {
  dailyListsSlice,
  dailyListTasksSlice,
  getDMY,
} from "@will-be-done/slices";

interface TaskDatePickerProps {
  taskId: string;
  currentDate: Date | undefined;
  trigger: React.ReactNode;
}

export function TaskDatePicker({
  taskId,
  currentDate,
  trigger,
}: TaskDatePickerProps) {
  const [open, setOpen] = useState(false);
  const dispatch = useDispatch();

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    // Format date to "yyyy-MM-dd" using getDMY utility
    const dateString = getDMY(date);

    // Create daily list if it doesn't exist
    const dailyList = dispatch(dailyListsSlice.createIfNotPresent(dateString));

    // Add task to the daily list
    dispatch(dailyListTasksSlice.addToDailyList(taskId, dailyList.id, "append"));

    // Close popover
    setOpen(false);
  };

  const handleClearDate = () => {
    dispatch(dailyListTasksSlice.removeFromDailyList(taskId));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-popover-calendar border-calendar-border" align="end">
        <div className="flex flex-col">
          <Calendar
            mode="single"
            selected={currentDate}
            onSelect={handleDateSelect}
            modifiers={{
              today: new Date(),
            }}
          />
          {currentDate && open && (
            <div className="p-3 border-t border-calendar-border">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearDate}
                className="w-full flex items-center justify-center gap-2 text-content bg-panel border-calendar-border hover:bg-panel-tinted hover:border-content-tinted"
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
