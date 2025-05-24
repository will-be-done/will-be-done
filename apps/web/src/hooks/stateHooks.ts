import { useSelector, useStore } from "@will-be-done/hyperstate";
import {RootState} from "@/store/models.ts";

export function useAppSelector<TStateSlice>(
  selector: (state: RootState) => TStateSlice,
) {
  return useSelector(selector);
}

export function useAppStore() {
  return useStore<RootState>();
}
