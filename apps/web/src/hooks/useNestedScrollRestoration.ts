import { RefObject, useEffect, useLayoutEffect } from "react";
import {
  useElementScrollRestoration,
  useRouterState,
} from "@tanstack/react-router";

const TANSTACK_SCROLL_STORAGE_KEY = "tsr-scroll-restoration-v1_3";

function isScrollDebugEnabled() {
  const enabledFromUrl = window.location.search.includes("debugScroll=1");
  if (enabledFromUrl) {
    window.localStorage.setItem("debugScroll", "1");
  }

  return enabledFromUrl || window.localStorage.getItem("debugScroll") === "1";
}

function debugScroll(message: string, data?: Record<string, unknown>) {
  if (!isScrollDebugEnabled()) return;
  console.debug(`[scroll-restore] ${message}`, data);
}

function cacheScrollPosition({
  cacheKey,
  restorationId,
  element,
  reason,
  label,
}: {
  cacheKey: string;
  restorationId: string;
  element: HTMLElement;
  reason: string;
  label: string;
}) {
  const elementSelector = `[data-scroll-restoration-id="${restorationId}"]`;
  const entry = {
    scrollX: element.scrollLeft || 0,
    scrollY: element.scrollTop || 0,
  };

  try {
    const state = JSON.parse(
      window.sessionStorage.getItem(TANSTACK_SCROLL_STORAGE_KEY) || "{}",
    );

    state[cacheKey] ||= {};
    state[cacheKey][elementSelector] = entry;

    window.sessionStorage.setItem(
      TANSTACK_SCROLL_STORAGE_KEY,
      JSON.stringify(state),
    );

    debugScroll("cache write", {
      label,
      reason,
      cacheKey,
      elementSelector,
      ...entry,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    });
  } catch (error) {
    console.error("Failed to cache scroll position", error);
  }
}

export function useNestedScrollRestoration({
  restorationId,
  elementRef,
  label,
}: {
  restorationId: string;
  elementRef: RefObject<HTMLElement | null>;
  label: string;
}) {
  const location = useRouterState({ select: (state) => state.location });
  const scrollCacheKey = location.state.__TSR_key ?? location.href;
  const scrollEntry = useElementScrollRestoration({
    id: restorationId,
  });

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    debugScroll("element mounted", {
      label,
      scrollCacheKey,
      restorationId,
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    });

    const saveCurrentPosition = (reason: string) => {
      cacheScrollPosition({
        cacheKey: scrollCacheKey,
        restorationId,
        element,
        reason,
        label,
      });
    };

    const handleScroll = () => saveCurrentPosition("scroll");

    element.addEventListener("scroll", handleScroll, { passive: true });
    saveCurrentPosition("mount");

    return () => {
      saveCurrentPosition("unmount");
      element.removeEventListener("scroll", handleScroll);
      debugScroll("element unmounted", {
        label,
        scrollCacheKey,
        restorationId,
        scrollTop: element.scrollTop,
      });
    };
  }, [elementRef, label, restorationId, scrollCacheKey]);

  useLayoutEffect(() => {
    if (!scrollEntry) {
      debugScroll("no cached entry on restore", {
        label,
        scrollCacheKey,
        restorationId,
      });
      return;
    }

    const targetScrollTop = scrollEntry.scrollY ?? 0;
    const targetScrollLeft = scrollEntry.scrollX ?? 0;
    let frameId: number | undefined;
    let timeoutId: number | undefined;
    let attempts = 0;

    const restore = () => {
      const element = elementRef.current;
      if (!element) return;

      element.scrollTop = targetScrollTop;
      element.scrollLeft = targetScrollLeft;

      attempts += 1;
      const maxScrollTop = Math.max(
        0,
        element.scrollHeight - element.clientHeight,
      );
      const restored = Math.abs(element.scrollTop - targetScrollTop) <= 1;
      const canReachTarget = maxScrollTop >= targetScrollTop;

      debugScroll("restore attempt", {
        label,
        attempts,
        scrollCacheKey,
        restorationId,
        targetScrollTop,
        actualScrollTop: element.scrollTop,
        maxScrollTop,
        restored,
        canReachTarget,
      });

      if (restored || attempts >= 20) return;

      if (canReachTarget) {
        frameId = window.requestAnimationFrame(restore);
      } else {
        timeoutId = window.setTimeout(restore, 50);
      }
    };

    restore();

    return () => {
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [elementRef, label, restorationId, scrollCacheKey, scrollEntry]);
}
