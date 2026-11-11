import { Link, useLocation } from "@tanstack/react-router";
import { useMe } from "@/lib/session";
import { readDismissed } from "@/features/passport/round-dismissal";

export function TeamRoundNotice() {
  const { me } = useMe();
  const path = useLocation({ select: (location) => location.pathname });
  const round = me.round;
  if (
    path === "/" ||
    !round ||
    (round.state === "ended" && readDismissed(`gk-round-dismissed:${me.user.id}`) === round.id)
  )
    return null;
  return (
    <div role="status" className="mb-6 rounded-lg border bg-muted px-4 py-3 text-sm">
      <Link to="/" className="font-medium underline underline-offset-4">
        {round.state === "ended"
          ? "Your team duels result is ready. Open the dashboard."
          : "You're in a team duels round. Open the dashboard to play."}
      </Link>
    </div>
  );
}
