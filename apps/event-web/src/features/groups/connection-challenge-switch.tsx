import { describeError } from "@/api/errors";
import type { Challenge } from "@/api/types";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useGroupBoardChange } from "@/features/groups/use-group-board";

/** The three settings, in the order the screen lists them, the new event's first. */
const CHOICES: { value: Challenge; label: string; description: string }[] = [
  {
    value: "random",
    label: "Random",
    description: "Each new connection gets the dice or the reaction test, picked at random.",
  },
  {
    value: "dice",
    label: "Dice",
    description: "Each new connection rolls the dice.",
  },
  {
    value: "reaction",
    label: "Reaction",
    description: "Each new connection plays the reaction test.",
  },
];

/**
 * Which challenge a new connection plays (BAC-161): either at random, as a new event starts, or
 * always the dice or always the reaction test. It applies from the next connection, and
 * connections already made keep theirs. It works as the connection rule's switch does: while a
 * change is sent the screen shows the choice pressed, and a failure puts back the board's.
 */
export function ConnectionChallengeSwitch({ value }: { value: Challenge }) {
  const setChallenge = useGroupBoardChange();
  const shown =
    setChallenge.isPending && setChallenge.variables?.type === "challenge"
      ? setChallenge.variables.challenge
      : value;
  return (
    <section aria-labelledby="groups-challenge" className="rounded-lg border p-4">
      <h2 id="groups-challenge" className="type-item">
        Challenge
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        What each new connection plays. Connections already made keep theirs.
      </p>
      <RadioGroup
        aria-labelledby="groups-challenge"
        value={shown}
        disabled={setChallenge.busy}
        onValueChange={(next) => {
          const choice = CHOICES.find((candidate) => candidate.value === next);
          if (choice && choice.value !== value)
            setChallenge.mutate({ type: "challenge", challenge: choice.value });
        }}
        className="mt-3 gap-3"
      >
        {CHOICES.map((choice) => (
          <div key={choice.value} className="flex items-start gap-2">
            <RadioGroupItem
              id={`challenge-${choice.value}`}
              value={choice.value}
              aria-describedby={`challenge-${choice.value}-description`}
              className="mt-0.5"
            />
            <div className="min-w-0">
              <Label htmlFor={`challenge-${choice.value}`}>{choice.label}</Label>
              <p
                id={`challenge-${choice.value}-description`}
                className="text-sm text-muted-foreground"
              >
                {choice.description}
              </p>
            </div>
          </div>
        ))}
      </RadioGroup>
      {setChallenge.isError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Couldn't change the challenge. {describeError(setChallenge.error)}
        </p>
      ) : null}
    </section>
  );
}
