import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, type RefObject } from "react";

import type { MapRelayResponse } from "@/api/types";
import type { RelayView } from "@/features/map/relay";

gsap.registerPlugin(useGSAP);

/**
 * Plays the events deriveRelay found between the last two polls. With reduced motion it plays
 * nothing: the count, the waiting mark and the status text change on their own.
 */
export function useMapRelayAnimations(
  scope: RefObject<SVGGElement | null>,
  view: RelayView,
  data: MapRelayResponse | undefined,
) {
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
      if (reducedMotion.current) return;
      for (const event of view.events) {
        if (event === "transferred") {
          // A transfer whose station isn't known, such as the last one after a missed call,
          // only shows in the count.
          const to = view.arrivedAt;
          const from = view.endpoints.find((item) => item !== to);
          const target = scope.current?.querySelector("[data-relay-transfer]");
          // The dot stays solid while it travels, so it reads from across the booth, then fades
          // where it arrived.
          if (target && to && from) {
            gsap.fromTo(
              target,
              { attr: { cx: from.x, cy: from.y }, opacity: 1 },
              { attr: { cx: to.x, cy: to.y }, duration: 0.75, ease: "power2.inOut" },
            );
            gsap.to(target, { opacity: 0, duration: 0.25, delay: 0.75 });
          }
        } else if (event === "lost") {
          const [a, b] = view.endpoints;
          const target = scope.current?.querySelector("[data-relay-loss]");
          if (target)
            gsap.fromTo(
              target,
              {
                attr: { transform: `translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2})` },
                opacity: 1,
              },
              { opacity: 0, duration: 0.6, delay: 0.5, ease: "power2.in" },
            );
        } else {
          const target = scope.current?.querySelector("[data-relay-line]");
          if (target)
            gsap.fromTo(
              target,
              { opacity: 0.2 },
              { opacity: 1, duration: 0.2, repeat: 2, yoyo: true },
            );
        }
      }
    },
    // Only a new relay poll runs this, so a re-render alone, such as the map's own poll, doesn't
    // revert a tween that's still playing. `view` comes from the same render as `data`.
    { dependencies: [data], scope, revertOnUpdate: true },
  );
}
