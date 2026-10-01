import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FallbackResult } from "@/features/fallback/fallback-result";
import { useLogFallbackTap } from "@/features/fallback/use-log-fallback-tap";
import { applyApiIssues } from "@/lib/form-errors";

const MAX_PORTAL_USER_ID_LENGTH = 128;

const schema = z.object({
  station_id: z.string().min(1, "Choose a station."),
  user_id: z
    .string()
    .trim()
    .min(1, "Enter the participant's Portal user ID.")
    .max(MAX_PORTAL_USER_ID_LENGTH, "Portal user IDs must be 128 characters or fewer."),
});

type FallbackValues = z.infer<typeof schema>;

export function FallbackForm({ stations }: { stations: Station[] }) {
  const logTap = useLogFallbackTap();
  const form = useForm<FallbackValues>({
    resolver: zodResolver(schema),
    defaultValues: { station_id: "", user_id: "" },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<FallbackTapResponse["result"] | null>(null);

  async function onSubmit(values: FallbackValues) {
    setFormError(null);
    const input: FallbackTapRequest = {
      station_id: values.station_id,
      user_id: values.user_id.trim(),
    };
    try {
      const response = await logTap.mutateAsync(input);
      setResult(response.result);
    } catch (error) {
      if (isApiErrorCode(error, "not_found")) {
        setFormError(
          "This station isn't in the passport yet. Ask the lead organiser to add it first.",
        );
      } else if (isApiError(error) && error.code === "validation_failed") {
        const issues = Array.isArray(error.issues)
          ? error.issues.map((issue) => {
              if (!Array.isArray(issue?.path)) return issue;
              return issue.path[0] === "user_id"
                ? { ...issue, path: ["user_id", ...issue.path.slice(1)] }
                : issue;
            })
          : [];
        const leftover = applyApiIssues(form, issues);
        setFormError(leftover.length ? leftover.join(" ") : describeError(error));
      } else {
        setFormError(describeError(error));
      }
    }
  }

  function logAnother() {
    setResult(null);
    form.resetField("user_id");
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
          name="user_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Portal user ID</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="dev-user-1"
                />
              </FormControl>
              <FormDescription>
                Scan the QR code on the participant&apos;s Portal profile, or type the ID.
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
