import { useState } from "react";

import { describeError } from "@/api/errors";
import { CornerBrackets } from "@/components/look/corner-brackets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useGroupBoardBusy, useGroupBoardChange } from "@/features/groups/use-group-board";

/** The two settings, in the order the screen lists them, the new event's first. */
const CHOICES: { value: "off" | "on"; label: string; description: string }[] = [
  {
    value: "off",
    label: "Off",
    description: "Connections follow the rule above, and a pair connects once.",
  },
  {
    value: "on",
    label: "On",
    description:
      "Anyone connects with anyone, and a pair can connect again for a new challenge. Answers stay open, and what two people share shows at once.",
  },
];

/**
 * Showcase mode (agreement 9.21, for the next version), for demoing connections at a booth with
 * the same phones and tokens again and again, and the reset of every participant (9.22) that
 * clears the booth for the next demo. The switch works as the connection rule's does: while a
 * change is sent the screen shows the choice pressed, and a failure puts back the board's.
 */
export function ShowcaseSetting({ value }: { value: boolean }) {
  const setShowcase = useGroupBoardChange();
  const shown =
    setShowcase.isPending && setShowcase.variables?.type === "showcase"
      ? setShowcase.variables.showcase
      : value;
  return (
    <section aria-labelledby="groups-showcase" className="rounded-lg border p-4">
      <h2 id="groups-showcase" className="type-item">
        Showcase mode
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        For demos at the booth. Connections already made stay when it changes.
      </p>
      <RadioGroup
        aria-labelledby="groups-showcase"
        value={shown ? "on" : "off"}
        disabled={setShowcase.busy}
        onValueChange={(next) => {
          const on = next === "on";
          if (on !== value) setShowcase.mutate({ type: "showcase", showcase: on });
        }}
        className="mt-3 gap-3"
      >
        {CHOICES.map((choice) => (
          <div key={choice.value} className="flex items-start gap-2">
            <RadioGroupItem
              id={`showcase-${choice.value}`}
              value={choice.value}
              aria-describedby={`showcase-${choice.value}-description`}
              // The label's line is 24px (leading-6) and the circle 16px, so 4px centres it on the first line.
              className="mt-1"
            />
            <div className="min-w-0">
              <Label htmlFor={`showcase-${choice.value}`}>{choice.label}</Label>
              <p
                id={`showcase-${choice.value}-description`}
                className="text-sm text-muted-foreground"
              >
                {choice.description}
              </p>
            </div>
          </div>
        ))}
      </RadioGroup>
      {setShowcase.isError ? (
        <p role="alert" className="mt-3 text-sm text-destructive-text">
          Couldn't change showcase mode. {describeError(setShowcase.error)}
        </p>
      ) : null}
      <div className="mt-4">
        <ResetParticipantsDialog />
      </div>
    </section>
  );
}

/**
 * The reset of every participant (9.22). It always asks first, as the groups' Reset does, since
 * it can't be undone. Radix mounts the content only once it opens, so each opening starts without
 * the last one's error.
 */
function ResetParticipantsDialog() {
  const [open, setOpen] = useState(false);
  const busy = useGroupBoardBusy();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={busy}>
          Reset all participants
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <CornerBrackets />
        <ResetParticipantsConfirm onDone={() => setOpen(false)} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ResetParticipantsConfirm({ onDone }: { onDone: () => void }) {
  const reset = useGroupBoardChange();
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    try {
      await reset.mutateAsync({ type: "resetParticipants" });
      onDone();
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Reset all participants?</AlertDialogTitle>
        <AlertDialogDescription>
          Everyone except organisers is signed out and their account goes: name, answers, stamps,
          connections, requests and place in a group. Their tokens are free to claim again.
          Stations, groups and settings stay. This can't be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {error ? (
        <p role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={reset.busy}>Cancel</AlertDialogCancel>
        {/* AlertDialogAction is a Close, so preventDefault holds the alert open until the call
            has answered, and a refusal has somewhere to show. */}
        <AlertDialogAction
          disabled={reset.busy}
          onClick={(event) => {
            event.preventDefault();
            void handleConfirm();
          }}
        >
          {reset.isPending ? "Resetting" : "Reset"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
