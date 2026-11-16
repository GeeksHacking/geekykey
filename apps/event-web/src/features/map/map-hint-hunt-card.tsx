import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { useId } from "react";

import type { HintHuntRound } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { hintHuntCountdown, hintHuntMessage, hintHuntState } from "@/features/map/hint-hunt";
import { cn } from "@/lib/utils";

/** The line that says where the round is, sized for its state: a result outweighs the hints. */
function StateMessage({ round, now }: { round: HintHuntRound | undefined; now: number }) {
  const state = hintHuntState(round, now);
  const message = hintHuntMessage(round, now);
  if (state === "joining" && round) {
    return (
      <p className="text-lg text-muted-foreground">
        <span className="font-mono text-4xl font-semibold tabular-nums text-primary-text lg:text-5xl">
          {round.players}
        </span>{" "}
        in
      </p>
    );
  }
  if (state === "ended") {
    const won = round?.ended_how === "won";
    const Icon = won ? CheckCircle : XCircle;
    return (
      <p className={cn("type-lead flex items-start gap-2 lg:text-3xl", won && "text-primary-text")}>
        <Icon aria-hidden weight="bold" className="mt-[0.15em] size-[1.1em] shrink-0" />
        <span>{message}</span>
      </p>
    );
  }
  if (state === "idle") return <p className="type-lead lg:text-2xl">{message}</p>;
  return <p className="text-lg leading-snug lg:text-xl">{message}</p>;
}

/**
 * One station's round, as a band across the top of the map so four hints fit without scrolling.
 * The hints are read across the booth, so each choice is large and takes the yellow accent, with
 * its question smaller above it. The countdown sits by the heading, outside the live region, so a
 * screen reader isn't told every second.
 */
export function MapHintHuntCard({
  booth,
  round,
  now,
}: {
  booth: string;
  round: HintHuntRound | undefined;
  now: number;
}) {
  const headingId = useId();
  const boothId = useId();
  const state = hintHuntState(round, now);
  const countdown = hintHuntCountdown(round, now);
  const hints = state === "running" || state === "ended" ? round?.hints : undefined;
  return (
    <section aria-labelledby={`${headingId} ${boothId}`} className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-x-4">
          <h2 id={headingId} className="type-section">
            Hint hunt
          </h2>
          <span
            id={boothId}
            className="font-mono text-sm tracking-[0.16em] text-foreground uppercase lg:text-base"
          >
            {booth}
          </span>
        </div>
        {countdown ? (
          <p className="font-mono text-xl font-semibold tabular-nums lg:text-2xl">{countdown}</p>
        ) : null}
      </div>
      <div className="relative">
        <CornerBrackets />
        <div className="@container rounded-lg border border-border bg-card px-4 py-3">
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="grid gap-x-8 gap-y-3 @min-[48rem]:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]"
          >
            <div className="space-y-2">
              <StateMessage round={round} now={now} />
              {state === "idle" || state === "joining" ? (
                <p className="text-sm text-muted-foreground lg:text-base">
                  A round needs 3 players from 2 groups.
                </p>
              ) : null}
              {state === "running" && round ? (
                <p className="font-mono text-2xl font-semibold tabular-nums lg:text-3xl">
                  {round.tries_left === 1 ? "1 try left" : `${round.tries_left} tries left`}
                </p>
              ) : null}
            </div>
            {hints && hints.length > 0 ? (
              <ol className="grid gap-x-6 gap-y-3 @min-[28rem]:grid-cols-2 @min-[88rem]:grid-cols-4">
                {hints.map((hint, index) => (
                  <li key={`${index}:${hint.short}`} className="min-w-0 space-y-1 break-words">
                    <p className="text-sm leading-snug text-muted-foreground lg:text-base">
                      {hint.question}
                    </p>
                    <p className="text-2xl leading-tight font-semibold text-primary-text lg:text-3xl">
                      {hint.choice}
                    </p>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
