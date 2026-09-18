import { Key } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

interface WordmarkProps {
  className?: string;
  size?: "default" | "lg";
}

export function Wordmark({ className, size = "default" }: WordmarkProps) {
  const large = size === "lg";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-extrabold tracking-[0.06em]",
        large ? "text-2xl" : "text-base",
        className,
      )}
    >
      <span
        className={cn(
          "grid place-items-center rounded-md border border-primary-edge bg-primary text-primary-foreground",
          large ? "h-9 w-9" : "h-7 w-7",
        )}
        aria-hidden
      >
        <Key weight="bold" className={large ? "h-5 w-5" : "h-4 w-4"} />
      </span>
      GeekyKey
    </span>
  );
}
