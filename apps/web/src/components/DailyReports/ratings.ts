import type {
  DailyReport,
  DailyReportRating,
} from "@will-be-done/slices/space";

export type RatingKey = keyof Pick<
  DailyReport,
  "mood" | "energy" | "focus" | "accomplishment"
>;

export type RatingOption = {
  value: DailyReportRating;
  emoji: string;
  name: string;
};

export const RATING_SCALES: Record<
  RatingKey,
  { label: string; options: RatingOption[] }
> = {
  mood: {
    label: "Mood",
    options: [
      { value: 1, emoji: "😞", name: "Rough" },
      { value: 2, emoji: "🙁", name: "Low" },
      { value: 3, emoji: "😐", name: "Okay" },
      { value: 4, emoji: "🙂", name: "Good" },
      { value: 5, emoji: "😄", name: "Great" },
    ],
  },
  energy: {
    label: "Energy",
    options: [
      { value: 1, emoji: "😴", name: "Drained" },
      { value: 2, emoji: "😑", name: "Sluggish" },
      { value: 3, emoji: "🙂", name: "Steady" },
      { value: 4, emoji: "⚡", name: "Charged" },
      { value: 5, emoji: "🔥", name: "Buzzing" },
    ],
  },
  focus: {
    label: "Focus",
    options: [
      { value: 1, emoji: "😵‍💫", name: "Scattered" },
      { value: 2, emoji: "😶", name: "Foggy" },
      { value: 3, emoji: "👀", name: "Present" },
      { value: 4, emoji: "🎯", name: "Locked in" },
      { value: 5, emoji: "🧠", name: "Sharp" },
    ],
  },
  accomplishment: {
    label: "Accomplishment",
    options: [
      { value: 1, emoji: "😶", name: "Empty" },
      { value: 2, emoji: "😕", name: "Thin" },
      { value: 3, emoji: "👍", name: "Decent" },
      { value: 4, emoji: "💪", name: "Solid" },
      { value: 5, emoji: "🏆", name: "Nailed it" },
    ],
  },
};

export const RATING_KEYS = Object.keys(RATING_SCALES) as RatingKey[];

export const ratingOption = (
  key: RatingKey,
  value: DailyReportRating | undefined,
) => RATING_SCALES[key].options.find((option) => option.value === value);
