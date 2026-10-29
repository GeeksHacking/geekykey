import type { PassportChanges } from "@/features/passport/passport-changes";

/**
 * Where the passport plays its changes with GSAP: 1024 px and up (Tailwind's `lg`), on a
 * device that hasn't asked for reduced motion. Anywhere else it never downloads GSAP.
 */
export const DESKTOP_MOTION = "(min-width: 1024px) and (prefers-reduced-motion: no-preference)";

type PassportMotion = typeof import("@/features/passport/passport-motion");

let loading: Promise<PassportMotion> | undefined;
let loaded: PassportMotion | undefined;

/*
  The passport's GSAP comes through import() only, so it is its own file that a phone never
  asks for. A failed download is forgotten so the next change tries again; until then the
  change just shows, without the animation.
*/
function load(): Promise<PassportMotion> | undefined {
  if (!window.matchMedia(DESKTOP_MOTION).matches) return undefined;
  loading ??= import("@/features/passport/passport-motion").then(
    (module) => (loaded = module),
    (error: unknown) => {
      loading = undefined;
      throw error;
    },
  );
  return loading;
}

/** Starts the download when the passport opens, so the first change finds GSAP ready. */
export function preloadDesktopMotion() {
  load()?.catch(() => {});
}

/**
 * Plays the changes on a desktop-width screen and returns what stops them. Once GSAP is
 * loaded it starts at once, before the browser paints the changed screen, so nothing flashes
 * in its final state first.
 */
export function playOnDesktop(scope: HTMLElement, changes: PassportChanges): () => void {
  if (loaded) return loaded.playPassportChanges(scope, changes);
  const pending = load();
  if (!pending) return () => {};
  let stop: (() => void) | undefined;
  let cancelled = false;
  pending.then(
    (module) => {
      if (!cancelled) stop = module.playPassportChanges(scope, changes);
    },
    () => {},
  );
  return () => {
    cancelled = true;
    stop?.();
  };
}
