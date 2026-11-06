import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";

/**
 * The dashboard's standing way into My tokens (FRO-129). The tap help goes after the
 * first tap, but a participant may need to release a token at any time. The Event
 * Service never sees a token UID (agreement 8.1, ADR 0006), so the GeekyKey page does
 * the release and this only links to it.
 */
export function MyTokensLink() {
  return (
    <p className="text-sm text-muted-foreground">
      See and release your tokens on{" "}
      <a
        href={GEEKYKEY_SCREENS_URL}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-primary-text underline-offset-4 hover:underline"
      >
        My tokens
      </a>
      .
    </p>
  );
}
