import {
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useUnmount } from "@/utils";
import { registerPendingDraftFlush } from "@/store/pendingDraftFlushes";

const defaultIsEqual = <T>(left: T, right: T) => Object.is(left, right);

export function useDebouncedPersistedDraft<T>({
  value,
  persist,
  delay = 200,
  isEqual = defaultIsEqual<T>,
}: {
  value: T;
  persist: (value: T) => void;
  delay?: number;
  isEqual?: (left: T, right: T) => boolean;
}) {
  const [draft, setDraftState] = useState<T>(value);
  const [draftSource, setDraftSource] = useState<T>(value);
  const draftRef = useRef(value);
  const lastSavedRef = useRef(value);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!isEqual(draftSource, value)) {
    // Incoming source changes intentionally replace any unpersisted local draft.
    setDraftSource(value);
    setDraftState(value);
  }

  const clearSaveTimeout = useCallback(() => {
    if (!saveTimeoutRef.current) return;

    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
  }, []);

  const flush = useCallback(
    (valueToPersist = draftRef.current) => {
      clearSaveTimeout();

      if (
        isEqual(valueToPersist, value) ||
        isEqual(valueToPersist, lastSavedRef.current)
      ) {
        return;
      }

      lastSavedRef.current = valueToPersist;
      persist(valueToPersist);
    },
    [clearSaveTimeout, isEqual, persist, value],
  );

  const setDraft = useCallback((nextValue: SetStateAction<T>) => {
    const resolvedValue =
      typeof nextValue === "function"
        ? (nextValue as (previousValue: T) => T)(draftRef.current)
        : nextValue;

    draftRef.current = resolvedValue;
    setDraftState(resolvedValue);
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    lastSavedRef.current = value;
  }, [value]);

  useEffect(() => {
    if (isEqual(draft, value)) {
      clearSaveTimeout();
      return;
    }

    clearSaveTimeout();
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      flush();
    }, delay);

    return clearSaveTimeout;
  }, [clearSaveTimeout, delay, draft, flush, isEqual, value]);

  useEffect(() => registerPendingDraftFlush(flush), [flush]);

  useUnmount(flush);

  return {
    draft,
    setDraft,
    flush,
  };
}
