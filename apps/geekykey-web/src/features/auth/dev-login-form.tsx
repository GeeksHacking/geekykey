import { useState, type FormEvent } from "react";

import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SEEDED_USERS } from "@/lib/constants";
import { useSession } from "@/lib/session";

/**
 * Local development only. Same session cookie as the real sign-in, so every screen after
 * this is identical.
 *
 * The GeekyKey Service keeps no users and signs in any ID (agreement 7.1), so this form
 * has no "no such user" path. It still offers a fixed list so a developer gets a known
 * admin account rather than typing an arbitrary ID.
 */
export function DevLoginForm() {
  const session = useSession();
  const [userId, setUserId] = useState<string>(SEEDED_USERS[0].id);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      // LoginScreen owns navigation; this form only changes the session state.
      await session.signIn(userId);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-10 border-t pt-8" aria-labelledby="dev-login-heading">
      <h2 id="dev-login-heading" className="text-sm font-semibold">
        Local development
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The showcase&apos;s sign-in isn&apos;t built yet. Use a seeded account for now.
      </p>
      <div className="mt-4 grid gap-2">
        <Label htmlFor="dev-user">Seeded account</Label>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger id="dev-user">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEEDED_USERS.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {/* The seeded ID is what the screens and the mock fixtures use, so a
                    developer needs to see it next to the name. */}
                {user.label}, {user.id}
                {user.isGeekyKeyAdmin ? ", GeekyKey admin" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="outline" className="mt-4 w-full" disabled={pending}>
        {pending ? "Signing in" : "Use this account"}
      </Button>
    </form>
  );
}
