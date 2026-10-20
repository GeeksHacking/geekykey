import { cn } from "@/lib/utils";

interface WordmarkProps {
  className?: string;
  size?: "default" | "lg";
}

/*
  The GeeksHacking branding kit's logos, exported from its Figma file unrecoloured.
  Small: the secondary logo (the glasses, the kit's choice when space is limited) beside the
  product name. Large: the primary logo stacked over the product name, so the login page
  reads "GeeksHacking, then GeekyKey".
*/
export function Wordmark({ className, size = "default" }: WordmarkProps) {
  if (size === "lg") {
    return (
      <span className={cn("inline-flex flex-col items-start gap-3", className)}>
        <img src="/brand/gh-logo-primary.svg" alt="GeeksHacking" className="h-20 w-auto" />
        <span className="text-2xl font-bold tracking-[0.06em]">GeekyKey</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-base font-bold tracking-[0.02em]",
        className,
      )}
    >
      <img src="/brand/gh-logo-secondary.svg" alt="" className="h-5 w-auto" />
      GeekyKey
    </span>
  );
}
