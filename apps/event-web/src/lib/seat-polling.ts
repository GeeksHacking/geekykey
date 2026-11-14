import { createContext } from "react";

/** The open seat card registers its lifetime without making other routes poll faster. */
export const SeatPollingContext = createContext<((mounted: boolean) => void) | undefined>(
  undefined,
);
