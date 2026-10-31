/* PROTOTYPE (FRO-105), throwaway. */
import { useMemo } from "react";

import { BODY, toDataUrl, type Pixels } from "@/features/passport/prototype-fro-105/art";

/** A layer's pixels as an <img> source, cached per layer. */
export function useLayerUrl(pixels: Pixels): string {
  return useMemo(() => toDataUrl(pixels), [pixels]);
}

export function useBodyUrl(): string {
  return useLayerUrl(BODY);
}
