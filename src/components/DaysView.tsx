import { observer } from "mobx-react-lite";
import { useState, useEffect, useRef } from "react";
import { getRootStore } from "../models/models";
import { useMemo } from "react";
import { addDays, format, getDay, startOfDay, subDays } from "date-fns";
import { Task, TaskProjection, Project } from "../models/models";
import { taskRef, dailyListRef, projectRef } from "../models/models";

// All days of the week
const allWeekdays: string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const DaysView = observer(() => {
  const rootStore = getRootStore();
  const {
    dailyListRegisry,
    taskRegistry,
    taskProjectionRegistry,
    projectRegistry,
  } = rootStore;
  const [newTaskInput, setNewTaskInput] = useState<string>("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [daysToShow, setDaysToShow] = useState<number>(7);
  const [startingDate, setStartingDate] = useState<Date>(() =>
    startOfDay(new Date())
  );

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        return addDays(startingDate, i);
      }).filter((_, i) => i < daysToShow),
    [startingDate, daysToShow]
  );

  // Handle previous day
  const handlePrevDay = (): void => {
    setStartingDate((prevDate) => subDays(prevDate, 1));
  };

  // Handle next day
  const handleNextDay = (): void => {
    setStartingDate((prevDate) => addDays(prevDate, 1));
  };

  useEffect(() => {
    dailyListRegisry.createDailyListsIfNotExists(weekDays);
  }, [dailyListRegisry, weekDays]);

  const dailyLists = dailyListRegisry.getDailyListByDates(weekDays);

  const handleSaveTask = (dailyListId: string, taskId?: string) => {
    if (!newTaskInput.trim()) {
      setEditingTaskId(null);
      return;
    }

    if (taskId && taskId !== "new") {
      // Edit existing task
      const task = taskRegistry.entities.get(taskId);
      if (task) {
        task.setTitle(newTaskInput.trim());
      }
    } else {
      // Create inbox project if it doesn't exist
      let inboxProject = Array.from(projectRegistry.entities.values()).find(
        (p) => p.isInbox
      );
      if (!inboxProject) {
        inboxProject = new Project({ title: "Inbox", isInbox: true });
        projectRegistry.entities.set(inboxProject.id, inboxProject);
      }

      // Create new task
      const task = new Task({
        title: newTaskInput.trim(),
        projectRef: projectRef(inboxProject),
      });
      taskRegistry.entities.set(task.id, task);

      // Create task projection
      const projection = new TaskProjection({
        taskRef: taskRef(task),
        list: dailyListRef(dailyListRegisry.getDailyList(dailyListId)!),
        orderToken: String(Date.now()),
      });
      taskProjectionRegistry.entities.set(projection.id, projection);
    }

    setNewTaskInput("");
    setEditingTaskId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, dailyListId: string) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveTask(dailyListId, editingTaskId?.split(":")[0]);
    } else if (e.key === "Escape") {
      setEditingTaskId(null);
      setNewTaskInput("");
    }
  };

  const handleStartEditing = (
    taskId: string,
    title: string,
    dailyListId: string
  ) => {
    setEditingTaskId(`${taskId}:${dailyListId}`);
    setNewTaskInput(title);
  };

  useEffect(() => {
    if (editingTaskId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingTaskId]);

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
                className="p-1 ml-4 bg-gray-700 rounded hover:bg-gray-600 transition-colors text-gray-300 cursor-pointer"
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
                className="p-1 ml-1 bg-gray-700 rounded hover:bg-gray-600 transition-colors text-gray-300 cursor-pointer"
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
              {dailyLists.map((dailyList) => (
                <div
                  key={dailyList.id}
                  className={`flex flex-col min-w-[200px] ${
                    dailyList.isToday ? "bg-gray-750 rounded-t-lg" : ""
                  }`}
                >
                  {/* Day header */}
                  <div
                    className={`text-center font-bold pb-2 sticky top-0 bg-gray-800 border-b ${
                      dailyList.isToday
                        ? "text-blue-400 border-blue-500"
                        : "text-gray-200 border-gray-700"
                    }`}
                  >
                    <div>
                      {allWeekdays[getDay(dailyList.date)]} -{" "}
                      {format(dailyList.date, "dd MMM")}
                    </div>
                  </div>

                  {/* Tasks column */}
                  <div className="flex flex-col space-y-2 mt-2">
                    {dailyList.projections.map((proj) => {
                      const task = proj.taskRef.current;
                      const isEditing =
                        editingTaskId === `${task.id}:${dailyList.id}`;
                      const isSelected =
                        selectedTaskId === `${task.id}:${dailyList.id}`;

                      return (
                        <div
                          key={proj.id}
                          className={`p-3 rounded-lg border ${
                            isSelected
                              ? "border-blue-500 bg-gray-700"
                              : "border-gray-700 bg-gray-750"
                          } shadow-md transition-colors`}
                          onClick={() =>
                            setSelectedTaskId(`${task.id}:${dailyList.id}`)
                          }
                          onDoubleClick={() =>
                            handleStartEditing(
                              task.id,
                              task.title,
                              dailyList.id
                            )
                          }
                        >
                          {isEditing ? (
                            <textarea
                              ref={inputRef}
                              value={newTaskInput}
                              onChange={(e) => setNewTaskInput(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, dailyList.id)}
                              className="w-full bg-transparent text-gray-200 placeholder-gray-400 resize-none focus:outline-none"
                              rows={1}
                              aria-label="Edit task title"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center justify-end">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                                  aria-label={`Mark ${task.title} as complete`}
                                />
                              </div>
                              <div className="font-medium text-gray-200">
                                {task.title}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Add new task button and input */}
                    <div className="mt-2">
                      {editingTaskId === `new:${dailyList.id}` ? (
                        <textarea
                          ref={inputRef}
                          value={newTaskInput}
                          onChange={(e) => setNewTaskInput(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, dailyList.id)}
                          placeholder="Enter task title..."
                          className="w-full p-2 border border-gray-600 rounded-lg bg-gray-750 text-gray-200 placeholder-gray-400 resize-none focus:outline-none"
                          rows={1}
                        />
                      ) : (
                        <button
                          onClick={() =>
                            handleStartEditing("new", "", dailyList.id)
                          }
                          className="w-full p-2 border border-dashed border-gray-600 rounded-lg text-gray-400 text-sm hover:bg-gray-700 transition cursor-pointer"
                        >
                          + Add Task
                        </button>
                      )}
                    </div>
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
