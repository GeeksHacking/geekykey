import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useUpdateMe } from "@/features/passport/use-update-me";
import { BIO_MAX, CONTACT_LINE_MAX, fitsLimit } from "@/lib/profile";

/** Section 13's sentences for a value the rule refuses, here or at the service. */
const RULES = {
  bio: `Use at most ${BIO_MAX} characters.`,
  contact_line: `Use at most ${CONTACT_LINE_MAX} characters.`,
};

/** Section 13's sentences: the bio shows before the two connect, the contact line after (BAC-151). */
const WHO_SEES_BIO = "Anyone who taps your token or whose token you tap sees this.";
const WHO_SEES_CONTACT_LINE = "People you connect with see this.";

/** The setup step's rule, which the profile dialog doesn't have (FRO-186). */
const ADD_ONE = "Add a bio or a contact line to save.";

const schema = z.object({
  bio: z.string().check(z.refine((text) => fitsLimit(text, BIO_MAX), RULES.bio)),
  contact_line: z
    .string()
    .check(z.refine((text) => fitsLimit(text, CONTACT_LINE_MAX), RULES.contact_line)),
});

type ProfileValues = z.infer<typeof schema>;

/** The fields a `validation_failed` names, or none for any other error. */
function fieldsRefusedBy(error: unknown): (keyof ProfileValues)[] {
  if (!isApiError(error) || error.code !== "validation_failed") return [];
  return error.issues.flatMap(({ path: [field] }) =>
    field === "bio" || field === "contact_line" ? [field] : [],
  );
}

/**
 * The bio and the contact line (agreement 8.7, BAC-147). Leaving one blank clears it. The setup
 * step (FRO-186) needs one of the two and offers Skip beside Save; the profile dialog can clear
 * both.
 */
export function ProfileForm({
  bio,
  contactLine,
  onSaved,
  secondaryAction,
  requireOne = false,
  contactLineHint = WHO_SEES_CONTACT_LINE,
}: {
  bio: string | null;
  contactLine: string | null;
  onSaved?: () => void;
  /** A button beside Save, such as the setup step's Skip. */
  secondaryAction?: ReactNode;
  /** The setup step needs one of the two; the profile dialog can clear both. */
  requireOne?: boolean;
  /** The setup step says "Only people you connect with see this." (FRO-186). */
  contactLineHint?: string;
}) {
  const updateMe = useUpdateMe();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(schema),
    defaultValues: { bio: bio ?? "", contact_line: contactLine ?? "" },
  });
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: ProfileValues) {
    setFormError(null);
    if (requireOne && !values.bio.trim() && !values.contact_line.trim()) {
      setFormError(ADD_ONE);
      return;
    }
    try {
      await updateMe.mutateAsync({
        bio: values.bio.trim(),
        contact_line: values.contact_line.trim(),
      });
      onSaved?.();
    } catch (error) {
      // The service has the last word on the rules, and section 13 words its answer.
      const refused = fieldsRefusedBy(error);
      for (const field of refused) {
        form.setError(field, { type: "server", message: RULES[field] });
      }
      if (refused.length === 0) setFormError(describeError(error));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bio</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} />
              </FormControl>
              <FormDescription>{WHO_SEES_BIO}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contact_line"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contact line</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" placeholder="@yourhandle on Telegram" />
              </FormControl>
              <FormDescription>{contactLineHint}</FormDescription>
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
