/**
 * The prompt while someone has tapped this user's token and is waiting for a tap back
 * (agreement section 13, FRO-116). It takes only the count, so it cannot name anyone.
 */
export function TappedYouNotice({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <section
      role="status"
      aria-label="Someone tapped your token"
      className="rounded-lg border bg-card p-4"
    >
      <p className="font-medium">Someone tapped your token. Tap theirs back to connect.</p>
    </section>
  );
}
