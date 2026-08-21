import { State } from "@/utils/State.ts";
import { getDMY } from "@will-be-done/slices/space";
import { useEffect, useState } from "react";

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
