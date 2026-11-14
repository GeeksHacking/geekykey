import type { AvatarLook } from "@/api/types";
import { lookFrom } from "@/features/passport/avatar/avatar-colours";
import { useDressedUrl } from "@/features/passport/avatar/layers";
import { cn } from "@/lib/utils";

/** No earned pieces: someone else's avatar shows the look only (BAC-191). */
const NO_SLOTS = [] as const;

/**
 * Another person's avatar as a flat picture (FRO-181, BAC-191): their look at the size a card or
 * the profile needs, with no WebGL and none of the pieces they have earned. A null look draws the
 * default, and a part the screens don't know draws that part's default, as `lookFrom` decides.
 */
export function PersonAvatar({
  look,
  className,
}: {
  look?: AvatarLook | null;
  className?: string;
}) {
  const url = useDressedUrl(NO_SLOTS, lookFrom(look));
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      className={cn(
        "shrink-0 rounded-md bg-muted object-contain [image-rendering:pixelated]",
        className,
      )}
    />
  );
}
