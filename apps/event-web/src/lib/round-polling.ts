import { createContext } from "react";

/** The dashboard card registers its lifetime without making other routes poll faster. */
export const RoundPollingContext = createContext<((mounted: boolean) => void) | undefined>(
  undefined,
);
