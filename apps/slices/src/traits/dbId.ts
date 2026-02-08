import { getCurrentTraits } from "@will-be-done/hyperdb";
import { v5 as uuidv5 } from "uuid";

const dbIdTraitType = "dbIdType";

export interface DbIDTrait {
  type: typeof dbIdTraitType;
  dbId: string;
  dbType: string;
}

export const dbIdTrait = function (dbType: string, dbId: string) {
  return {
    type: dbIdTraitType,
    dbId,
    dbType,
  } satisfies DbIDTrait;
};

export const genUUIDV5 = function* (objectType: string, identifier: string) {
  const traits = yield* getCurrentTraits();

  const trait = traits.find((t) => t.type === dbIdTraitType);
  if (!trait) {
    throw new Error(`${dbIdTraitType} trait not found`);
  }

  const spaceUUUIDTrait = trait as DbIDTrait;

  return uuidv5(`${objectType}/${identifier}`, spaceUUUIDTrait.dbId);
};
