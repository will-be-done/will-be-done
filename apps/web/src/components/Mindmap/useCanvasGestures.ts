import { type RefObject, useRef } from "react";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import {
  createMindmapNode,
  type MindmapNode,
} from "@will-be-done/slices/space";
import { useFocusStore } from "@/store/focusSlice.ts";
import { isInputElement } from "@/utils/isInputElement.ts";
import type { MindmapLayout } from "./mindmapLayout.ts";
import {
  type CanvasIndex,
  noIds,
  useMindmapSelection,
} from "./mindmapModel.ts";
import { maxZoom, minZoom, type View } from "./useMindmapView.ts";

type Point = { x: number; y: number };

// A touch that travels less than this is a tap.
const tapSlop = 8;
const doubleTapMs = 300;
const doubleTapSlop = 24;

// Pointer input on empty canvas: a mouse drag draws a selection box, the
// middle button pans, and touch pans and pinches. Double-clicking or
// double-tapping empty space starts a floating topic.
export function useCanvasGestures({
  mindmapId,
  viewportRef,
  marqueeRef,
  viewRef,
  applyView,
  layout,
  index,
  editNode,
}: {
  mindmapId: string;
  viewportRef: RefObject<HTMLDivElement | null>;
  marqueeRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<View>;
  applyView: (view: View) => void;
  layout: MindmapLayout;
  index: CanvasIndex;
  editNode: (node: MindmapNode) => void;
}) {
  const dispatch = useAsyncDispatch();
  const gestureRef = useRef<
    | { kind: "pan"; pointerId: number; x: number; y: number }
    | {
        kind: "marquee";
        pointerId: number;
        x: number;
        y: number;
        moved: boolean;
        base: ReadonlySet<string>;
      }
    | null
  >(null);

  // A tap or click on empty space clears focus and the selection.
  const deselect = () => {
    useFocusStore.getState().resetFocus();
    useMindmapSelection.getState().clear();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  // Touch: one finger pans, two pinch to zoom, a tap on empty space deselects
  // and a double tap there starts a floating topic. Long-pressing a node
  // starts the browser's drag, which cancels the touch.
  const touchesRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<{ distance: number; mid: Point; view: View } | null>(
    null,
  );
  const tapRef = useRef<{ start: Point; onCanvas: boolean } | null>(null);
  const lastTapRef = useRef<{ at: number; point: Point } | null>(null);
  const lastPointerTypeRef = useRef("");

  const startPinch = () => {
    const [a, b] = touchesRef.current.values();
    const rect = viewportRef.current?.getBoundingClientRect();
    pinchRef.current =
      a && b && rect
        ? {
            distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
            mid: {
              x: (a.x + b.x) / 2 - rect.left,
              y: (a.y + b.y) / 2 - rect.top,
            },
            view: viewRef.current,
          }
        : null;
  };

  const handleTouchDown = (e: React.PointerEvent) => {
    const touches = touchesRef.current;
    // A touch whose end was lost would otherwise count as a finger.
    if (e.isPrimary) touches.clear();
    if (e.target instanceof Element && isInputElement(e.target)) return;
    const point = { x: e.clientX, y: e.clientY };
    touches.set(e.pointerId, point);
    tapRef.current =
      touches.size === 1
        ? {
            start: point,
            onCanvas: !(
              e.target instanceof Element &&
              e.target.closest("[data-mindmap-node], button")
            ),
          }
        : null;
    if (touches.size === 2) startPinch();
  };

  const handleTouchMove = (e: React.PointerEvent) => {
    const touches = touchesRef.current;
    const last = touches.get(e.pointerId);
    if (!last) return;
    const point = { x: e.clientX, y: e.clientY };
    const tap = tapRef.current;
    if (tap) {
      if (Math.hypot(point.x - tap.start.x, point.y - tap.start.y) < tapSlop) {
        return;
      }
      tapRef.current = null;
    }
    touches.set(e.pointerId, point);

    const pinch = pinchRef.current;
    if (!pinch) {
      const view = viewRef.current;
      applyView({
        ...view,
        x: view.x + point.x - last.x,
        y: view.y + point.y - last.y,
      });
      return;
    }
    const [a, b] = touches.values();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!a || !b || !rect) return;
    const zoom = Math.min(
      maxZoom,
      Math.max(
        minZoom,
        (pinch.view.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance,
      ),
    );
    const mid = {
      x: (a.x + b.x) / 2 - rect.left,
      y: (a.y + b.y) / 2 - rect.top,
    };
    // The map point first under the fingers stays under them.
    applyView({
      zoom,
      x: mid.x - ((pinch.mid.x - pinch.view.x) / pinch.view.zoom) * zoom,
      y: mid.y - ((pinch.mid.y - pinch.view.y) / pinch.view.zoom) * zoom,
    });
  };

  const handleTouchUp = (e: React.PointerEvent) => {
    const touches = touchesRef.current;
    if (!touches.delete(e.pointerId)) return;
    // The fingers left keep panning or pinching from where they are.
    if (touches.size >= 2) startPinch();
    else pinchRef.current = null;
    const tap = tapRef.current;
    tapRef.current = null;
    if (!tap?.onCanvas || e.type !== "pointerup") return;

    const last = lastTapRef.current;
    if (
      last &&
      e.timeStamp - last.at < doubleTapMs &&
      Math.hypot(e.clientX - last.point.x, e.clientY - last.point.y) <
        doubleTapSlop
    ) {
      lastTapRef.current = null;
      addFloatingTopic(e);
      return;
    }
    lastTapRef.current = { at: e.timeStamp, point: tap.start };
    deselect();
  };

  // Dragging empty space selects with a rectangle; the middle button pans.
  const handlePointerDown = (e: React.PointerEvent) => {
    lastPointerTypeRef.current = e.pointerType;
    if (e.pointerType === "touch") {
      handleTouchDown(e);
      return;
    }
    if (e.button === 1) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      gestureRef.current = {
        kind: "pan",
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
      };
      return;
    }
    if (
      e.button !== 0 ||
      (e.target instanceof Element &&
        e.target.closest("[data-mindmap-node], button"))
    ) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    gestureRef.current = {
      kind: "marquee",
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      base: additive ? useMindmapSelection.getState().ids : noIds,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") {
      handleTouchMove(e);
      return;
    }
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    if (gesture.kind === "pan") {
      const view = viewRef.current;
      applyView({
        ...view,
        x: view.x + e.clientX - gesture.x,
        y: view.y + e.clientY - gesture.y,
      });
      gesture.x = e.clientX;
      gesture.y = e.clientY;
      return;
    }

    const rect = viewportRef.current?.getBoundingClientRect();
    const marquee = marqueeRef.current;
    if (!rect || !marquee) return;
    if (
      !gesture.moved &&
      Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < 3
    ) {
      return;
    }
    gesture.moved = true;
    const left = Math.min(gesture.x, e.clientX) - rect.left;
    const top = Math.min(gesture.y, e.clientY) - rect.top;
    const width = Math.abs(e.clientX - gesture.x);
    const height = Math.abs(e.clientY - gesture.y);
    Object.assign(marquee.style, {
      display: "block",
      transform: `translate(${left}px, ${top}px)`,
      width: `${width}px`,
      height: `${height}px`,
    });

    const view = viewRef.current;
    const x1 = (left - view.x) / view.zoom;
    const y1 = (top - view.y) / view.zoom;
    const x2 = x1 + width / view.zoom;
    const y2 = y1 + height / view.zoom;
    const ids = new Set(gesture.base);
    for (const node of layout.nodes.values()) {
      if (
        index.nodes.get(node.id)?.kind === "node" &&
        node.x < x2 &&
        node.x + node.width > x1 &&
        node.y < y2 &&
        node.y + node.height > y1
      ) {
        ids.add(node.id);
      }
    }
    // A box has no anchor; a later Shift-click starts from the focused node.
    useMindmapSelection.getState().setIds(ids, null);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") {
      handleTouchUp(e);
      return;
    }
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    if (gesture.kind !== "marquee") return;
    if (marqueeRef.current) marqueeRef.current.style.display = "none";
    if (!gesture.moved) {
      deselect();
      return;
    }
    useFocusStore.getState().resetFocus();
    // Keys reach the canvas handler only from inside the viewport.
    viewportRef.current?.focus({ preventScroll: true });
  };

  const addFloatingTopic = (at: { clientX: number; clientY: number }) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const view = viewRef.current;
    void (async () => {
      editNode(
        await dispatch(
          createMindmapNode({
            mindmapId,
            placement: {
              x: (at.clientX - rect.left - view.x) / view.zoom,
              y: (at.clientY - rect.top - view.y) / view.zoom,
            },
          }),
        ),
      );
    })();
  };

  // Double-clicking empty space starts a floating topic there. Touch double
  // taps are handled as taps, whether or not the browser also sends this.
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (
      lastPointerTypeRef.current === "touch" ||
      (e.target instanceof Element &&
        e.target.closest("[data-mindmap-node], button"))
    ) {
      return;
    }
    addFloatingTopic(e);
  };

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp,
    onDoubleClick: handleDoubleClick,
  };
}
