import { observer } from "mobx-react-lite";
import { useState } from "react";
import { getRootStore } from "../models/models";
import dayjs from "dayjs";

// Type definitions
type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

interface DateMap {
  [key: string]: string;
}

interface TaskDisplay {
  id: string;
  title: string;
  time: string;
}

export const DaysView = observer(() => {
  const rootStore = getRootStore();
  const { dailyListRegisry, taskRegistry } = rootStore;

  // State to track how many days to display (default: 7)
  const [daysToShow, setDaysToShow] = useState<number>(7);

  // State to track the starting day index
  const [startingDayIndex, setStartingDayIndex] = useState<number>(0);

  // All days of the week
  const allWeekdays: DayOfWeek[] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  // Get the visible days based on the starting day and number of days to show
  const getVisibleDays = (): DayOfWeek[] => {
    const days: DayOfWeek[] = [];
    for (let i = 0; i < daysToShow; i++) {
      const dayIndex = (startingDayIndex + i) % 7;
      days.push(allWeekdays[dayIndex]);
    }
    return days;
  };

  // Get visible days
  const visibleDays = getVisibleDays();

  // Handle previous day
  const handlePrevDay = (): void => {
    setStartingDayIndex((prevIndex) => (prevIndex - 1 + 7) % 7);
  };

  // Handle next day
  const handleNextDay = (): void => {
    setStartingDayIndex((prevIndex) => (prevIndex + 1) % 7);
  };

  // Function to check if a day column is today
  const isToday = (dayName: DayOfWeek): boolean => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday, etc.
    const dayMap: Record<DayOfWeek, number> = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 0,
    };
    return dayMap[dayName] === dayOfWeek;
  };

  // Generate dates for the current week based on the starting day
  const getCurrentWeekDates = (): DateMap => {
    const today = new Date();
    const dates: DateMap = {};

    // Find Monday of the current week
    const mondayOfWeek = new Date(today);
    const currentDayOfWeek = today.getDay() || 7; // Convert Sunday (0) to 7 for easier calculation
    mondayOfWeek.setDate(today.getDate() - (currentDayOfWeek - 1)); // Set to Monday of current week

    // Calculate the first day to show based on startingDayIndex
    const firstDayToShow = new Date(mondayOfWeek);
    firstDayToShow.setDate(mondayOfWeek.getDate() + startingDayIndex);

    // Generate dates for each visible day
    visibleDays.forEach((day, index) => {
      const date = new Date(firstDayToShow);
      date.setDate(firstDayToShow.getDate() + index);

      // Format as "Day - DD Mon"
      const formattedDate = `${day.slice(
        0,
        3
      )} - ${date.getDate()} ${date.toLocaleString("default", {
        month: "short",
      })}`;
      dates[day] = formattedDate;
    });

    return dates;
  };

  const weekDates = getCurrentWeekDates();

  // Get tasks for a specific day
  const getTasksForDay = (day: DayOfWeek): TaskDisplay[] => {
    const today = new Date();
    const mondayOfWeek = new Date(today);
    const currentDayOfWeek = today.getDay() || 7;
    mondayOfWeek.setDate(today.getDate() - (currentDayOfWeek - 1));

    const dayIndex = allWeekdays.indexOf(day);
    const targetDate = new Date(mondayOfWeek);
    targetDate.setDate(mondayOfWeek.getDate() + startingDayIndex + dayIndex);

    const dailyList = dailyListRegisry.getDailyListByDate(targetDate.valueOf());
    if (!dailyList) return [];

    return dailyList.projections
      .map((projection) => {
        const task = taskRegistry.entities.get(projection.taskRef.id);
        if (!task) return null;

        // For now, we'll use a placeholder title since we need to implement proper RemirrorJSON handling
        const title = "Task " + task.id;

        return {
          id: task.id,
          title,
          time: dayjs(targetDate).format("h:mm A"),
        };
      })
      .filter((task): task is TaskDisplay => task !== null);
  };

  return (
    <div className="w-full h-screen bg-gray-900 p-4">
      <div className="grid grid-cols-5 gap-4 h-full">
        {/* 80% section (4/5 columns) */}
        <div className="col-span-4 bg-gray-800 rounded-lg shadow-lg p-4 flex flex-col h-full border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center">
              <h2 className="text-xl font-bold text-gray-100">
                Weekly Todo Planner
              </h2>
              <button
                onClick={handlePrevDay}
                className="p-1 ml-4 bg-gray-700 rounded hover:bg-gray-600 transition-colors text-gray-300"
                aria-label="Previous day"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <button
                onClick={handleNextDay}
                className="p-1 ml-1 bg-gray-700 rounded hover:bg-gray-600 transition-colors text-gray-300"
                aria-label="Next day"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <div className="flex items-center space-x-1">
              {[1, 2, 3, 4, 5, 6, 7].map((dayCount) => (
                <button
                  key={dayCount}
                  onClick={() => setDaysToShow(dayCount)}
                  className={`w-6 h-6 flex items-center justify-center text-xs border ${
                    dayCount <= daysToShow
                      ? "bg-blue-600 border-blue-700 text-white"
                      : "bg-gray-700 border-gray-600 text-gray-300"
                  } rounded cursor-pointer hover:bg-gray-600 transition-colors`}
                >
                  {dayCount}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable 7-column grid (days of the week) */}
          <div className="overflow-auto flex-1 overflow-x-auto">
            <div
              className="grid"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${daysToShow}, minmax(200px, 1fr))`,
                gap: "12px",
                width: "auto",
                maxWidth: "100%",
              }}
            >
              {/* Days of the week columns */}
              {visibleDays.map((day) => (
                <div
                  key={day}
                  className={`flex flex-col min-w-[200px] ${
                    isToday(day) ? "bg-gray-750 rounded-t-lg" : ""
                  }`}
                >
                  {/* Day header */}
                  <div
                    className={`text-center font-bold pb-2 sticky top-0 bg-gray-800 border-b ${
                      isToday(day)
                        ? "text-blue-400 border-blue-500"
                        : "text-gray-200 border-gray-700"
                    }`}
                  >
                    <div>{weekDates[day]}</div>
                  </div>

                  {/* Tasks column */}
                  <div className="flex flex-col space-y-2 mt-2">
                    {getTasksForDay(day).map((task) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-lg border border-gray-700 bg-gray-750 shadow-md"
                      >
                        <div className="font-medium text-gray-200">
                          {task.title}
                        </div>
                        <div className="text-xs mt-1 text-gray-400">
                          {task.time}
                        </div>
                        <div className="flex items-center justify-end mt-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                            aria-label={`Mark ${task.title} as complete`}
                          />
                        </div>
                      </div>
                    ))}

                    {/* Add new task button for each day */}
                    <button className="mt-2 p-2 border border-dashed border-gray-600 rounded-lg text-gray-400 text-sm hover:bg-gray-700 transition">
                      + Add Task
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 20% section (1/5 columns) */}
        <div className="col-span-1 bg-gray-800 rounded-lg shadow-lg p-4 flex flex-col h-full border border-gray-700">
          <h2 className="text-xl font-bold mb-4 text-gray-100">
            Task Suggestions
          </h2>

          {/* Category selector */}
          <select
            className="w-full p-2 mb-4 border border-gray-700 rounded-md bg-gray-700 text-gray-200"
            value="This Week"
            aria-label="Select task category"
          >
            <option value="This Week">This Week</option>
            <option value="This Month">This Month</option>
            <option value="This Year">This Year</option>
            <option value="Daily">Daily</option>
            <option value="Overdue">Overdue</option>
          </select>

          {/* Task suggestions list */}
          <div className="flex-1 overflow-auto">
            <div className="space-y-3">
              {/* We'll implement task suggestions later */}
              <div className="text-gray-400 text-sm">
                No suggestions available
              </div>
            </div>
          </div>

          {/* Add new suggestion button */}
          <button className="w-full bg-blue-600 text-white py-2 px-4 rounded text-sm hover:bg-blue-500 transition mt-4">
            Create New Task
          </button>
        </div>
      </div>
    </div>
  );
});
