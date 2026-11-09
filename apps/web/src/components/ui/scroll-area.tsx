// Adapted from Base UI's ScrollArea (MIT, https://base-ui.com/react/components/scroll-area).
import { useCallback, useEffect, useRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

const SCROLL_TIMEOUT = 500;
const MIN_THUMB_SIZE = 16;
const WHEEL_LINE_HEIGHT = 16;

type Axis = "x" | "y";

/**
 * A native scroll container whose scrollbars are drawn as overlays that only
 * show on hover or while scrolling, so every platform looks like macOS.
 * Props go to the scrolling viewport; `rootClassName` sizes the outer box.
 */
export function ScrollArea({
  rootClassName,
  className,
  ref,
  children,
  ...props
}: ComponentProps<"div"> & { rootClassName?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const barYRef = useRef<HTMLDivElement>(null);
  const barXRef = useRef<HTMLDivElement>(null);
  const thumbYRef = useRef<HTMLDivElement>(null);
  const thumbXRef = useRef<HTMLDivElement>(null);

  const setViewport = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  useEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    const bars = { x: barXRef.current, y: barYRef.current };
    const thumbs = { x: thumbXRef.current, y: thumbYRef.current };
    if (!root || !viewport) return;

    const style = getComputedStyle(viewport);
    const scrollable = (overflow: string) =>
      overflow === "auto" || overflow === "scroll";

    // State lives on the bars themselves: a `group-*` variant would also
    // match the root of an enclosing ScrollArea.
    const update = () => {
      const overflowX =
        scrollable(style.overflowX) &&
        viewport.scrollWidth > viewport.clientWidth;
      const overflowY =
        scrollable(style.overflowY) &&
        viewport.scrollHeight > viewport.clientHeight;
      bars.x?.toggleAttribute("data-overflow", overflowX);
      bars.y?.toggleAttribute("data-overflow", overflowY);
      bars.x?.toggleAttribute("data-corner", overflowX && overflowY);
      bars.y?.toggleAttribute("data-corner", overflowX && overflowY);
      for (const axis of ["x", "y"] as const) {
        const bar = bars[axis];
        const thumb = thumbs[axis];
        if (bar && thumb) positionThumb(axis, viewport, bar, thumb);
      }
    };

    const timeouts: Record<Axis, number | undefined> = {
      x: undefined,
      y: undefined,
    };
    const markScrolling = (axis: Axis) => {
      const bar = bars[axis];
      if (!bar) return;
      bar.setAttribute("data-scrolling", "");
      window.clearTimeout(timeouts[axis]);
      timeouts[axis] = window.setTimeout(
        () => bar.removeAttribute("data-scrolling"),
        SCROLL_TIMEOUT,
      );
    };

    let last = { x: viewport.scrollLeft, y: viewport.scrollTop };
    const onScroll = () => {
      if (viewport.scrollLeft !== last.x) markScrolling("x");
      if (viewport.scrollTop !== last.y) markScrolling("y");
      last = { x: viewport.scrollLeft, y: viewport.scrollTop };
      update();
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });

    // The bars sit outside the viewport, so the wheel would scroll an ancestor
    // instead. Let it through once the viewport can't move.
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const [lineX, lineY] =
        event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? [viewport.clientWidth, viewport.clientHeight]
          : event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? [WHEEL_LINE_HEIGHT, WHEEL_LINE_HEIGHT]
            : [1, 1];
      const left = clamp(
        viewport.scrollLeft + event.deltaX * lineX,
        0,
        viewport.scrollWidth - viewport.clientWidth,
      );
      const top = clamp(
        viewport.scrollTop + event.deltaY * lineY,
        0,
        viewport.scrollHeight - viewport.clientHeight,
      );
      if (left === viewport.scrollLeft && top === viewport.scrollTop) return;
      event.preventDefault();
      viewport.scrollLeft = left;
      viewport.scrollTop = top;
    };
    for (const bar of [bars.x, bars.y]) {
      bar?.addEventListener("wheel", onWheel, { passive: false });
    }

    // Content can grow without the viewport resizing, so watch its children
    // too. A child must grow with its content for this to see the change.
    const resizeObserver = new ResizeObserver(update);
    const observeChildren = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(viewport);
      for (const child of viewport.children) resizeObserver.observe(child);
    };
    observeChildren();
    const mutationObserver = new MutationObserver(observeChildren);
    mutationObserver.observe(viewport, { childList: true });

    // Bars only take the pointer while hovered. A drag fires no pointer
    // events, and a bar left under it would hide the viewport from the
    // drag-and-drop hit testing.
    const setHovering = (hovering: boolean) => {
      if (bars.y?.hasAttribute("data-hovering") === hovering) return;
      bars.x?.toggleAttribute("data-hovering", hovering);
      bars.y?.toggleAttribute("data-hovering", hovering);
      if (hovering) update();
    };
    // Native listeners: React's would also fire for content portaled out of the viewport.
    // `pointermove` restores hover after a drag, which ends without a `pointerenter`.
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch") setHovering(true);
    };
    const onPointerLeave = () => setHovering(false);
    const onDragStart = () => setHovering(false);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("dragstart", onDragStart, true);

    return () => {
      viewport.removeEventListener("scroll", onScroll);
      for (const bar of [bars.x, bars.y]) {
        bar?.removeEventListener("wheel", onWheel);
      }
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("dragstart", onDragStart, true);
      window.clearTimeout(timeouts.x);
      window.clearTimeout(timeouts.y);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-slot="scroll-area"
      className={cn("relative", rootClassName)}
    >
      <div
        ref={setViewport}
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
        {...props}
      >
        {children}
      </div>
      <Scrollbar
        axis="y"
        barRef={barYRef}
        thumbRef={thumbYRef}
        viewportRef={viewportRef}
      />
      <Scrollbar
        axis="x"
        barRef={barXRef}
        thumbRef={thumbXRef}
        viewportRef={viewportRef}
      />
    </div>
  );
}

