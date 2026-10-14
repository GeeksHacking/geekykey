import { Link } from "@tanstack/react-router";

import { Wordmark } from "@/components/layout/wordmark";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <main className="grid min-h-[100dvh] place-items-center p-6 text-center">
      <div>
        <Wordmark />
        <h1 className="mt-6 text-2xl font-semibold tracking-heading">Page not found</h1>
        <p className="mt-2 text-muted-foreground">That link does not go anywhere.</p>
        <Button asChild className="mt-6">
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}
