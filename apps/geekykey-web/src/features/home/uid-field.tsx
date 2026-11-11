import { useLayoutEffect, useReducer, useRef, type ChangeEvent } from "react";
import type { ControllerRenderProps } from "react-hook-form";

import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { formatUidInput, uidCaretPosition } from "@/lib/token-uid";

/** The form's one field. The form owns the schema and the claim; this owns the mask. */
type UidFieldProps = {
  field: ControllerRenderProps<{ uid: string }, "uid">;
};

/**
 * The UID box, grouped in colon pairs as it is typed (FRO-74). The caret stays after the
 * same hex digit, so an edit in the middle does not jump to the end. The placeholder shows
 * the same shape, and a partial UID takes no trailing colon.
 */
export function UidField({ field }: UidFieldProps) {
  // The caret the mask wants after the next render, in the input that asked for it.
  const pendingCaret = useRef<{ input: HTMLInputElement; at: number } | null>(null);
  // A character the mask drops leaves the form value alone, so this asks for the render
  // that puts the caret back.
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  useLayoutEffect(() => {
    const pending = pendingCaret.current;
    if (!pending) return;
    pendingCaret.current = null;
    pending.input.setSelectionRange(pending.at, pending.at);
  });

  function changeUid(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const grouped = formatUidInput(raw);
    const at = uidCaretPosition(raw, caret, grouped);
    // Put the grouped text and the caret in place now, and again after the render, so an
    // edit in the middle stays where it was (FRO-74).
    input.value = grouped;
    input.setSelectionRange(at, at);
    pendingCaret.current = { input, at };
    if (grouped === field.value) {
      rerender();
    } else {
      field.onChange(grouped);
    }
  }

  return (
    <FormItem>
      <FormLabel>Token UID</FormLabel>
      <FormControl>
        <Input
          {...field}
          onChange={changeUid}
          className="font-mono"
          placeholder="04:A1:B2:C3:D4:E5:F6"
          autoComplete="off"
          spellCheck={false}
        />
      </FormControl>
      <FormDescription>
        The UID printed on the token, or read out by an organiser. Any separator style works.
      </FormDescription>
      <FormMessage />
    </FormItem>
  );
}
