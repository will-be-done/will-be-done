const WHEEL_LINE_HEIGHT = 16;

// A wheel event's deltas in pixels, for scrolling `page` by hand.
export const wheelPixels = (event: WheelEvent, page: HTMLElement) => {
  const [lineX, lineY] =
    event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? [page.clientWidth, page.clientHeight]
      : event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? [WHEEL_LINE_HEIGHT, WHEEL_LINE_HEIGHT]
        : [1, 1];
  return [event.deltaX * lineX, event.deltaY * lineY] as const;
};
