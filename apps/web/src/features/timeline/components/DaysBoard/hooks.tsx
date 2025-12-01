import { State } from "@/utils/State";
import { getDMY } from "@will-be-done/slices";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const dateState = new State(new Date());
setInterval(() => {
  dateState.set(new Date());
}, 60 * 1000);

export const useCurrentDMY = () => {
  const [date, setDate] = useState(() => getDMY(new Date()));

  useEffect(() => {
    dateState.subscribe((value) => {
      setDate(getDMY(value));
    });
  }, []);

  return date;
};

export const useCurrentDate = () => {
  const [date, setDate] = useState(() => new Date());

  useEffect(() => {
    dateState.subscribe((value) => {
      setDate(value);
    });
  }, []);

  return date;
};

export const useDaysPreferences = create<DaysPreferences>()(
  persist(
    (set) => ({
      daysWindow: 7,
      daysShift: 0,
      setDaysWindow: (value: number) => {
        set({ daysWindow: value });
      },
      setDaysShift: (value: number) => {
        set({ daysShift: value });
      },
    }),
    {
      name: "days-preferences",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export type DaysPreferences = {
  daysWindow: number;
  daysShift: number;

  setDaysWindow: (value: number) => void;
  setDaysShift: (value: number) => void;
};

export type HiddenDays = {
  hiddenDays: Record<string, boolean>;
  setHiddenDays: (value: Record<string, boolean>) => void;
  toggleIsHidden: (dailyListId: string) => void;
  setIsHidden: (dailyListId: string, value: boolean) => void;
};

export const useHiddenDays = create<HiddenDays>()(
  persist(
    (set) => ({
      hiddenDays: {},
      setHiddenDays: (value: Record<string, boolean>) => {
        set({ hiddenDays: value });
      },
      setIsHidden: (dailyListId: string, value: boolean) => {
        set((state) => {
          const newHiddenDays = { ...state.hiddenDays };
          newHiddenDays[dailyListId] = value;
          return { hiddenDays: newHiddenDays };
        });
      },
      toggleIsHidden: (dailyListId: string) => {
        set((state) => {
          const newHiddenDays = { ...state.hiddenDays };
          newHiddenDays[dailyListId] = !state.hiddenDays[dailyListId];
          return { hiddenDays: newHiddenDays };
        });
      },
    }),
    {
      name: "hidden-days",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
