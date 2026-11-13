/**
 * Whose token it is (BAC-143, agreement 0.14). A tap goes to whoever
 * claimed the token, not whoever holds it, so seeing a name other than the person in front of
 * you is how two people notice they hold each other's tokens. Handing them back is the fix.
 *
 * Their bio sits straight under the name, since viewing a profile needs no accepting (BAC-151).
 * Without one there's no line for it. It isn't muted, because nothing checks what a bio says, and
 * it mustn't read like the page's own sentence under it.
 */
export function OwnerSentences({ name, bio }: { name: string | null; bio: string | null }) {
  return (
    <div className="flex flex-col gap-1 wrap-anywhere">
      <p className="type-lead">This token belongs to {name ?? "someone else"}.</p>
      {bio ? <p className="text-sm">{bio}</p> : null}
      {name !== null ? (
        <p className="text-sm text-muted-foreground">
          If you're carrying this token, it isn't yours. Swap it back with {name}.
        </p>
      ) : null}
    </div>
  );
}
