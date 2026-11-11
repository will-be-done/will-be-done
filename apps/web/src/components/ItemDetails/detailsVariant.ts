import { createContext, use } from "react";

// The side panel stacks everything; the page puts properties in a column.
export type DetailsVariant = "panel" | "page";

const DetailsVariantContext = createContext<DetailsVariant>("panel");

export const DetailsVariantProvider = DetailsVariantContext.Provider;

export const useDetailsVariant = () => use(DetailsVariantContext);
