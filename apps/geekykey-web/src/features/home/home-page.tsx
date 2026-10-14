import { useApi } from "@/api/context";
import { useSession } from "@/lib/session";

/**
 * My tokens is the home page (agreement 8.4). FRO-27 builds the real list; until then this
 * shows the signed-in identity so the session and the account menu have a screen to sit on.
 */
export function HomePage() {
  const api = useApi();
  const session = useSession();

  return (
    <main className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-heading">My tokens</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Signed in as <span className="font-mono">{session.me?.user.id}</span>
        {session.me?.user.is_geekykey_admin ? ", a GeekyKey admin." : "."}
      </p>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Your tokens are listed here by a later ticket. Claiming and releasing arrive with them.
      </p>
      {/* The Portal login returns after the showcase (agreement 0.4 moved
          GET /auth/login out of scope), so this belongs in development only. */}
      {import.meta.env.DEV ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Login address for this page: <span className="font-mono">{api.loginUrl("/")}</span>
        </p>
      ) : null}
    </main>
  );
}
