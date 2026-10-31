/*
  PROTOTYPE, throwaway. Floating bar that cycles `?variant=` with the arrows or the arrow keys.
  Only rendered in dev builds. `children` adds prototype-only controls to the bar.
*/
import { useEffect, type ReactNode } from "react";

interface PrototypeSwitcherProps {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
  children?: ReactNode;
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
  children,
}: PrototypeSwitcherProps) {
  const index = Math.max(
    variants.findIndex((v) => v.key === current),
    0,
  );
  const step = (by: number) =>
    onChange(variants[(index + by + variants.length) % variants.length]!.key);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;
  const btn = "grid size-8 place-items-center rounded-full hover:bg-white/15";
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/85 px-2 py-1.5 text-sm text-white shadow-xl ring-1 ring-white/20 backdrop-blur">
      <button type="button" className={btn} onClick={() => step(-1)} aria-label="Previous variant">
        ←
      </button>
      <span className="min-w-36 text-center font-mono text-xs">
        {variants[index]!.key} ({variants[index]!.name})
      </span>
      <button type="button" className={btn} onClick={() => step(1)} aria-label="Next variant">
        →
      </button>
      {children ? (
        <span className="ml-1 flex items-center gap-1 border-l border-white/20 pl-2">
          {children}
        </span>
      ) : null}
    </div>
  );
}
