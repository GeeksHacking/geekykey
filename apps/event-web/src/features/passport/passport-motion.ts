import gsap from "gsap";

import { DESKTOP_MOTION } from "@/features/passport/desktop-motion";
import type { PassportChanges } from "@/features/passport/passport-changes";
import { formatCount } from "@/lib/format";

/*
  The passport's animations at desktop widths. Only desktop-motion.ts imports this file, with
  import(), so a phone never downloads it or GSAP. It plays what the screen marked with
  `data-changed` and decides nothing itself.

  gsap.matchMedia() runs them only while DESKTOP_MOTION matches. If the window narrows, or the
  device asks for reduced motion, mid-animation, it reverts them to the screen's final state.
  It would run them again when the query matches again, so `played` lets them run once.

  They move only the screen's own elements, never the look's decoration, so a stamp plays the
  same in every look.
*/
export function playPassportChanges(scope: HTMLElement, changes: PassportChanges): () => void {
  const media = gsap.matchMedia(scope);
  let played = false;
  media.add(DESKTOP_MOTION, () => {
    if (played) return;
    played = true;
    for (const tile of scope.querySelectorAll<HTMLElement>('[data-changed="stamp"]')) {
      playStampEarned(tile);
    }
    const slots = scope.querySelectorAll('[data-changed="slot"]');
    if (slots.length > 0) {
      playSlotsFilling(slots);
    }
    const points = scope.querySelector('[data-changed="points"]')?.firstChild;
    if (points instanceof Text && changes.points) {
      return countUp(points, changes.points);
    }
  });
  return () => media.revert();
}

function playSlotsFilling(slots: NodeListOf<Element>) {
  gsap.fromTo(
    slots,
    { scaleX: 0 },
    {
      scaleX: 1,
      transformOrigin: "left center",
      duration: 0.5,
      delay: 0.3,
      ease: "power3.out",
      stagger: 0.08,
    },
  );
}

/** The one long animation: the seal presses into the slot, then the slot's note comes in. */
function playStampEarned(tile: HTMLElement) {
  gsap
    .timeline()
    .fromTo(tile, { opacity: 0.4, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.35 })
    .fromTo(
      tile.querySelectorAll("[data-stamp-seal]"),
      { scale: 2.4, rotation: -14, opacity: 0 },
      { scale: 1, rotation: 0, opacity: 1, duration: 0.55, ease: "back.out(1.8)" },
      0.15,
    )
    .fromTo(
      tile.querySelectorAll("[data-stamp-note]"),
      { y: 6, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
      0.65,
    );
}

/*
  Counts the points up in the text node React rendered, rather than replacing it, so React
  still owns the node afterwards. The count always ends on the number React rendered, and
  the cleanup puts it there at once if the count is cut short.
*/
function countUp(text: Text, { from, to }: NonNullable<PassportChanges["points"]>) {
  const shown = { value: from };
  text.nodeValue = formatCount(from);
  gsap.to(shown, {
    value: to,
    duration: 0.9,
    ease: "power1.out",
    onUpdate: () => {
      text.nodeValue = formatCount(Math.round(shown.value));
    },
  });
  return () => {
    text.nodeValue = formatCount(to);
  };
}
