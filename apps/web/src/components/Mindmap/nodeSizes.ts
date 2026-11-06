import type { Size } from "./mindmapLayout.ts";

// Rendered node sizes feed the layout. Resize observations arrive between
// layout and paint, and external-store updates render in a microtask, so a
// frame laid out with estimated sizes never shows.
export function createNodeSizeStore() {
  let sizes: ReadonlyMap<string, Size> = new Map();
  const listeners = new Set<() => void>();
  const elements = new Map<string, HTMLElement>();
  let observer: ResizeObserver | null = null;

  const measure = () => {
    const next = new Map<string, Size>();
    let changed = false;
    for (const [id, element] of elements) {
      const size = { width: element.offsetWidth, height: element.offsetHeight };
      const previous = sizes.get(id);
      if (previous?.width !== size.width || previous.height !== size.height) {
        changed = true;
      }
      next.set(id, size);
    }
    if (!changed) return;
    sizes = next;
    for (const listener of listeners) listener();
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => sizes,
    register: (id: string, element: HTMLElement | null) => {
      observer ??= new ResizeObserver(measure);
      const previous = elements.get(id);
      if (previous) observer.unobserve(previous);
      if (element) {
        elements.set(id, element);
        observer.observe(element);
      } else {
        elements.delete(id);
      }
    },
    disconnect: () => observer?.disconnect(),
  };
}
