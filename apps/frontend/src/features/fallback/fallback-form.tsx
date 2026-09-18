import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { describeError, isApiError, isApiErrorCode } from "@/api/errors";
import type { FallbackTapRequest, FallbackTapResponse, Station } from "@/api/types";
import { Button } from "@/components/ui/button";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FallbackResult } from "@/features/fallback/fallback-result";
import { useLogFallbackTap } from "@/features/fallback/use-log-fallback-tap";
import { applyApiIssues } from "@/lib/form-errors";

const schema = z.object({
  station_id: z.string().min(1, "Choose a station."),
  mode: z.enum(["user_id", "uid"]),
  identifier: z.string().trim().min(1, "Enter the participant's ID or token UID."),
});

type FallbackValues = z.infer<typeof schema>;

const MODES = [
  { value: "user_id", label: "Portal user ID", hint: "From the participant's portal QR code." },
  { value: "uid", label: "Token UID", hint: "Read from the physical token." },
] as const;

export function FallbackForm({ stations }: { stations: Station[] }) {
  const logTap = useLogFallbackTap();
  const form = useForm<FallbackValues>({
    resolver: zodResolver(schema),
    defaultValues: { station_id: "", mode: "user_id", identifier: "" },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<FallbackTapResponse["result"] | null>(null);
  const mode = useWatch({ control: form.control, name: "mode" });

  async function onSubmit(values: FallbackValues) {
    setFormError(null);
    // Exactly one of user_id or uid, as the agreement requires.
    const input: FallbackTapRequest =
      values.mode === "user_id"
        ? { station_id: values.station_id, user_id: values.identifier }
        : { station_id: values.station_id, uid: values.identifier };
    try {
      const response = await logTap.mutateAsync(input);
      setResult(response.result);
    } catch (error) {
      if (isApiErrorCode(error, "not_found")) {
        setFormError("No station or participant matched. Check the station is still listed and the ID is right.");
      } else if (isApiError(error) && error.code === "validation_failed") {
        const leftover = applyApiIssues(form, error.issues);
        if (leftover.length) setFormError(leftover.join(" "));
      } else {
        setFormError(describeError(error));
      }
    }
  }

  function logAnother() {
    setResult(null);
    form.resetField("identifier");
  }

  if (result) {
    return <FallbackResult result={result} onReset={logAnother} />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <FormField
          control={form.control}
          name="station_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Station</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose the station that is down" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {stations.map((station) => (
                    <SelectItem key={station.id} value={station.id}>
                      {station.name}
                      {station.online ? "" : " (offline)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Identify the participant by</FormLabel>
              <FormControl>
                <RadioGroup onValueChange={field.onChange} value={field.value} className="grid gap-2 sm:grid-cols-2">
                  {MODES.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary-text has-[[data-state=checked]]:bg-primary/15 dark:has-[[data-state=checked]]:bg-primary/5"
                    >
                      <RadioGroupItem value={option.value} className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-medium">{option.label}</span>
                        <span className="block text-xs text-muted-foreground">{option.hint}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="identifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{mode === "user_id" ? "Portal user ID" : "Token UID"}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={mode === "user_id" ? "dev-user-1" : "04:A1:B2:C3:D4:E5:F6"}
                />
              </FormControl>
              <FormDescription>
                {mode === "user_id"
                  ? "Scan the QR code on the participant's portal profile, or type the ID."
                  : "Any separator style works."}
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
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Logging" : "Log tap"}
        </Button>
      </form>
    </Form>
  );
}
