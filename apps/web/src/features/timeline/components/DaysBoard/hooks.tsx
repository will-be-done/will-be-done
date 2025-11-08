import { getDMY } from "@will-be-done/slices";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type DaysPreferences = {
  daysWindow: number;
  daysShift: number;

  setDaysWindow: (value: number) => void;
  setDaysShift: (value: number) => void;
};

export const useCurrentDMY = () => {
  const [date, setDate] = useState(getDMY(new Date()));

  useEffect(() => {
    const interval = setInterval(() => {
      setDate(getDMY(new Date()));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return date;
};

export const useCurrentDate = () => {
  const [date, setDate] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setDate(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return date;
};

export const useDaysPreferences = create<DaysPreferences>()(
  persist(
    (set, get) => ({
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
