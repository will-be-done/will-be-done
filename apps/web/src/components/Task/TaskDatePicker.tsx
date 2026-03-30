import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useAsyncDispatch } from "@will-be-done/hyperdb";
import {
  dailyListsSlice,
  dailyListsProjectionsSlice,
  getDMY,
} from "@will-be-done/slices/space";

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
  const dispatch = useAsyncDispatch();

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    // Format date to "yyyy-MM-dd" using getDMY utility
    const dateString = getDMY(date);

    // Create daily list if it doesn't exist, then add task to it
    void dispatch(dailyListsSlice.createIfNotPresent(dateString)).then(
      (dailyList) => {
        void dispatch(
          dailyListsProjectionsSlice.addToDailyList(
            taskId,
            dailyList.id,
            "append",
          ),
        );
      },
    );

    // Close popover
    setOpen(false);
  };

  const handleClearDate = () => {
    void dispatch(dailyListsProjectionsSlice.removeFromDailyList(taskId));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="end"
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
          {currentDate && open && (
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
