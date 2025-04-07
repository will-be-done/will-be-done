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
