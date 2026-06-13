import { describe, expect, it } from "vitest";
import type { TraceContext } from "./store";
import { getTraceContextFromTraits, traceContextTrait } from "./context";

const traceContext = (name: string) =>
  ({ trace: { name } }) as TraceContext;

describe("devtool trace context traits", () => {
  it("returns the newest trace context trait", () => {
    const older = traceContext("older");
    const newer = traceContext("newer");

    expect(
      getTraceContextFromTraits([
        traceContextTrait(older),
        { type: "other" },
        traceContextTrait(newer),
        { type: "other" },
      ]),
    ).toBe(newer);
  });
});
