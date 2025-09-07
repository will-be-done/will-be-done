import { useSelector, useStore } from "@will-be-done/hyperstate";

export function useAppSelector<TStateSlice>(
  selector: (state: RootState) => TStateSlice,
) {
  return useSelector(selector);
}

export function useAppStore() {
  return useStore<RootState>();
}
