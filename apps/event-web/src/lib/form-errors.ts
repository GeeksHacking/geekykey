import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import type { ApiIssue } from "@/api/types";

/**
 * Puts each `validation_failed` issue under the field named by its path.
 * Returns the messages that had no matching field, for a form-level line.
 */
export function applyApiIssues<T extends FieldValues>(
  form: UseFormReturn<T>,
  issues: readonly ApiIssue[],
): string[] {
  const unmatched: string[] = [];
  const fields = Object.keys(form.getValues());
  for (const issue of issues) {
    if (!isUsableIssue(issue)) continue;
    const message = issue.message.trim();
    const name = issue.path.join(".");
    if (name && fields.includes(name)) {
      form.setError(name as Path<T>, { type: "server", message });
    } else {
      unmatched.push(message);
    }
  }
  return unmatched;
}

function isUsableIssue(issue: ApiIssue): issue is ApiIssue {
  if (!issue || typeof issue !== "object" || !Array.isArray(issue.path)) return false;
  if (!issue.path.every((part) => typeof part === "string" || typeof part === "number")) {
    return false;
  }
  return typeof issue.message === "string" && issue.message.trim().length > 0;
}