function positionThumb(
  axis: Axis,
  viewport: HTMLElement,
  bar: HTMLElement,
  thumb: HTMLElement,
) {
  const isY = axis === "y";
  const track = isY ? bar.clientHeight : bar.clientWidth;
  const content = isY ? viewport.scrollHeight : viewport.scrollWidth;
  const visible = isY ? viewport.clientHeight : viewport.clientWidth;
  const scrolled = isY ? viewport.scrollTop : viewport.scrollLeft;
  if (track === 0 || content <= visible) return;

  const size = Math.max(MIN_THUMB_SIZE, (track * visible) / content);
  const offset = clamp(
    (scrolled / (content - visible)) * (track - size),
    0,
    track - size,
  );
  thumb.style[isY ? "height" : "width"] = `${size}px`;
  thumb.style.transform = isY
    ? `translate3d(0,${offset}px,0)`
    : `translate3d(${offset}px,0,0)`;
}

function Scrollbar({
  axis,
  barRef,
  thumbRef,
  viewportRef,
}: {
  axis: Axis;
  barRef: React.RefObject<HTMLDivElement | null>;
  thumbRef: React.RefObject<HTMLDivElement | null>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}) {
  const drag = useRef<{ pointer: number; scroll: number } | null>(null);
  const isY = axis === "y";

  const pointerPosition = (event: React.PointerEvent) =>
    isY ? event.clientY : event.clientX;

  // Scroll distance per pixel of thumb movement.
  const scrollRatio = () => {
    const bar = barRef.current;
    const thumb = thumbRef.current;
    const viewport = viewportRef.current;
    if (!bar || !thumb || !viewport) return 0;
    const free = isY
      ? bar.clientHeight - thumb.offsetHeight
      : bar.clientWidth - thumb.offsetWidth;
    const scrollable = isY
      ? viewport.scrollHeight - viewport.clientHeight
      : viewport.scrollWidth - viewport.clientWidth;
    return free > 0 ? scrollable / free : 0;
  };

  const scrollPosition = () => {
    const viewport = viewportRef.current;
    if (!viewport) return 0;
    return isY ? viewport.scrollTop : viewport.scrollLeft;
  };

  const setScrollPosition = (value: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (isY) viewport.scrollTop = value;
    else viewport.scrollLeft = value;
  };

  return (
    <div
      ref={barRef}
      data-slot="scroll-area-scrollbar"
      data-orientation={isY ? "vertical" : "horizontal"}
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-10 hidden touch-none select-none opacity-0 transition-opacity delay-300 duration-150 data-overflow:block",
        "data-hovering:pointer-events-auto data-hovering:opacity-100 data-hovering:delay-0 data-scrolling:opacity-100 data-scrolling:delay-0 data-dragging:pointer-events-auto data-dragging:opacity-100",
        isY
          ? "top-0 right-0 bottom-0 w-2.5 data-corner:bottom-2.5"
          : "right-0 bottom-0 left-0 h-2.5 data-corner:right-2.5",
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const bar = event.currentTarget;
        const thumb = thumbRef.current;
        if (!thumb) return;

        // Clicking the track centers the thumb under the pointer, then drags from there.
        if (event.target !== thumb) {
          const rect = bar.getBoundingClientRect();
          const thumbSize = isY ? thumb.offsetHeight : thumb.offsetWidth;
          const start = isY ? rect.top : rect.left;
          setScrollPosition(
            (pointerPosition(event) - start - thumbSize / 2) * scrollRatio(),
          );
        }

        event.preventDefault();
        bar.setPointerCapture(event.pointerId);
        bar.setAttribute("data-dragging", "");
        drag.current = {
          pointer: pointerPosition(event),
          scroll: scrollPosition(),
        };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        setScrollPosition(
          drag.current.scroll +
            (pointerPosition(event) - drag.current.pointer) * scrollRatio(),
        );
      }}
      onLostPointerCapture={(event) => {
        drag.current = null;
        event.currentTarget.removeAttribute("data-dragging");
      }}
    >
      <div
        ref={thumbRef}
        data-slot="scroll-area-thumb"
        className={cn(
          "rounded-full border-2 border-transparent bg-content/25 bg-clip-padding transition-colors hover:bg-content/40",
          isY ? "w-full" : "h-full",
        )}
      />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
