const pad = (value: number) => String(value).padStart(2, "0");

export const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const addDays = (date: string, days: number) => {
  const [year, month, day] = date.split("-").map(Number);
  return formatDate(new Date(year!, month! - 1, day! + days));
};

export const parseDate = (input: string, today: string) => {
  const value = input.trim().toLowerCase();
  if (value === "today") return today;
  if (value === "tomorrow") return addDays(today, 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return addDays(value, 0) === value ? value : undefined;
};

const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export const humanDate = (date: string, today: string) => {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  const [year, month, day] = date.split("-").map(Number);
  return monthFormat.format(new Date(year!, month! - 1, day!));
};
