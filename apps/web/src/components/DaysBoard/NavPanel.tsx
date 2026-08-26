import { Link, useNavigate } from "@tanstack/react-router";
import { format, isSameDay, startOfWeek } from "date-fns";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";
import { useCurrentDate } from "./hooks.tsx";

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
  const today = useCurrentDate();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  const isCurrentWeek = isSameDay(selectedDate, currentWeekStart);

  return (
    <>
      <div className="top-0 fixed right-0 min-[650px]:left-0 min-[650px]:m-auto min-[650px]:max-w-72 z-40 [app-region:no-drag]">
        <div className="bg-surface-elevated rounded-bl-lg min-[650px]:rounded-b-lg text-[13px] text-content flex items-center justify-center h-10 stroke-content ring-1 ring-ring px-3">
          <div className="flex items-center gap-2 h-full shrink-0">
            <Link
              to="/spaces/$spaceId/timeline/$date"
              params={{
                date: format(previousDate, "yyyy-MM-dd"),
                spaceId,
              }}
              className="cursor-pointer w-6 flex items-center justify-center h-full text-content-tinted hover:text-primary transition-colors"
              aria-label="Previous week"
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
              className="cursor-pointer w-6 flex items-center justify-center h-full text-content-tinted hover:text-primary transition-colors"
              aria-label="Next week"
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
            {isCurrentWeek ? (
              <span className="text-content-tinted-2 select-none px-1">
                Today
              </span>
            ) : (
              <Link
                to="/spaces/$spaceId/timeline/$date"
                params={{
                  date: format(currentWeekStart, "yyyy-MM-dd"),
                  spaceId,
                }}
                search={{
                  projectId: selectedProjectId,
                }}
                className="cursor-pointer px-1 text-content-tinted hover:text-primary transition-colors"
                aria-label="This week"
              >
                Today
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
