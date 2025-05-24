import { useEffect, useRef } from "react";

export const usePrevious = <T>(value: T): T | undefined => {
  const ref = useRef<T>(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

export function useUnmount(func: () => void) {
  const funcRef = useRef(func);

  funcRef.current = func;

  useEffect(
    () => () => {
      funcRef.current();
    },
    [],
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const shouldNeverHappen = (msg?: string, ...args: any[]): never => {
   
  console.error(msg, ...args);
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-debugger
    debugger;
  }
  throw new Error(`This should never happen: ${msg}`);
};
