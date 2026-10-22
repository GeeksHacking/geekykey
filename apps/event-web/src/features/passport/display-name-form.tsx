import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { useSetDisplayName } from "@/features/passport/use-set-display-name";
import { isDisplayName } from "@/lib/display-name";

/** Agreement 13's sentence for a name the rule refuses, here or at the service. */
const NAME_RULE = "Use 1 to 30 characters.";

const schema = z.object({
  display_name: z.string().refine(isDisplayName, NAME_RULE),
});

type NameValues = z.infer<typeof schema>;

/**
 * The name the event shows (agreement 8.7). The prompt and the change-name dialog both use
 * it; `secondaryAction` is the prompt's Skip, which sits beside Save.
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
  const setDisplayName = useSetDisplayName();
  const form = useForm<NameValues>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: defaultName },
  });
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: NameValues) {
    setFormError(null);
    try {
      await setDisplayName.mutateAsync(values.display_name.trim());
      onSaved?.();
    } catch (error) {
      // The service has the last word on the rule, and section 13 words its answer.
      if (isApiErrorCode(error, "validation_failed")) {
        form.setError("display_name", { type: "server", message: NAME_RULE });
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
              <FormDescription>Only you and the organisers see it.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError ? (
          <p role="alert" className="text-sm text-destructive">
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
