import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import type { ApiIssue } from "@/api/types";

/**
 * Puts each `validation_failed` issue under the field named by its path.
 * Returns the messages that had no matching field, for a form-level line.
 */
export function applyApiIssues<T extends FieldValues>(form: UseFormReturn<T>, issues: ApiIssue[]): string[] {
  const unmatched: string[] = [];
  const fields = Object.keys(form.getValues());
  for (const issue of issues) {
    const name = issue.path.join(".");
    if (name && fields.includes(name)) {
      // The path came from the API and was just checked against the form's own fields.
      form.setError(name as Path<T>, { type: "server", message: issue.message });
    } else {
      unmatched.push(issue.message);
    }
  }
  return unmatched;
}
