import { cn } from "@/lib/utils.ts";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { useDaysPreferences } from "./hooks.tsx";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";

export const NavPanel = ({
  previousDate,
  nextDate,
  selectedDate,
  selectedProjectId,
}: {
  previousDate: Date;
  nextDate: Date;
  selectedDate: Date;
  selectedProjectId: string;
}) => {
  const daysToShow = useDaysPreferences((state) => state.daysWindow);
  const setDaysWindow = useDaysPreferences((state) => state.setDaysWindow);
  const spaceId = Route.useParams().spaceId;
  const navigate = useNavigate();
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <div className="top-0 fixed m-auto left-0 right-0 max-w-xl z-40">
      <div className="bg-surface-elevated w-full mx-5 rounded-b-lg text-[13px] text-content flex items-center relative h-8 stroke-content ring-1 ring-ring">
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 h-full">
          <Link
            to="/spaces/$spaceId/timeline/$date"
            params={{
              date: format(previousDate, "yyyy-MM-dd"),
              spaceId,
            }}
            className="cursor-pointer w-6 flex items-center justify-center h-full text-content-tinted hover:text-primary transition-colors"
            aria-label="Previous day"
            search={{
              projectId: selectedProjectId,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              width="4"
              height="6"
              viewBox="0 0 4 6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 5.5.5 3 3 .5"
              />
            </svg>
          </Link>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <span className="font-medium cursor-pointer hover:text-primary transition-colors select-none">
                {format(selectedDate, "dd MMM yyyy")}
              </span>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    void navigate({
                      to: "/spaces/$spaceId/timeline/$date",
                      params: { spaceId, date: format(date, "yyyy-MM-dd") },
                      search: { projectId: selectedProjectId },
                    });
                    setCalendarOpen(false);
                  }
                }}
              />
            </PopoverContent>
          </Popover>
          <Link
            to="/spaces/$spaceId/timeline/$date"
            params={{
              date: format(nextDate, "yyyy-MM-dd"),
              spaceId,
            }}
            search={{
              projectId: selectedProjectId,
            }}
            className="cursor-pointer w-6 flex items-center justify-center h-full text-content-tinted hover:text-primary transition-colors"
            aria-label="Next day"
          >
            <svg
              width="4"
              height="6"
              viewBox="0 0 4 6"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M0.5 0.499999L3 3L0.5 5.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
        <div className="ml-auto mr-2 flex gap-0.5">
          {[1, 2, 3, 4, 5, 6, 7].map((dayCount) => (
            <button
              type="button"
              key={dayCount}
              onClick={() => setDaysWindow(dayCount)}
              className={cn(
                "cursor-pointer w-5 h-5 text-center rounded transition-all text-content-tinted hover:text-primary",
                {
                  "bg-accent text-white font-semibold": dayCount == daysToShow,
                },
              )}
            >
              {dayCount}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
