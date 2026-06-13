import { describe, expect, it } from "vitest";
import { wrapGeneratorWithTraceMeta } from "./metadata";

describe("devtool tracing metadata", () => {
  it("relays return to the wrapped generator", () => {
    let cleanedUp = false;

    function* inner() {
      try {
        yield { type: "noop" };
      } finally {
        cleanedUp = true;
      }
    }

    const wrapped = wrapGeneratorWithTraceMeta(
      inner(),
      "selector",
      "cleanupSelector",
      [],
    );

    expect(wrapped.next().done).toBe(false);
    wrapped.return(undefined);

    expect(cleanedUp).toBe(true);
  });
});
