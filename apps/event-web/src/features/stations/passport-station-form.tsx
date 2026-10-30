import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod/mini";

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
import { isGroupLink } from "@/lib/group-link";

const schema = z.object({
  name: z
    .string()
    .check(
      z.trim(),
      z.minLength(1, "Give the station a name."),
      z.maxLength(80, "Keep it under 80 characters."),
    ),
  location: z.string().check(z.trim(), z.maxLength(80, "Keep it under 80 characters.")),
  // Kept as text so the input stays controlled; converted on submit.
  points: z.string().check(z.trim(), z.regex(/^\d+$/, "Whole numbers only, 0 or more.")),
  link: z.string().check(
    z.trim(),
    z.refine(
      (value) => value === "" || isGroupLink(value),
      "Use a link that starts with https:// and is at most 300 characters.",
    ),
  ),
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
      link: station.passport?.link ?? "",
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
          link: values.link.trim() || undefined,
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
              <FormLabel className="look-label">Name</FormLabel>
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
              <FormLabel className="look-label">Location</FormLabel>
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
              <FormLabel className="look-label">Points per accepted tap</FormLabel>
              <FormControl>
                <Input {...field} inputMode="numeric" className="w-24 font-mono" />
              </FormControl>
              <FormDescription>Optional. Whole number, 0 or more.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="link"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="look-label">Group link</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  spellCheck={false}
                  placeholder="https://example.com/group"
                />
              </FormControl>
              <FormDescription>
                Optional. Opens after a participant&apos;s new stamp here. Use a link that starts
                with https://.
              </FormDescription>
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
