import { useCallback, useLayoutEffect, useRef, useState } from "react";

// Days are integer offsets from the timeline's start date. A window of them is
// rendered in normal flow, so the browser lays the columns out and nothing is
// estimated. One rendered day, the anchor, is held still on screen whenever
// days are added, removed, or resized to its left: a scroll moves the anchor,
// a layout change moves the scroll.

export type RenderedDays = { from: number; to: number };

// Re-window when fewer rendered days than this remain past a screen edge.
const MIN_OVERSCAN = 5;
// Days are this wide unless hidden by hand.
export const DAY_WIDTH = 400;
// Blank space on both sides of the rendered days, so a fast scroll does not
// stop dead at the edge before more days render.
export const EDGE_SLACK = 2000;
// How far a smooth scroll runs before it jumps instead.
const MAX_SMOOTH_DAYS = 60;

type Callbacks = {
  onRenderedChange: (rendered: RenderedDays) => void;
  onFirstVisibleChange: (day: number) => void;
  // After scrolling settles, so heavy views do not follow every frame.
  onVisibleDaysChange: (first: number, last: number) => void;
};

class InfiniteDays {
  rendered: RenderedDays;
  private callbacks: Callbacks;
  private scroller: HTMLElement | null = null;
  private row: HTMLElement | null = null;
  private anchor: { day: number; x: number } | null = null;
  private alignDay: number | null = 0;
  private firstVisible = 0;
  private lastVisible = 0;
  private animation: { day: number; frame: number } | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private observer: ResizeObserver;

  constructor(
    private overscan: number,
    callbacks: Callbacks,
  ) {
    this.callbacks = callbacks;
    this.rendered = {
      from: -overscan,
      to: Math.ceil(window.innerWidth / DAY_WIDTH) + overscan,
    };
    this.observer = new ResizeObserver(this.update);
  }

  setCallbacks(callbacks: Callbacks) {
    this.callbacks = callbacks;
  }

  attach(scroller: HTMLElement, row: HTMLElement) {
    this.scroller = scroller;
    this.row = row;
    this.observer.observe(scroller);
    scroller.addEventListener("scroll", this.update, { passive: true });
    scroller.addEventListener("wheel", this.stopAnimation, { passive: true });
    scroller.addEventListener("touchstart", this.stopAnimation, {
      passive: true,
    });

    return () => {
      scroller.removeEventListener("scroll", this.update);
      scroller.removeEventListener("wheel", this.stopAnimation);
      scroller.removeEventListener("touchstart", this.stopAnimation);
      this.observer.disconnect();
      this.stopAnimation();
      clearTimeout(this.settleTimer);
    };
  }

  observeDay = (element: HTMLElement | null) => {
    if (!element) return;
    this.observer.observe(element);
    return () => this.observer.unobserve(element);
  };

  // Called once these days have been rendered.
  committed(rendered: RenderedDays) {
    this.rendered = rendered;
    const scroller = this.scroller;
    const align = this.alignDay;
    const element = align === null ? null : this.dayElement(align);
    if (scroller && align !== null && element) {
      scroller.scrollLeft = element.offsetLeft;
      this.anchor = { day: align, x: element.offsetLeft };
      this.alignDay = null;
    } else {
      this.keepAnchor();
    }
    this.update();
  }

  scrollToDay(day: number, smooth: boolean) {
    this.stopAnimation();
    const scroller = this.scroller;
    if (!scroller) return;

    if (smooth && Math.abs(day - this.firstVisible) <= MAX_SMOOTH_DAYS) {
      this.animation = { day, frame: requestAnimationFrame(this.animate) };
      return;
    }

    const element = this.dayElement(day);
    if (element) {
      scroller.scrollLeft = element.offsetLeft;
    } else {
      this.jump(day);
    }
  }

  scrollBy(pixels: number) {
    this.stopAnimation();
    if (this.scroller) this.scroller.scrollLeft += pixels;
  }

  // Moves by the days that fit on screen.
  page(direction: -1 | 1) {
    const fullyVisible = Math.max(1, this.lastVisible - this.firstVisible);
    this.scrollToDay(
      (this.animation?.day ?? this.firstVisible) + direction * fullyVisible,
      true,
    );
  }

  // Moves by a day; a partly scrolled-off first day is revealed first.
  scrollByDay(direction: -1 | 1) {
    const heading = this.animation?.day;
    if (heading !== undefined) {
      return this.scrollToDay(heading + direction, true);
    }

    const first = this.dayElement(this.firstVisible);
    const isCut =
      !!first &&
      !!this.scroller &&
      first.offsetLeft < this.scroller.scrollLeft - 1;
    this.scrollToDay(
      direction < 0 && isCut
        ? this.firstVisible
        : this.firstVisible + direction,
      true,
    );
  }

  private dayElement(day: number) {
    return (
      this.row?.querySelector<HTMLElement>(`:scope > [data-day="${day}"]`) ??
      null
    );
  }

  private keepAnchor() {
    const scroller = this.scroller;
    const anchor = this.anchor;
    const element = anchor && this.dayElement(anchor.day);
    if (!scroller || !anchor || !element) return;

    const shift = element.offsetLeft - anchor.x;
    if (shift === 0) return;
    scroller.scrollLeft += shift;
    anchor.x = element.offsetLeft;
  }

  private setRendered(rendered: RenderedDays) {
    if (
      rendered.from === this.rendered.from &&
      rendered.to === this.rendered.to
    ) {
      return;
    }
    this.callbacks.onRenderedChange(rendered);
  }

