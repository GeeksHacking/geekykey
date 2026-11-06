import { useState } from "react";

import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { GROUP_FORM_DESCRIPTION, GroupForm } from "@/features/groups/group-form";
import { SplitGroupsForm } from "@/features/groups/split-groups-form";
import { useGroupBoardBusy } from "@/features/groups/use-group-board";
import type { SplitWay } from "@/features/groups/split-groups-schema";

type Way = SplitWay | "by_hand";

const SPLIT_DESCRIPTION = "Makes the groups and places everyone who has joined, in one step.";

/** The three ways, in the order the dialog lists them, with what each one says it does. */
const WAYS: { value: Way; label: string; description: string }[] = [
  { value: "people_per_group", label: "By people per group", description: SPLIT_DESCRIPTION },
  { value: "group_count", label: "By number of groups", description: SPLIT_DESCRIPTION },
  { value: "by_hand", label: "By hand", description: GROUP_FORM_DESCRIPTION },
];

/**
 * The header's one way of making groups (BAC-146). The way chosen outlives the dialog, so an
 * organiser making several groups by hand doesn't choose it each time. The Groups board coordinates
 * this write with every other change. `joined`, `groupsThere` and `someonePlaced` come from the screen's
 * poll, which keeps running behind the dialog.
 */
export function MakeGroupsDialog({
  disabled,
  joined,
  groupsThere,
  someonePlaced,
}: {
  disabled: boolean;
  joined: number;
  groupsThere: number;
  someonePlaced: boolean;
}) {
  const busy = useGroupBoardBusy();
  const [open, setOpen] = useState(false);
  const [way, setWay] = useState<Way>("people_per_group");
  const close = () => setOpen(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          Make groups
        </Button>
      </DialogTrigger>
      <DialogContent>
        <CornerBrackets />
        {/* The contents scroll rather than the dialog, which would clip the corner brackets, so a
            short screen can still reach Split. The padding keeps focus rings inside it. */}
        <div className="-m-1 max-h-[calc(100dvh-5rem)] space-y-4 overflow-y-auto p-1">
          <DialogHeader>
            <DialogTitle>Make groups</DialogTitle>
            <DialogDescription>
              {WAYS.find(({ value }) => value === way)?.description}
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            aria-label="How to make groups"
            disabled={busy}
            value={way}
            onValueChange={(next) => {
              const chosen = WAYS.find(({ value }) => value === next);
              if (chosen) setWay(chosen.value);
            }}
            className="gap-2 sm:flex sm:flex-wrap sm:gap-x-4"
          >
            {WAYS.map(({ value, label }) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem id={`make-groups-${value}`} value={value} />
                <Label htmlFor={`make-groups-${value}`}>{label}</Label>
              </div>
            ))}
          </RadioGroup>
          {way === "by_hand" ? (
            <GroupForm onSaved={close} />
          ) : (
            // Each way starts with its own empty number and no refusal from the other.
            <SplitGroupsForm
              key={way}
              way={way}
              joined={joined}
              groupsThere={groupsThere}
              someonePlaced={someonePlaced}
              onSplit={close}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
