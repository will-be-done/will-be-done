import { cn } from "@/lib/utils.ts";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { useDaysPreferences } from "./hooks.tsx";
import { Route } from "@/routes/app.$vaultId.tsx";

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
  const vaultId = Route.useParams().vaultId;

  return (
    <div className="top-0 fixed m-auto left-0 right-0 max-w-xl z-40  ">
      <div className="bg-panel w-full mx-5 rounded-b-lg text-xs text-primary flex align-center content-center relative h-6 stroke-primary shadow-md ">
        <div className="absolute left-1/2 -translate-x-1/2 underline decoration-dotted flex items-center justify-items-center h-full">
          <Link
            to="/app/$vaultId/timeline/$date"
            params={{
              date: format(previousDate, "yyyy-MM-dd"),
              vaultId,
            }}
            className="cursor-pointer w-3 flex items-center justify-center h-full"
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
          {format(selectedDate, "dd MMM yyyy")}
          <Link
            to="/app/$vaultId/timeline/$date"
            params={{
              date: format(nextDate, "yyyy-MM-dd"),
              vaultId,
            }}
            search={{
              projectId: selectedProjectId,
            }}
            className="cursor-pointer w-3 flex items-center justify-center h-full"
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
        <div className="ml-auto mr-1 flex">
          {[1, 2, 3, 4, 5, 6, 7].map((dayCount) => (
            <button
              type="button"
              key={dayCount}
              onClick={() => setDaysWindow(dayCount)}
              className={cn(`cursor-pointer w-4 text-center `, {
                "font-bold text-accent": dayCount == daysToShow,
              })}
            >
              {dayCount}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
