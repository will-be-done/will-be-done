import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils.ts";

// The timeline has no ends, so a scrollbar that maps its thumb to an absolute
// position fights the days added under it. This thumb rests in the middle
// instead: dragging it scrolls, holding it past the end of the track keeps
// scrolling, and releasing it springs it back. It looks and shows like
// ScrollArea's bars: on hover or while scrolling.

const THUMB_FRACTION = 0.25;
// Holding past the end scrolls this many pixels per frame for each pixel of
// overshoot, within the bounds below.
const HOLD_SPEED = 0.5;
const MIN_HOLD_SPEED = 6;
const MAX_HOLD_SPEED = 80;
const SCROLL_TIMEOUT = 500;

type Drag = {
  pointerId: number;
  startX: number;
  offset: number;
  overshoot: number;
  frame: number | null;
};

export const InfiniteScrollbar = ({
  areaRef,
  scrollerRef,
  scrollBy,
  page,
}: {
  // Hovering anywhere in here shows the bar.
  areaRef: RefObject<HTMLElement | null>;
  scrollerRef: RefObject<HTMLElement | null>;
  scrollBy: (pixels: number) => void;
  page: (direction: -1 | 1) => void;
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [offset, setOffset] = useState<number | null>(null);

  useEffect(() => {
    const area = areaRef.current;
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!area || !scroller || !track) return;

    let timeout: number | undefined;
    const onScroll = () => {
      track.setAttribute("data-scrolling", "");
      window.clearTimeout(timeout);
      timeout = window.setTimeout(
        () => track.removeAttribute("data-scrolling"),
        SCROLL_TIMEOUT,
      );
    };
    // A drag fires no pointer events, and a bar left taking the pointer would
    // hide the days under it from drop targeting.
    const setHovering = (hovering: boolean) =>
      track.toggleAttribute("data-hovering", hovering);
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch") setHovering(true);
    };
    const onPointerLeave = () => setHovering(false);
    const onDragStart = () => setHovering(false);

    scroller.addEventListener("scroll", onScroll, { passive: true });
    area.addEventListener("pointermove", onPointerMove);
    area.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("dragstart", onDragStart, true);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      area.removeEventListener("pointermove", onPointerMove);
      area.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("dragstart", onDragStart, true);
      window.clearTimeout(timeout);
    };
  }, [areaRef, scrollerRef]);

  const hold = () => {
    const drag = dragRef.current;
    if (!drag || drag.overshoot === 0) {
      if (drag) drag.frame = null;
      return;
    }

    const speed = Math.min(
      MAX_HOLD_SPEED,
      Math.max(MIN_HOLD_SPEED, Math.abs(drag.overshoot) * HOLD_SPEED),
    );
    scrollBy(Math.sign(drag.overshoot) * speed);
    drag.frame = requestAnimationFrame(hold);
  };

  const endDrag = () => {
    const drag = dragRef.current;
    if (drag?.frame != null) cancelAnimationFrame(drag.frame);
    dragRef.current = null;
    setOffset(null);
  };

  const handleThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      offset: 0,
      overshoot: 0,
      frame: null,
    };
    setOffset(0);
  };

  const handleThumbPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const width = trackRef.current?.clientWidth;
    if (!drag || drag.pointerId !== e.pointerId || !width) return;

    const thumbWidth = width * THUMB_FRACTION;
    const maxOffset = (width - thumbWidth) / 2;
    const raw = e.clientX - drag.startX;
    const next = Math.max(-maxOffset, Math.min(maxOffset, raw));

    // Like a native scrollbar, the thumb stands for the screen within a
    // track-sized stretch of days.
    scrollBy((next - drag.offset) * (width / thumbWidth));
    drag.offset = next;
    drag.overshoot = raw - next;
    if (drag.overshoot !== 0 && drag.frame === null) {
      drag.frame = requestAnimationFrame(hold);
    }
    setOffset(next);
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (e.button !== 0 || !track) return;
    const rect = track.getBoundingClientRect();
    page(e.clientX < rect.left + rect.width / 2 ? -1 : 1);
  };

  return (
    <div
      ref={trackRef}
      data-dragging={offset !== null || undefined}
      onPointerDown={handleTrackPointerDown}
      // Clear of the projects panel's divider handles below it; touch swipes.
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-3.5 z-10 h-2.5 touch-none select-none opacity-0 transition-opacity delay-300 duration-150 pointer-coarse:hidden",
        "data-hovering:pointer-events-auto data-hovering:opacity-100 data-hovering:delay-0 data-scrolling:opacity-100 data-scrolling:delay-0 data-dragging:pointer-events-auto data-dragging:opacity-100",
      )}
    >
      <div
        role="scrollbar"
        aria-orientation="horizontal"
        aria-controls="timeline-days"
        aria-label="Scroll days"
        aria-valuenow={50}
        onPointerDown={handleThumbPointerDown}
        onPointerMove={handleThumbPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          "absolute inset-y-0 rounded-full border-2 border-transparent bg-clip-padding",
          offset === null
            ? "bg-content/25 transition-[transform,background-color] duration-300 ease-out hover:bg-content/40"
            : "bg-content/40",
        )}
        style={{
          left: `${((1 - THUMB_FRACTION) / 2) * 100}%`,
          width: `${THUMB_FRACTION * 100}%`,
          transform: `translateX(${offset ?? 0}px)`,
        }}
      />
    </div>
  );
};
