import React, { useEffect, useMemo } from "react";
import { RefreshCw, Bell, Calendar } from "lucide-react";
import { RRule, Frequency, Weekday, Options } from "rrule";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { useUnmount } from "@/utils";
import { useDispatch } from "@will-be-done/hyperdb";
import { focusSlice2 } from "@/store2/slices/focusSlice";

const repeatTypes = ["Daily", "Weekly", "Monthly", "Yearly"] as const;
type RepeatType = (typeof repeatTypes)[number];

const endTypes = ["Never", "After", "Date"] as const;
type EndType = (typeof endTypes)[number];

const dayNames = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const rruleWeekdays: Weekday[] = [
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
  RRule.SU,
];

function getFreq(type: RepeatType): Frequency {
  switch (type) {
    case "Daily":
      return RRule.DAILY;
    case "Weekly":
      return RRule.WEEKLY;
    case "Monthly":
      return RRule.MONTHLY;
    case "Yearly":
      return RRule.YEARLY;
  }
}

type RepeatConfigModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onOk?: (data: z.infer<typeof FormSchema>, rrule: RRule) => void;
};

const FormSchema = z.object({
  selectedType: z.enum(repeatTypes),
  repeatEvery: z.number().min(1),
  daysRepeat: z.array(z.number()),
  monthRepeat: z.string(),
  weekDays: z.array(z.number()),
  onlyAfterCompletion: z.boolean(),
  time: z.string(),
  time2: z.string().optional(),
  startDate: z.string(),
  endType: z.enum(endTypes),
  endAfter: z.number().min(1),
  endDate: z.string(),
});

const getRuleOptions = (values: z.infer<typeof FormSchema>) => {
  const {
    selectedType,
    repeatEvery,
    daysRepeat,
    monthRepeat,
    weekDays,
    time,
    startDate,
    endType,
    endAfter,
    endDate,
  } = values;
  const timeParts = time.split(":");
  const dtstart = new Date(startDate);
  const options: Partial<Options> = {
    freq: getFreq(selectedType),
    interval: repeatEvery,
    dtstart,
  };
  if (selectedType === "Weekly") {
    options.byweekday = weekDays
      .map((i: number) => rruleWeekdays[i])
      .filter((w: Weekday | undefined): w is Weekday => w !== undefined);
  }
  if (selectedType === "Monthly") {
    options.bymonthday = daysRepeat;
  }
  if (selectedType === "Yearly") {
    options.bymonth = [months.indexOf(monthRepeat) + 1];
    options.bymonthday = daysRepeat;
  }
  if (endType === "After") {
    options.count = endAfter;
  } else if (endType === "Date") {
    const until = new Date(endDate);
    until.setHours(23, 59, 59, 999);
    options.until = until;
  }
  const hour = parseInt(timeParts[0] || "0", 10);
  const minute = parseInt(timeParts[1] || "0", 10);
  options.byhour = [hour];
  options.byminute = [minute];
  return options;
};

