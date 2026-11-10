import { useCallback, useLayoutEffect, useRef, useState } from "react";

// Days are integer offsets from the timeline's start date. A window of them is
// rendered in normal flow, so the browser lays the columns out and nothing is
// estimated. Blank space on the left holds a day-wide slot for every day from
// `base` up to the window, so days added or dropped there swap with their slot
// and nothing after them moves: writing the scroll would cut short the
// browser's own smooth scrolls and momentum. When a day to the left of the
// anchor day differs from its slot (hidden by hand), the scroll moves to hold
// the anchor still.

export type RenderedDays = { from: number; to: number; base: number };

// Re-window when fewer rendered days than this remain past a screen edge.
const MIN_OVERSCAN = 5;
// Days are this wide unless hidden by hand.
export const DAY_WIDTH = 400;
// Blank day slots on each side of the window, so a fast scroll lands among
// slots that tell which days it reached, rather than at an end.
const BLANK_DAYS = 1000;
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
      base: -overscan - BLANK_DAYS,
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
    scroller.addEventListener("focusin", this.update);
    scroller.addEventListener("wheel", this.stopAnimation, { passive: true });
    scroller.addEventListener("touchstart", this.stopAnimation, {
      passive: true,
    });

    return () => {
      scroller.removeEventListener("scroll", this.update);
      scroller.removeEventListener("focusin", this.update);
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

  // Keeps `base` in place unless the blank slots run out or grow too wide to
  // lay out; moving it moves the scroll once.
  private setRendered(from: number, to: number) {
    const blank = from - this.rendered.base;
    const base =
      blank < this.overscan || blank > BLANK_DAYS * 2
        ? from - BLANK_DAYS
        : this.rendered.base;
    if (
      from === this.rendered.from &&
      to === this.rendered.to &&
      base === this.rendered.base
    ) {
      return false;
    }
    this.callbacks.onRenderedChange({ from, to, base });
    return true;
  }

  private jump(day: number) {
    this.anchor = null;
    this.alignDay = day;
    const visible = Math.ceil(
      (this.scroller?.clientWidth ?? window.innerWidth) / DAY_WIDTH,
    );
    // Already rendered: no commit follows to align it.
    if (!this.setRendered(day - this.overscan, day + visible + this.overscan)) {
      this.committed(this.rendered);
    }
  }

  private update = () => {
    const scroller = this.scroller;
    const row = this.row;
    // With no width no day is visible, which would read as scrolled past them.
    if (!scroller || !row || this.alignDay !== null || !scroller.clientWidth) {
      return;
    }

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

    // Keys move focus ahead of the scroll that follows it.
    const focused = this.focusedDay(firstDay, lastDay);
    const low = Math.min(firstDay, focused ?? firstDay);
    const high = Math.max(lastDay, focused ?? lastDay);

    const needsMore = from > low - MIN_OVERSCAN || to < high + MIN_OVERSCAN;
    // Trimming would drop the day a smooth scroll is heading to.
    const hasExtra =
      !this.animation &&
      (from < low - this.overscan * 2 || to > high + this.overscan * 2);
    if (needsMore || hasExtra) {
      this.setRendered(
        Math.min(low - this.overscan, this.animation ? from : Infinity),
        Math.max(high + this.overscan, this.animation ? to : -Infinity),
      );
    }

    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(
      () => this.callbacks.onVisibleDaysChange(firstDay, lastDay),
      150,
    );
  };

  // The focused day, unless scrolled far from it.
  private focusedDay(firstVisible: number, lastVisible: number) {
    const focused = document.activeElement;
    const day =
      focused && this.row?.contains(focused)
        ? Number(focused.closest<HTMLElement>("[data-day]")?.dataset.day)
        : NaN;
    return day >= firstVisible - this.overscan &&
      day <= lastVisible + this.overscan
      ? day
      : null;
  }

  private animate = () => {
    const scroller = this.scroller;
    const animation = this.animation;
    if (!scroller || !animation) return;

    const element = this.dayElement(animation.day);
    if (!element) {
      const { from, to } = this.rendered;
      this.setRendered(
        Math.min(from, animation.day - this.overscan),
        Math.max(to, animation.day + this.overscan),
      );
      animation.frame = requestAnimationFrame(this.animate);
      return;
    }

    const distance = element.offsetLeft - scroller.scrollLeft;
    const before = scroller.scrollLeft;
    // A step under a pixel can round to none, which reads as clamped.
    const isLastStep = Math.abs(distance) < 4;
    scroller.scrollLeft += isLastStep ? distance : distance / 4;
    // Done, or the scroll is clamped and can get no closer.
    if (isLastStep || scroller.scrollLeft === before) {
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
    rowStyle: {
      paddingLeft: (rendered.from - rendered.base) * DAY_WIDTH,
      paddingRight: BLANK_DAYS * DAY_WIDTH,
    },
    firstVisible,
    scrollToDay,
    scrollByDay,
    scrollBy,
    page,
  };
}