  private jump(day: number) {
    this.anchor = null;
    this.alignDay = day;
    const visible = Math.ceil(
      (this.scroller?.clientWidth ?? window.innerWidth) / DAY_WIDTH,
    );
    this.setRendered({
      from: day - this.overscan,
      to: day + visible + this.overscan,
    });
  }

  private update = () => {
    const scroller = this.scroller;
    const row = this.row;
    if (!scroller || !row || this.alignDay !== null) return;

    // Days may have resized since the last layout check; re-anchoring before
    // compensating would lose that shift.
    this.keepAnchor();
    const left = scroller.scrollLeft;
    const right = left + scroller.clientWidth;
    let first: HTMLElement | undefined;
    let last: HTMLElement | undefined;
    for (const child of row.children) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.offsetLeft + child.offsetWidth <= left + 1) continue;
      if (child.offsetLeft >= right - 1) break;
      first ??= child;
      last = child;
    }

    const { from, to } = this.rendered;
    if (!first || !last) {
      // Scrolled past the rendered days: guess where the screen landed.
      const firstChild = row.firstElementChild;
      const lastChild = row.lastElementChild;
      if (
        !(firstChild instanceof HTMLElement) ||
        !(lastChild instanceof HTMLElement)
      ) {
        return;
      }
      const lastEnd = lastChild.offsetLeft + lastChild.offsetWidth;
      this.jump(
        left < firstChild.offsetLeft
          ? from - Math.ceil((firstChild.offsetLeft - left) / DAY_WIDTH)
          : to + 1 + Math.floor((left - lastEnd) / DAY_WIDTH),
      );
      return;
    }

    const firstDay = Number(first.dataset.day);
    const lastDay = Number(last.dataset.day);
    this.lastVisible = lastDay;
    this.anchor = { day: firstDay, x: first.offsetLeft };
    if (firstDay !== this.firstVisible) {
      this.firstVisible = firstDay;
      this.callbacks.onFirstVisibleChange(firstDay);
    }

    const needsMore =
      from > firstDay - MIN_OVERSCAN || to < lastDay + MIN_OVERSCAN;
    // Trimming would drop the day a smooth scroll is heading to.
    const hasExtra =
      !this.animation &&
      (from < firstDay - this.overscan * 2 || to > lastDay + this.overscan * 2);
    if (needsMore || hasExtra) {
      this.setRendered({
        from: Math.min(
          firstDay - this.overscan,
          this.animation ? from : Infinity,
        ),
        to: Math.max(lastDay + this.overscan, this.animation ? to : -Infinity),
      });
    }

    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(
      () => this.callbacks.onVisibleDaysChange(firstDay, lastDay),
      150,
    );
  };

  private animate = () => {
    const scroller = this.scroller;
    const animation = this.animation;
    if (!scroller || !animation) return;

    const element = this.dayElement(animation.day);
    if (!element) {
      const { from, to } = this.rendered;
      this.setRendered({
        from: Math.min(from, animation.day - this.overscan),
        to: Math.max(to, animation.day + this.overscan),
      });
      animation.frame = requestAnimationFrame(this.animate);
      return;
    }

    const distance = element.offsetLeft - scroller.scrollLeft;
    const before = scroller.scrollLeft;
    scroller.scrollLeft += Math.abs(distance) < 2 ? distance : distance / 4;
    // Done, or the scroll is clamped and can get no closer.
    if (Math.abs(distance) < 2 || scroller.scrollLeft === before) {
      this.animation = null;
      return;
    }
    animation.frame = requestAnimationFrame(this.animate);
  };

  private stopAnimation = () => {
    if (!this.animation) return;
    cancelAnimationFrame(this.animation.frame);
    this.animation = null;
  };
}

export function useInfiniteDays({
  overscan,
  onVisibleDaysChange,
}: {
  overscan: number;
  onVisibleDaysChange: (first: number, last: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [firstVisible, setFirstVisible] = useState(0);
  const [engine] = useState(
    () =>
      new InfiniteDays(overscan, {
        onRenderedChange: () => {},
        onFirstVisibleChange: () => {},
        onVisibleDaysChange: () => {},
      }),
  );
  const [rendered, setRendered] = useState(engine.rendered);

  useLayoutEffect(() => {
    engine.setCallbacks({
      onRenderedChange: setRendered,
      onFirstVisibleChange: setFirstVisible,
      onVisibleDaysChange,
    });
  }, [engine, onVisibleDaysChange]);

  useLayoutEffect(() => {
    if (!scrollerRef.current || !rowRef.current) return;
    return engine.attach(scrollerRef.current, rowRef.current);
  }, [engine]);

  useLayoutEffect(() => {
    engine.committed(rendered);
  }, [engine, rendered]);

  const scrollToDay = useCallback(
    (day: number, smooth: boolean) => engine.scrollToDay(day, smooth),
    [engine],
  );
  const scrollByDay = useCallback(
    (direction: -1 | 1) => engine.scrollByDay(direction),
    [engine],
  );

  const scrollBy = useCallback(
    (pixels: number) => engine.scrollBy(pixels),
    [engine],
  );
  const page = useCallback(
    (direction: -1 | 1) => engine.page(direction),
    [engine],
  );

  return {
    scrollerRef,
    rowRef,
    observeDay: engine.observeDay,
    rendered,
    firstVisible,
    scrollToDay,
    scrollByDay,
    scrollBy,
    page,
  };
}
