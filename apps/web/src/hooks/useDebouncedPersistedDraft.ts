import {
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useUnmount } from "@/utils";
import { registerPendingDraftFlush } from "@/store/pendingDraftFlushes";

const defaultIsEqual = <T>(left: T, right: T) => Object.is(left, right);

export function useDebouncedPersistedDraft<T>({
  value,
  sourceKey,
  persist,
  delay = 200,
  isEqual = defaultIsEqual<T>,
}: {
  value: T;
  sourceKey?: string;
  persist: (value: T) => void | Promise<void>;
  delay?: number;
  isEqual?: (left: T, right: T) => boolean;
}) {
  const [draft, setDraftState] = useState<T>(value);
  const [draftSource, setDraftSource] = useState<{
    key: string | undefined;
    value: T;
    isValid: boolean;
  }>({ key: sourceKey, value, isValid: true });
  const draftRef = useRef(value);
  const sourceRef = useRef(value);
  const sourceKeyRef = useRef(sourceKey);
  const lastSubmittedRef = useRef(value);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSaveTimeout = useCallback(() => {
    if (!saveTimeoutRef.current) return;

    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
  }, []);

  const flush = useCallback(
    (valueToPersist = draftRef.current) => {
      clearSaveTimeout();

      if (
        draftSource.key !== sourceKey ||
        isEqual(valueToPersist, sourceRef.current) ||
        isEqual(valueToPersist, lastSubmittedRef.current)
      ) {
        return;
      }

      lastSubmittedRef.current = valueToPersist;
      const handleSaveError = (error: unknown) => {
        setDraftSource((current) =>
          current === draftSource ? { ...current, isValid: false } : current,
        );
        console.error("Failed to persist draft", error);
      };

      try {
        const result = persist(valueToPersist);
        if (result) void result.catch(handleSaveError);
      } catch (error) {
        handleSaveError(error);
      }
    },
    [clearSaveTimeout, draftSource, isEqual, persist, sourceKey],
  );

  const setDraft = useCallback(
    (nextValue: SetStateAction<T>) => {
      const resolvedValue =
        typeof nextValue === "function"
          ? (nextValue as (previousValue: T) => T)(draftRef.current)
          : nextValue;

      draftRef.current = resolvedValue;
      setDraftState(resolvedValue);
      setDraftSource({ key: sourceKey, value, isValid: true });
    },
    [sourceKey, value],
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useLayoutEffect(() => {
    if (sourceKeyRef.current !== sourceKey) {
      const hasLocalDraft = !isEqual(draftRef.current, sourceRef.current);
      sourceKeyRef.current = sourceKey;
      sourceRef.current = value;
      lastSubmittedRef.current = value;
      clearSaveTimeout();
      if (hasLocalDraft) {
        setDraftSource((current) => ({ ...current, isValid: false }));
      } else {
        draftRef.current = value;
        setDraftState(value);
        setDraftSource({ key: sourceKey, value, isValid: true });
      }
      return;
    }

    const previousSource = sourceRef.current;
    if (isEqual(previousSource, value)) return;

    const currentDraft = draftRef.current;
    const currentLastSubmitted = lastSubmittedRef.current;
    const draftMatchesPreviousSource = isEqual(currentDraft, previousSource);
    const draftMatchesSubmittedValue =
      isEqual(currentDraft, currentLastSubmitted) &&
      isEqual(value, currentLastSubmitted);

    sourceRef.current = value;

    if (!draftMatchesPreviousSource && !draftMatchesSubmittedValue) {
      setDraftSource((current) => ({ ...current, isValid: false }));
      return;
    }

    setDraftSource({ key: sourceKey, value, isValid: true });
    lastSubmittedRef.current = value;
    clearSaveTimeout();

    if (isEqual(currentDraft, value)) return;

    draftRef.current = value;
    setDraftState(value);
  }, [clearSaveTimeout, isEqual, sourceKey, value]);

  useEffect(() => {
    if (
      isEqual(draft, sourceRef.current) ||
      isEqual(draft, lastSubmittedRef.current)
    ) {
      clearSaveTimeout();
      return;
    }

    clearSaveTimeout();
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      flush();
    }, delay);

    return clearSaveTimeout;
  }, [clearSaveTimeout, delay, draft, flush, isEqual]);

  useEffect(() => registerPendingDraftFlush(flush), [flush]);

  useUnmount(flush);

  return {
    draft,
    isDraftCurrent:
      draftSource.isValid &&
      draftSource.key === sourceKey &&
      isEqual(draftSource.value, value),
    setDraft,
    flush,
  };
}
