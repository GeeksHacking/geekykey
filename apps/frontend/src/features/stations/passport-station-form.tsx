import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { describeError, isApiError } from "@/api/errors";
import type { EventStationPassport } from "@/api/types";
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
import { useSetStationPassport } from "@/features/stations/use-set-station-passport";
import { applyApiIssues } from "@/lib/form-errors";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the station a name.")
    .max(80, "Keep it under 80 characters."),
  location: z.string().trim().max(80, "Keep it under 80 characters."),
  // Kept as text so the input stays controlled; converted on submit.
  points: z.string().trim().regex(/^\d+$/, "Whole numbers only, 0 or more."),
});

type StationValues = z.infer<typeof schema>;

/**
 * Agreement 9.1. The same form adds a station to the passport and changes one that is
 * already in it; `station` decides which, and prefills the fields when it is given.
 */
export function PassportStationForm({
  station,
  stationLabel,
  onSaved,
}: {
  station: { id: string; passport: EventStationPassport | null };
  /** Shown when the station has no passport settings yet, so the label still identifies it. */
  stationLabel: string;
  onSaved: () => void;
}) {
  const setPassport = useSetStationPassport();
  const editing = station.passport !== null;
  const form = useForm<StationValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: station.passport?.name ?? "",
      location: station.passport?.location ?? "",
      points: String(station.passport?.points ?? 1),
    },
  });
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: StationValues) {
    setFormError(null);
    try {
      await setPassport.mutateAsync({
        stationId: station.id,
        input: {
          name: values.name,
          location: values.location || undefined,
          points: Number(values.points),
        },
      });
      onSaved();
    } catch (error) {
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
          <DialogTitle>{editing ? "Change passport settings" : "Add to passport"}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Points and the name shown on participants' passports for ${stationLabel}.`
              : `Give ${stationLabel} a name, so taps there count in the passport.`}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" placeholder="3D Printing Booth" />
              </FormControl>
              <FormDescription>Shown on the participant&apos;s passport.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" placeholder="Hall A" />
              </FormControl>
              <FormDescription>Optional. Helps participants find it.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="points"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Points per accepted tap</FormLabel>
              <FormControl>
                <Input {...field} inputMode="numeric" className="w-24 font-mono" />
              </FormControl>
              <FormDescription>Optional. Whole number, 0 or more.</FormDescription>
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
            {form.formState.isSubmitting ? "Saving" : editing ? "Save changes" : "Add to passport"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
