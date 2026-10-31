import { useState } from "react";

const COLOURS = ["#d4af37", "#f3d36b", "#f4f1e8", "#c8b48e", "#9e7b2f"];
const COUNT = 28;

interface Bit {
  left: number;
  delay: number;
  drift: number;
  colour: string;
  wide: boolean;
}

function scatter(): Bit[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.35,
    drift: (Math.random() - 0.5) * 6,
    colour: COLOURS[i % COLOURS.length]!,
    wide: i % 3 === 0,
  }));
}

/**
 * Gold confetti falling over the stage at 6 of 6 (FRO-105). CSS only, so a phone without
 * WebGL gets it too, and a device that asked for reduced motion gets none.
 */
export function Confetti() {
  const [bits] = useState(scatter);
  const [still] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (still) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {bits.map((bit, i) => (
        <span
          key={i}
          className="absolute -top-4 block animate-[avatar-confetti_1.5s_ease-in_both]"
          style={{
            left: `${bit.left}%`,
            width: bit.wide ? "0.6rem" : "0.35rem",
            height: bit.wide ? "0.3rem" : "0.6rem",
            backgroundColor: bit.colour,
            animationDelay: `${bit.delay}s`,
            ["--drift" as string]: `${bit.drift}rem`,
          }}
        />
      ))}
    </div>
  );
}
