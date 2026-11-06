import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { MindmapLayout } from "./mindmapLayout.ts";

export type View = { x: number; y: number; zoom: number };

// Survives navigating between maps within a session.
const savedViews = new Map<string, View>();
export const minZoom = 0.2;
export const maxZoom = 2.5;
const revealPadding = 48;

// Pan and zoom live in a ref and a CSS transform on the world, so moving the
// map never re-renders the nodes.
export function useMindmapView(
  mindmapId: string,
  viewportRef: RefObject<HTMLDivElement | null>,
) {
  const worldRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>({ x: 0, y: 0, zoom: 1 });
  const [zoomPercent, setZoomPercent] = useState(100);

  const applyView = useCallback(
    (view: View) => {
      viewRef.current = view;
      savedViews.set(mindmapId, view);
      if (worldRef.current) {
        worldRef.current.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
      }
      setZoomPercent(Math.round(view.zoom * 100));
    },
    [mindmapId],
  );

  const zoomAt = useCallback(
    (x: number, y: number, factor: number) => {
      const view = viewRef.current;
      const zoom = Math.min(maxZoom, Math.max(minZoom, view.zoom * factor));
      applyView({
        zoom,
        x: x - ((x - view.x) / view.zoom) * zoom,
        y: y - ((y - view.y) / view.zoom) * zoom,
      });
    },
    [applyView],
  );

  const zoomFromCenter = (factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect) zoomAt(rect.width / 2, rect.height / 2, factor);
  };

  const fit = (layout: MindmapLayout) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nodes = [...layout.nodes.values()];
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.width));
    const maxY = Math.max(...nodes.map((n) => n.y + n.height));
    const zoom = Math.min(
      1,
      Math.max(
        minZoom,
        Math.min(
          (rect.width - revealPadding * 2) / (maxX - minX),
          (rect.height - revealPadding * 2) / (maxY - minY),
        ),
      ),
    );
    applyView({
      zoom,
      x: rect.width / 2 - ((minX + maxX) / 2) * zoom,
      y: rect.height / 2 - ((minY + maxY) / 2) * zoom,
    });
  };

  useLayoutEffect(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    applyView(
      savedViews.get(mindmapId) ?? {
        x: (rect?.width ?? 0) / 2,
        y: (rect?.height ?? 0) / 2,
        zoom: 1,
      },
    );
  }, [applyView, mindmapId, viewportRef]);

  const reveal = useCallback(
    (element: HTMLElement) => {
      const viewport = viewportRef.current?.getBoundingClientRect();
      if (!viewport) return;
      const rect = element.getBoundingClientRect();
      const shift = (start: number, end: number, min: number, max: number) =>
        start < min + revealPadding
          ? min + revealPadding - start
          : end > max - revealPadding
            ? Math.max(min + revealPadding - start, max - revealPadding - end)
            : 0;
      const dx = shift(rect.left, rect.right, viewport.left, viewport.right);
      const dy = shift(rect.top, rect.bottom, viewport.top, viewport.bottom);
      if (dx || dy) {
        const view = viewRef.current;
        applyView({ ...view, x: view.x + dx, y: view.y + dy });
      }
    },
    [applyView, viewportRef],
  );

  const center = useCallback(
    (element: HTMLElement) => {
      const viewport = viewportRef.current?.getBoundingClientRect();
      if (!viewport) return;
      const rect = element.getBoundingClientRect();
      const view = viewRef.current;
      applyView({
        ...view,
        x:
          view.x +
          viewport.left +
          viewport.width / 2 -
          (rect.left + rect.width / 2),
        y:
          view.y +
          viewport.top +
          viewport.height / 2 -
          (rect.top + rect.height / 2),
      });
    },
    [applyView, viewportRef],
  );

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = element.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(
          e.clientX - rect.left,
          e.clientY - rect.top,
          Math.exp(-e.deltaY * 0.01),
        );
        return;
      }
      const view = viewRef.current;
      // A mouse wheel with Shift scrolls sideways.
      const [dx, dy] =
        e.shiftKey && e.deltaX === 0 ? [e.deltaY, 0] : [e.deltaX, e.deltaY];
      applyView({ ...view, x: view.x - dx, y: view.y - dy });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [applyView, viewportRef, zoomAt]);

  return {
    worldRef,
    viewRef,
    zoomPercent,
    applyView,
    zoomAt,
    zoomFromCenter,
    fit,
    reveal,
    center,
  };
}
