import { RootState } from "@/models/models2";
import { useDispatch, useSelector, useStore } from "@will-be-done/hyperstate";

export function useAppSelector<TStateSlice>(
  selector: (state: RootState) => TStateSlice,
) {
  return useSelector(selector);
}

export function useAppDispatch() {
  return useDispatch<RootState>();
}

export function useAppStore() {
  return useStore<RootState>();
}
