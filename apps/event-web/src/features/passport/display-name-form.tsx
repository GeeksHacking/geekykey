import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod/mini";

import { describeError, isApiErrorCode } from "@/api/errors";
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
import { useUpdateMe } from "@/features/passport/use-update-me";
import { isDisplayName } from "@/lib/display-name";

/** Agreement 13's sentence for a name the rule refuses, here or at the service. */
const NAME_RULE = "Use 1 to 30 characters.";

/** Agreement 13's sentence for a name someone else has (BAC-145). */
const NAME_TAKEN = "Someone already has this name. Try another.";

const schema = z.object({
  display_name: z.string().check(z.refine(isDisplayName, NAME_RULE)),
});

type NameValues = z.infer<typeof schema>;

/**
 * The name the event shows (agreement 8.7). The prompt and the change-name dialog both use
 * it; `secondaryAction` sits beside Save when the caller offers one.
 */
export function DisplayNameForm({
  defaultName = "",
  secondaryAction,
  onSaved,
}: {
  defaultName?: string;
  secondaryAction?: ReactNode;
  onSaved?: () => void;
}) {
  const updateMe = useUpdateMe();
  const form = useForm<NameValues>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: defaultName },
  });
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: NameValues) {
    setFormError(null);
    try {
      await updateMe.mutateAsync({ display_name: values.display_name.trim() });
      onSaved?.();
    } catch (error) {
      // The service has the last word on the rule, and section 13 words its answer.
      if (isApiErrorCode(error, "validation_failed")) {
        form.setError("display_name", { type: "server", message: NAME_RULE });
      } else if (isApiErrorCode(error, "name_taken")) {
        form.setError("display_name", { type: "server", message: NAME_TAKEN });
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
          name="display_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="nickname" className="sm:max-w-sm" />
              </FormControl>
              {/* For the agreement's next version (BAC-143, FRO-127 for the group, BAC-151 for the bio). */}
              <FormDescription>
                The organisers, your group, and anyone who taps your token or whose token you tap
                see it. Anyone who taps your token or whose token you tap also sees your bio.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError ? (
          <p role="alert" className="text-sm text-destructive-text">
            {formError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving" : "Save"}
          </Button>
          {secondaryAction}
        </div>
      </form>
    </Form>
  );
}
