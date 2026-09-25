import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { describeError, isApiError, isApiErrorCode } from "@/api/errors";
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
import { usePairToken } from "@/features/tokens/use-pair-token";
import { applyApiIssues } from "@/lib/form-errors";
import { formatUid, normaliseUid } from "@/lib/format";

const UID_PATTERN = /^(?:[0-9A-F]{2}){4,10}$/;

const schema = z.object({
  uid: z
    .string()
    .trim()
    .min(1, "Enter the token UID.")
    .refine((value) => UID_PATTERN.test(normaliseUid(value)), {
      message: "A UID is 4 to 10 hex bytes, for example 04:A1:B2:C3:D4:E5:F6.",
    }),
});

type PairValues = z.infer<typeof schema>;

export function PairForm() {
  const pairToken = usePairToken();
  const form = useForm<PairValues>({ resolver: zodResolver(schema), defaultValues: { uid: "" } });
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: PairValues) {
    setFormError(null);
    try {
      const { token, created } = await pairToken.mutateAsync(values.uid);
      toast.success(created ? "Token paired" : "Already paired to you", {
        description: formatUid(token.uid),
      });
      form.reset();
    } catch (error) {
      if (isApiErrorCode(error, "uid_already_paired")) {
        form.setError("uid", {
          message:
            "This token is paired to someone else. Ask an organiser at the desk if that is wrong.",
        });
      } else if (isApiError(error) && error.code === "validation_failed") {
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
        <FormField
          control={form.control}
          name="uid"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Token UID</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="font-mono"
                  placeholder="04:A1:B2:C3:D4:E5:F6"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </FormControl>
              <FormDescription>
                Printed on the token, or an organiser can read it for you. Any separator style
                works.
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
        <p className="text-xs text-muted-foreground">
          Pairing links this token's ID to your account for this event only.
        </p>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Pairing" : "Pair token"}
        </Button>
      </form>
    </Form>
  );
}
