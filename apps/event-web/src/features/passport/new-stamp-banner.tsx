import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import type { NewStampLink } from "@/features/passport/passport-changes";

interface NewStampBannerProps {
  offer: NewStampLink;
  onDismiss: () => void;
  onPress: () => void;
}

/**
 * The group's page offered after a new stamp (FRO-89). It stays until the visitor presses the
 * link, dismisses it, or another stamp fills. It never opens the page by itself.
 */
export function NewStampBanner({ offer, onDismiss, onPress }: NewStampBannerProps) {
  return (
    <section
      role="status"
      aria-label={`New stamp at ${offer.name}`}
      className="relative flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <CornerBrackets />
      <div className="min-w-0">
        <p className="look-label text-muted-foreground">New stamp</p>
        <p className="mt-1 font-medium">{offer.name}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <a href={offer.link} target="_blank" rel="noopener noreferrer" onClick={onPress}>
            Open their page?
          </a>
        </Button>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </section>
  );
}
