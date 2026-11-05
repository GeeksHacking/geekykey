/**
 * Whose token it is (BAC-143, wording approved for the next version). A tap goes to whoever
 * claimed the token, not whoever holds it, so seeing a name other than the person in front of
 * you is how two people notice they hold each other's tokens. Handing them back is the fix.
 */
export function OwnerSentences({ name }: { name: string | null }) {
  if (name === null) return <p className="text-base">This token belongs to someone else.</p>;
  return (
    <div className="flex flex-col gap-1 wrap-anywhere">
      <p className="text-base">This token belongs to {name}.</p>
      <p className="text-sm text-muted-foreground">
        If you're carrying this token, it isn't yours. Swap it back with {name}.
      </p>
    </div>
  );
}
