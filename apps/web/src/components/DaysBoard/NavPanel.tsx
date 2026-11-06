import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";
import { NavBar } from "../NavBar/NavBar";
import { SyncIndicator } from "@/components/Sidebar/SyncIndicator";
import { TooltipProvider } from "@/components/ui/tooltip";

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
  const spaceId = Route.useParams().spaceId;
  const navigate = useNavigate();
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Equal side columns keep the date centered; once it reaches the tabs, their
  // column grows and pushes it right. Below sm the date and sync take a second
  // row (the board's top padding matches).
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 grid grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-start gap-x-2 max-sm:grid-cols-[1fr_auto_1fr]">
      <div className="pointer-events-auto justify-self-start max-sm:col-span-3 [app-region:no-drag]">
        <NavBar spaceId={spaceId} />
      </div>

      <div className="pointer-events-auto max-sm:col-start-2 max-sm:mt-2 [app-region:no-drag]">
        <div className="bg-surface-elevated rounded-b-lg text-[13px] text-content flex items-center justify-center h-10 stroke-content ring-1 ring-ring px-3 w-60 max-sm:h-11 max-sm:w-auto max-sm:rounded-lg max-sm:px-0">
          <div className="flex items-center gap-2 max-sm:gap-0 h-full shrink-0">
            <Link
              to="/spaces/$spaceId/timeline/$date"
              params={{
                date: format(previousDate, "yyyy-MM-dd"),
                spaceId,
              }}
              className="cursor-pointer w-6 max-sm:w-11 flex items-center justify-center h-full text-content-tinted hover:text-primary transition-colors"
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
                <span className="font-medium cursor-pointer hover:text-primary transition-colors select-none w-24 text-center">
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
              className="cursor-pointer w-6 max-sm:w-11 flex items-center justify-center h-full text-content-tinted hover:text-primary transition-colors"
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
        </div>
      </div>

      <div className="pointer-events-auto justify-self-end mr-2 mt-2 max-sm:mt-4 [app-region:no-drag]">
        <TooltipProvider>
          <SyncIndicator />
        </TooltipProvider>
      </div>
    </div>
  );
};
