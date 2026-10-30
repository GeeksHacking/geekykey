import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, type RefObject } from "react";

import type { MapStation } from "@/api/types";
import { stationsToPulse } from "@/features/map/pulses";
import { SPOT_RADIUS } from "@/features/map/marker-size";

gsap.registerPlugin(useGSAP);

/** The ring's radius at rest and at the end of a pulse, in plan units. */
const RING_FROM = SPOT_RADIUS;
const RING_TO = SPOT_RADIUS * 2.75;

/**
 * How long a station's pulses for one poll may take in all, in seconds. Several taps in one poll
 * play back to back on the same ring, each shortened to fit, so they end before the next poll
 * (POLL_MAP_MS, 2 s) reverts them.
 */
const PULSES_SECONDS = 1.8;

/*
  Plays a pulse on each station whose taps went up since the last poll, once per new tap.
  stationsToPulse decides which stations and how many times, and this only plays it. TanStack
  Query hands back the same array when a poll changed nothing, so an unchanged poll doesn't
  even run the effect.

  The ring grows by its `r` attribute rather than a transform, so nothing depends on the SVG's
  layout. With reduced motion asked for, the ring only fades and doesn't grow.
*/
export function useMapPulses(
  scope: RefObject<SVGSVGElement | null>,
  stations: readonly MapStation[] | undefined,
) {
  const previous = useRef<readonly MapStation[] | undefined>(undefined);
  const reducedMotion = useRef(false);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: reduce)", () => {
      reducedMotion.current = true;
      return () => {
        reducedMotion.current = false;
      };
    });
  });

  useGSAP(
    () => {
      if (!stations) return;
      const pulses = stationsToPulse(previous.current, stations);
      previous.current = stations;
      for (const { stationId, count } of pulses) {
        const ring = scope.current?.querySelector(`[data-pulse="${CSS.escape(stationId)}"]`);
        if (!ring) continue;
        const still = reducedMotion.current;
        gsap.fromTo(
          ring,
          { attr: { r: RING_FROM }, opacity: 0.9 },
          {
            attr: { r: still ? RING_FROM : RING_TO },
            opacity: 0,
            duration: Math.min(still ? 1.4 : 1.1, PULSES_SECONDS / count),
            repeat: count - 1,
            ease: "power2.out",
            overwrite: true,
          },
        );
      }
    },
    // Each changed poll reverts the last poll's pulses, which have finished by then (a station's
    // pulses last at most PULSES_SECONDS and polls come every 2 s), so the context never fills
    // with old tweens.
    { dependencies: [stations], scope, revertOnUpdate: true },
  );
}
