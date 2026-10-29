import { zodResolver } from "@hookform/resolvers/zod";
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
import { isBooth } from "@/lib/booth";
import { applyApiIssues } from "@/lib/form-errors";

const schema = z.object({
  booth: z.string().check(z.trim(), z.refine(isBooth, "Keep it under 80 characters.")),
});

type BoothValues = z.infer<typeof schema>;

/**
 * The example layout's booth codes, from `.scratch/mph/`, so an organiser knows what the
 * map's own floor plan understands (`features/map/floor-plan.ts`). A code it doesn't name
 * still saves, and 9.10 has the map list that station beside the plan.
 */
const HINT =
  "The example plan names A1 to A3, B1 to B6 and C1 to C5. Another code still saves, and the map lists the station beside the plan. Blank means no booth.";

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
              <FormLabel>Booth</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" placeholder="A3" className="w-32 font-mono" />
              </FormControl>
              <FormDescription>{HINT}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError ? (
          <p role="alert" className="text-sm text-destructive">
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
