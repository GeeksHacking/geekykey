import { cn } from "@/lib/utils";

/**
 * The avatar as one flat picture: the first paint, and all a phone without WebGL shows. At
 * 6 of 6 it turns round once, as the cubes do. Reduced motion stops it (globals.css).
 */
export function FlatAvatar({ url, spinning }: { url: string; spinning: boolean }) {
  return (
    <div className="h-full [perspective:900px]">
      <img
        src={url}
        alt=""
        className={cn(
          "mx-auto h-full max-w-full object-contain [image-rendering:pixelated]",
          spinning && "animate-[avatar-spin_1.4s_ease-in-out]",
        )}
      />
    </div>
  );
}