export function RepeatConfigModal({
  isOpen,
  onClose,
  onOk,
}: RepeatConfigModalProps) {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(focusSlice2.disableFocus());
  }, [dispatch]);

  useUnmount(() => {
    dispatch(focusSlice2.enableFocus());
  });

  const form = useForm({
    defaultValues: {
      selectedType: "Daily" as RepeatType,
      repeatEvery: 1,
      daysRepeat: [13],
      monthRepeat: "August",
      weekDays: [5],
      onlyAfterCompletion: false,
      time: "13:00",
      startDate: new Date().toISOString().split("T")[0] as string,
      endType: "Never" as EndType,
      endAfter: 5,
      endDate: "2025-06-14",
    },
    onSubmit: async ({ value }) => {
      onOk?.(value, new RRule(getRuleOptions(value)));
      onClose();
    },
  });

  const getRuleText = (options: Partial<Options>) => {
    try {
      return new RRule(options).toText();
    } catch (e) {
      return "Invalid rule";
    }
  };

  const getNextTimes = (options: Partial<Options>) => {
    try {
      const rule = new RRule(options);
      if (options.until || options.count) {
        return rule
          .all()
          .slice(0, 3)
          .map((d) =>
            d.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          )
          .join("; ");
      }
      const today = new Date();
      const future = new Date();
      future.setFullYear(today.getFullYear() + 5);
      return rule
        .between(today, future)
        .slice(0, 3)
        .map((d) =>
          d.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
        )
        .join("; ");
    } catch {
      return "-";
    }
  };

  return (
    <Dialog static className="relative z-50" open={isOpen} onClose={onClose}>
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto flex w-full max-w-4xl flex-col rounded-2xl bg-gray-800 shadow-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
            className="flex overflow-hidden rounded-2xl"
          >
            {/* Sidebar */}
            <div className="flex flex-col w-40 bg-gray-900 py-6 px-2 gap-2 rounded-l-2xl">
              <form.Field
                name="selectedType"
                children={(field) => (
                  <>
                    {repeatTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`text-left px-4 py-2 rounded transition-colors ${field.state.value === type ? "bg-sky-900 text-sky-300" : "text-gray-200 hover:bg-gray-700"}`}
                        onClick={() => field.handleChange(type)}
                        aria-current={
                          field.state.value === type ? "page" : undefined
                        }
                      >
                        {type}
                      </button>
                    ))}
                  </>
                )}
              />
            </div>
            {/* Main */}
            <div className="flex-1 flex flex-col p-6 gap-4 text-gray-200">
              {/* Header */}
              <DialogTitle
                className="flex items-center gap-2 text-xl font-semibold mb-2"
                as="h3"
              >
                <span>Repeat</span>
                <RefreshCw className="w-5 h-5 text-sky-400" />
              </DialogTitle>
              {/* Repeat every */}
              <div className="flex items-center gap-2">
                <span>Repeat every</span>
                <form.Field
                  name="repeatEvery"
                  children={(field) => (
                    <input
                      type="number"
                      min={1}
                      value={field.state.value}
                      onChange={(e) =>
                        field.handleChange(Number(e.target.value))
                      }
                      className="w-12 px-2 py-1 rounded bg-gray-900 border border-gray-600 text-gray-200"
                      aria-label="Repeat every"
                      placeholder="1"
                    />
                  )}
                />
                <form.Field
                  name="selectedType"
                  children={(field) => (
                    <span>
                      {field.state.value === "Daily" && "d."}
                      {field.state.value === "Weekly" && "w."}
                      {field.state.value === "Monthly" && "m."}
                      {field.state.value === "Yearly" && "y."}
                    </span>
                  )}
                />
              </div>
              {/* Days repeat / Weekdays / Month/Year fields */}
              <form.Field
                name="selectedType"
                children={(selectedTypeField) => (
                  <>
                    {selectedTypeField.state.value === "Weekly" && (
                      <div className="flex gap-2 mt-2">
                        <span>Days repeat</span>
                        <div className="flex gap-1 ml-2">
                          <form.Field
                            name="weekDays"
                            children={(field) => (
                              <>
                                {dayNames.map((d, i) => (
                                  <button
                                    key={d}
                                    type="button"
                                    className={`px-2 py-1 rounded ${field.state.value.includes(i) ? "bg-sky-600 text-white" : "bg-gray-900 text-gray-200"}`}
                                    onClick={() => {
                                      const current = field.state.value;
                                      const next = current.includes(i)
                                        ? current.filter((w) => w !== i)
                                        : [...current, i];
                                      field.handleChange(next);
                                    }}
                                    aria-pressed={
                                      field.state.value.includes(i)
                                        ? "true"
                                        : "false"
                                    }
                                    aria-label={d}
                                  >
                                    {d}
                                  </button>
                                ))}
                              </>
                            )}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              />
              <form.Subscribe
                selector={(state) => state.values.selectedType}
                children={(selectedType) => (
                  <>
                    {selectedType === "Monthly" && (
                      <div className="flex items-center gap-2 mt-2">
                        <span>Days repeat</span>
                        <form.Field
                          name="daysRepeat"
                          children={(field) => (
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={field.state.value[0]}
                              onChange={(e) =>
                                field.handleChange([Number(e.target.value)])
                              }
                              className="w-12 px-2 py-1 rounded bg-gray-900 border border-gray-600 text-gray-200"
                              aria-label="Day of month"
                              placeholder="13"
                            />
                          )}
                        />
                        <span>day</span>
                        <button
                          type="button"
                          className="ml-2 px-2 py-1 rounded bg-sky-600 text-white hover:bg-sky-700"
                          aria-label="Add day"
                        >
                          +
                        </button>
                      </div>
                    )}
                    {selectedType === "Yearly" && (
                      <div className="flex items-center gap-2 mt-2">
                        <span>Days repeat</span>
                        <form.Field
                          name="daysRepeat"
                          children={(field) => (
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={field.state.value[0]}
                              onChange={(e) =>
                                field.handleChange([Number(e.target.value)])
                              }
                              className="w-12 px-2 py-1 rounded bg-gray-900 border border-gray-600 text-gray-200"
                              aria-label="Day of month"
                              placeholder="13"
                            />
                          )}
                        />
                        <span>day</span>
                        <form.Field
                          name="monthRepeat"
                          children={(field) => (
                            <select
                              value={field.state.value}
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
                              className="ml-2 px-2 py-1 rounded bg-gray-900 border border-gray-600 text-gray-200"
                              aria-label="Month"
                              title="Month"
                            >
                              {months.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          )}
                        />
                        <button
                          type="button"
                          className="ml-2 px-2 py-1 rounded bg-sky-600 text-white hover:bg-sky-700"
                          aria-label="Add day"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </>
                )}
              />
              {/* Only after completion */}
              <div className="flex items-center gap-2 mt-2">
                <form.Field
                  name="onlyAfterCompletion"
                  children={(field) => (
                    <>
                      <input
                        type="checkbox"
                        checked={field.state.value}
                        onChange={(e) => field.handleChange(e.target.checked)}
                        id="after-completion"
                        className="text-sky-600 focus:ring-sky-500"
                        aria-label="Create a new task only after completion of the previous one"
                      />
                      <label htmlFor="after-completion" className="select-none">
                        Create a new task only after completion of the previous
                        one
                      </label>
                    </>
                  )}
                />
              </div>
              {/* Time fields */}
              <div className="flex items-center gap-2 mt-2">
                <span>Time</span>
                <form.Field
                  name="time"
                  children={(field) => (
                    <input
                      type="time"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="px-2 py-1 rounded bg-gray-900 border border-gray-600 text-gray-200"
                      aria-label="Time"
                      placeholder="13:00"
                    />
                  )}
                />
              </div>
              {/* Start date */}
              <div className="flex items-center gap-2 mt-2">
                <span>Start</span>
                <form.Field
                  name="startDate"
                  children={(field) => (
                    <input
                      type="date"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="px-2 py-1 rounded bg-gray-900 border border-gray-600 text-gray-200"
                      aria-label="Start date"
                      placeholder="2025-06-14"
                    />
                  )}
                />
                <Calendar className="w-5 h-5 text-sky-400 ml-2" />
              </div>
              {/* End options */}
              <div className="flex items-center gap-4 mt-2">
                <form.Field
                  name="endType"
                  children={(field) => (
                    <>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          checked={field.state.value === "Never"}
                          onChange={() => field.handleChange("Never")}
                          className="text-sky-600 focus:ring-sky-500"
                          aria-label="Never end"
                        />{" "}
                        Never
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          checked={field.state.value === "After"}
                          onChange={() => field.handleChange("After")}
                          className="text-sky-600 focus:ring-sky-500"
                          aria-label="End after times"
                        />{" "}
                        After
                        <form.Field
                          name="endAfter"
                          children={(subField) => (
                            <input
                              type="number"
                              min={1}
                              value={subField.state.value}
                              onChange={(e) =>
                                subField.handleChange(Number(e.target.value))
                              }
                              className="w-12 px-2 py-1 rounded bg-gray-900 border border-gray-600 text-gray-200 ml-1"
                              disabled={field.state.value !== "After"}
                              aria-label="End after times"
                              placeholder="5"
                            />
                          )}
                        />
                        times
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          checked={field.state.value === "Date"}
                          onChange={() => field.handleChange("Date")}
                          className="text-sky-600 focus:ring-sky-500"
                          aria-label="End by date"
                        />{" "}
                        Date
                        <form.Field
                          name="endDate"
                          children={(subField) => (
                            <input
                              type="date"
                              value={subField.state.value}
                              onChange={(e) =>
                                subField.handleChange(e.target.value)
                              }
                              className="px-2 py-1 rounded bg-gray-900 border border-gray-600 text-gray-200 ml-1"
                              disabled={field.state.value !== "Date"}
                              aria-label="End date"
                              placeholder="2025-06-14"
                            />
                          )}
                        />
                      </label>
                    </>
                  )}
                />
              </div>
              {/* Summary */}
              <form.Subscribe
                selector={(state) => state.values}
                children={(values) => {
                  const options = getRuleOptions(values);
                  const ruleText = getRuleText(options);
                  const nextTimes = getNextTimes(options);
                  return (
                    <div className="bg-gray-900 rounded p-4 mt-4 text-sm">
                      <div>{ruleText}</div>
                      <div className="mt-1 text-sky-400">
                        Next time: {nextTimes}
                      </div>
                    </div>
                  );
                }}
              />
              {/* Buttons */}
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-sky-600 text-white font-semibold hover:bg-sky-700"
                >
                  Ok
                </button>
              </div>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
