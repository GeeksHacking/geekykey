import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod/mini";

import { describeError, isApiError } from "@/api/errors";
import type { EventStationBoardStation } from "@/api/types";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useSetStationBooth } from "@/features/stations/use-set-station-booth";
import { BOOTH_NAMES, isBooth } from "@/lib/booth";
import { applyApiIssues } from "@/lib/form-errors";
import { cn } from "@/lib/utils";

const schema = z.object({
  booth: z.string().check(z.trim(), z.refine(isBooth, "Keep it under 80 characters.")),
});

type BoothValues = z.infer<typeof schema>;

/** A name outside the map's own plan still saves, so the organiser can place it later. */
const HINT =
  "Another name still saves, and the map lists the station beside the plan. Blank means no booth.";

/**
 * Agreement 9.12. One field, because a booth is free text the map matches to its own floor
 * plan; the station's name, points and passport stay out of this form and on 9.1's.
 */
export function BoothForm({
  station,
  onSaved,
}: {
  station: EventStationBoardStation;
  onSaved: () => void;
}) {
  const setBooth = useSetStationBooth();
  const editing = station.booth !== null;
  const form = useForm<BoothValues>({
    resolver: zodResolver(schema),
    defaultValues: { booth: station.booth ?? "" },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const name = station.passport?.name ?? station.label;

  async function onSubmit(values: BoothValues) {
    setFormError(null);
    try {
      await setBooth.mutateAsync({ stationId: station.id, input: { booth: values.booth } });
      onSaved();
    } catch (error) {
      // 9.12 has no sentence of its own in section 13, so the service's issue text is what
      // the field shows. A refusal that names no field here goes on the form-level line.
      if (isApiError(error) && error.code === "validation_failed") {
        const issues = Array.isArray(error.issues) ? error.issues : [];
        const leftover = applyApiIssues(form, issues);
        setFormError(leftover.length ? leftover.join(" ") : describeError(error));
      } else {
        setFormError(describeError(error));
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <DialogHeader>
          <DialogTitle>{editing ? "Change the booth" : "Set a booth"}</DialogTitle>
          <DialogDescription>
            Where the map draws {name}, whatever game it runs and however many taps it has.
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="booth"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="look-label">Booth</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  placeholder={BOOTH_NAMES[0]}
                  className="w-32 font-mono"
                />
              </FormControl>
              <div className="flex flex-wrap gap-2">
                {BOOTH_NAMES.map((booth) => {
                  const selected = field.value.trim().toLowerCase() === booth.toLowerCase();
                  return (
                    <Button
                      key={booth}
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={selected}
                      className={cn(selected && "border-primary-edge bg-accent")}
                      onClick={() =>
                        form.setValue("booth", booth, { shouldDirty: true, shouldValidate: true })
                      }
                    >
                      {booth}
                      {selected ? <Check aria-hidden /> : null}
                    </Button>
                  );
                })}
              </div>
              <FormDescription>{HINT}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError ? (
          <p role="alert" className="text-sm text-destructive-text">
            {formError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
