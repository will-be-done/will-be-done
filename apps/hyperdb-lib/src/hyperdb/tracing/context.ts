import type { HyperDB } from "../core/contracts";
import type { Trait } from "../core/primitives";
import type { TraceContext } from "./store";

export const traceContextTraitType = "hyperdb.traceContext";

export type TraceContextTrait = Trait & {
  type: typeof traceContextTraitType;
  traceContext: TraceContext;
};

export const traceContextTrait = (
  traceContext: TraceContext,
): TraceContextTrait => ({
  type: traceContextTraitType,
  traceContext,
});

export const isTraceContextTrait = (
  trait: Trait,
): trait is TraceContextTrait =>
  trait.type === traceContextTraitType && "traceContext" in trait;

export const getTraceContextFromTraits = (
  traits: Trait[],
): TraceContext | undefined => {
  for (let index = traits.length - 1; index >= 0; index -= 1) {
    const trait = traits[index];
    if (trait && isTraceContextTrait(trait)) {
      return trait.traceContext;
    }
  }
};

export const getTraceContextForDB = (
  db: Pick<HyperDB, "getTraits">,
): TraceContext | undefined => getTraceContextFromTraits(db.getTraits());

export const withTraceContextTrait = <TDB extends HyperDB>(
  db: TDB,
  context: TraceContext,
): TDB => {
  if (getTraceContextForDB(db) === context) {
    return db as TDB;
  }

  return db.withTraits(traceContextTrait(context)) as TDB;
};
