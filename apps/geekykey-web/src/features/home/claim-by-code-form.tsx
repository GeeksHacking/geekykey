import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod/mini";

import { describeError, isApiError } from "@/api/errors";
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
import { applyApiIssues } from "@/lib/form-errors";
import { isValidUid, normalizeUid } from "@/lib/token-uid";
import { useClaimToken } from "@/lib/use-claim-token";

/**
 * The field's own rule, before anything is sent. Agreement section 4: the services
 * normalise a UID by stripping anything that is not a hex digit and upper-casing, so a
 * UID is 4 to 10 bytes, that is 8 to 20 hex characters, and a chip's UID is whole bytes,
 * so the count is even. The same rules are in lib/token-uid.ts, which the claim sends
 * through.
 */
const schema = z.object({
  uid: z.string().check(
    z.trim(),
    z.minLength(1, "Enter the token UID."),
    z.refine((value) => isValidUid(normalizeUid(value)), {
      message:
        "A token's UID is 4 to 10 bytes of hex, so an even number of characters, for example 04:A1:B2:C3:D4:E5:F6.",
    }),
  ),
});

type ClaimValues = z.infer<typeof schema>;

/**
 * My tokens' claim-by-code form (agreement 8.2, FRO-30). One UID field, for the tokens
 * a phone cannot read, and the same claim mutation as the token page.
 *
 * A claim changes what /me holds, so the hook refetches it and the token appears in the
 * list on the page. The field clears once the claim is through, so the next token can be
 * typed without clearing it first.
 *
 * The service's checks are 8.2's order, and the screen only says what it is told:
 * token_taken, token_limit_reached, rate_limited and claims_unavailable each show their
 * section 13 sentence. A validation_failed issue goes on the field its path names, an
 * issue about something else goes on a form-level line, and a failure with no issues at
 * all falls back to the field, since the UID is the only field here.
 */
export function ClaimByCodeForm() {
  const claim = useClaimToken();
  const form = useForm<ClaimValues>({
    resolver: zodResolver(schema),
    defaultValues: { uid: "" },
  });
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: ClaimValues) {
    setFormError(null);
    form.clearErrors("uid");
    try {
      await claim.mutateAsync(values.uid);
      form.reset();
    } catch (error) {
      if (isApiError(error) && error.code === "validation_failed") {
        const issues = Array.isArray(error.issues) ? error.issues : [];
        const leftover = applyApiIssues(form, issues);
        if (leftover.length > 0) {
          setFormError(leftover.join(" "));
        } else if (!form.getFieldState("uid").error) {
          form.setError("uid", { type: "server", message: describeError(error) });
        }
      } else {
        setFormError(describeError(error));
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
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
                  spellCheck={false}
                />
              </FormControl>
              <FormDescription>
                The UID printed on the token, or read out by an organiser. Any separator style
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
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Claiming" : "Claim"}
        </Button>
      </form>
    </Form>
  );
}
