import { describeError } from "@/api/errors";
import type { ConnectAcross } from "@/api/types";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useGroupBoardChange } from "@/features/groups/use-group-board";

/** The two settings, in the order the screen lists them, the new event's first. */
const CHOICES: { value: ConnectAcross; label: string; description: string }[] = [
  {
    value: "token_kinds",
    label: "Connect across token kinds",
    description: "Two people connect when their tokens are of different kinds.",
  },
  {
    value: "groups",
    label: "Connect across groups",
    description: "Two people connect when they are in different groups, whatever their tokens.",
  },
];

/**
 * What a connection needs (BAC-140): different token kinds, as a new event starts, or different
 * groups. It applies from the next tap, and connections already made stay. While a change is
 * sent the screen shows the choice pressed, and a failure puts back the board's.
 */
export function ConnectionRuleSwitch({ value }: { value: ConnectAcross }) {
  const setRule = useGroupBoardChange();
  const shown =
    setRule.isPending && setRule.variables?.type === "rule"
      ? setRule.variables.connectAcross
      : value;
  return (
    <section aria-labelledby="groups-connections" className="rounded-lg border p-4">
      <h2 id="groups-connections" className="font-semibold">
        Connections
      </h2>
      <RadioGroup
        aria-labelledby="groups-connections"
        value={shown}
        disabled={setRule.busy}
        onValueChange={(next) => {
          const choice = CHOICES.find((candidate) => candidate.value === next);
          if (choice && choice.value !== value)
            setRule.mutate({ type: "rule", connectAcross: choice.value });
        }}
        className="mt-3 gap-3"
      >
        {CHOICES.map((choice) => (
          <div key={choice.value} className="flex items-start gap-2">
            <RadioGroupItem
              id={`connect-across-${choice.value}`}
              value={choice.value}
              aria-describedby={`connect-across-${choice.value}-description`}
              className="mt-0.5"
            />
            <div className="min-w-0">
              <Label htmlFor={`connect-across-${choice.value}`}>{choice.label}</Label>
              <p
                id={`connect-across-${choice.value}-description`}
                className="text-sm text-muted-foreground"
              >
                {choice.description}
              </p>
            </div>
          </div>
        ))}
      </RadioGroup>
      {setRule.isError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Couldn't change what connections need. {describeError(setRule.error)}
        </p>
      ) : null}
    </section>
  );
}
