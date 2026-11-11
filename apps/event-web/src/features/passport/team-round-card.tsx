import { UsersThree } from "@phosphor-icons/react";
import { useContext, useEffect, useState } from "react";

import type { DuelRound } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { ConnectionDice } from "@/features/passport/connection-dice";
import { ConnectionReaction } from "@/features/passport/connection-reaction";
import { ReactionTest } from "@/features/passport/reaction/reaction-test";
import { RoundCountdown } from "@/features/passport/round-countdown";
import { RoundPollingContext } from "@/lib/round-polling";
import { readDismissed } from "@/features/passport/round-dismissal";
import { cn } from "@/lib/utils";

export function TeamRoundCard({ userId, round }: { userId: string; round?: DuelRound | null }) {
  const setMounted = useContext(RoundPollingContext);
  useEffect(() => {
    setMounted?.(true);
    return () => setMounted?.(false);
  }, [setMounted]);
  const key = `gk-round-dismissed:${userId}`;
  const [dismissed, setDismissed] = useState(() => readDismissed(key));
  if (!round || (round.state === "ended" && dismissed === round.id)) return null;
  const { result } = round;
  const nobody = result?.outcome === "nobody_joined";
  const title =
    round.state === "opening"
      ? "You're in!"
      : !result
        ? "Play your duels"
        : nobody
          ? "Nobody else joined."
          : result.outcome === "loss"
            ? // Equal duel wins are a win for both, but a round with no duel won is a win for nobody.
              result.your_team_wins === result.their_team_wins
              ? "Nobody won this round."
              : "Your team lost."
            : result.your_team_wins === result.their_team_wins
              ? "Both teams won!"
              : "Your team won!";
  return (
    <section aria-label="Team duels" className="relative rounded-lg border bg-card p-4 sm:p-5">
      <CornerBrackets />
      <div className="flex items-baseline justify-between gap-3">
        <p className="look-label flex items-center gap-2 text-muted-foreground">
          <UsersThree aria-hidden weight="fill" className="size-4" />
          Team duels
        </p>
        {round.state === "ended" ? (
          <Button
            variant="ghost"
            className="h-auto px-2 py-0 text-xs"
            onClick={() => {
              try {
                localStorage.setItem(key, round.id);
              } catch {
                /* Still dismiss for this page. */
              }
              setDismissed(round.id);
            }}
          >
            Dismiss
          </Button>
        ) : null}
      </div>
      <div role="status" aria-atomic="true">
        <h2 className="type-lead mt-1">{title}</h2>
        {result && !nobody ? (
          <p className="mt-1 text-sm tabular-nums">
            Your team: {result.your_team_wins} duel {result.your_team_wins === 1 ? "win" : "wins"}.
            Other team: {result.their_team_wins} duel{" "}
            {result.their_team_wins === 1 ? "win" : "wins"}.
          </p>
        ) : null}
      </div>
      {result && !nobody && result.your_team_wins === result.their_team_wins ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {result.outcome === "win"
            ? "The teams won the same number of duels."
            : "No duel was won."}
        </p>
      ) : null}
      {result?.outcome === "win" ? (
        <p className="mt-2 text-sm font-medium">Your team's win earned an avatar piece.</p>
      ) : null}
      {round.state === "opening" ? (
        <div className="mt-3 space-y-2">
          <RoundCountdown key={round.id} closesAt={round.closes_at} />
          <p className="text-sm text-muted-foreground">
            {round.players} {round.players === 1 ? "player" : "players"} joined
          </p>
          <p className="text-sm">
            Others can tap the station to join. Teams are made automatically, then you get an
            opponent. No need to tap again.
          </p>
        </div>
      ) : nobody ? (
        <p className="mt-2 text-sm">Find someone to play with, then tap the station again.</p>
      ) : (
        <>
          <div className="mt-3 rounded-lg bg-muted p-3">
            <h3 className="type-item">Your team: {round.team?.toUpperCase()}</h3>
            <p className="mt-1 break-words text-sm">
              {round.teammates.length
                ? `Your teammates: ${round.teammates.join(", ")}.`
                : "You're on this team on your own."}
            </p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Teams are mixed for this round only.</p>
          {round.challenge === "dice" ? (
            <p className="mt-2 text-sm">The dice were rolled for you.</p>
          ) : null}
          {round.duels.length > 1 ? (
            <p className="mt-3 text-sm">
              You have two duels because the numbers are odd.{" "}
              {
                round.duels.filter(
                  (duel) =>
                    duel.dice ||
                    duel.reaction?.your_play === "played" ||
                    duel.reaction?.your_play === "early",
                ).length
              }{" "}
              of {round.duels.length} played.
            </p>
          ) : null}
          <div className={cn("mt-4 grid gap-4", round.duels.length > 1 && "sm:grid-cols-2")}>
            {round.duels.map((duel) => (
              <section
                key={duel.id}
                aria-label={`Duel with ${duel.opponent}`}
                className="min-w-0 space-y-3 rounded-lg border p-3"
              >
                <h3 className="type-item break-words">Opponent: {duel.opponent}</h3>
                {round.state === "ended" ? (
                  <p className="look-label text-muted-foreground">Your duel</p>
                ) : null}
                <ConnectionDice dice={duel.dice} layout="stack" reward={false} />
                {duel.reaction && round.state === "playing" ? (
                  <ReactionTest connectionId={duel.id} target="duel" reaction={duel.reaction} />
                ) : (
                  <ConnectionReaction reaction={duel.reaction} layout="stack" reward={false} />
                )}
                {round.state === "ended" ? (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-semibold">Connect with {duel.opponent}</p>
                    <p className="mt-1">
                      Tap your phone on {duel.opponent}&apos;s token to send a connection request.
                      When they accept, the usual connection rules apply.
                    </p>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
          {result ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Tap the station to start another round.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
