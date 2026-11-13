import { Link } from "@tanstack/react-router";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Wordmark } from "@/components/layout/wordmark";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The signed-in frame while the session is in flight (FRO-163, agreement 8.4). The full-page
 * loader used to cover the whole wait for /me, so the header and the page's shape arrived with
 * the tokens. This shows the frame first: the same skip link, header rows and main landmark as
 * SessionFrame, with the places the account menu and the page's content will fill left as
 * skeletons. The theme toggle works during the wait, because it needs no session.
 *
 * Only My tokens gets the token rows' shape (`tokens`). Token kinds and the token page have
 * their own shapes, so they get the title bar alone rather than a list that isn't theirs.
 *
 * The gate's loading state also covers the moment a sign-out is in flight, so the frame shows
 * there too, until the login.
 *
 * Keep the classes in step with SessionFrame and TokenHeader.
 */
export function SessionLoadingShell({ tokens = false }: { tokens?: boolean }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b bg-background/90 backdrop-blur-sm md:sticky md:top-0 md:z-30">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
          <Link to="/" aria-label="GeekyKey home" className="shrink-0">
            <Wordmark />
          </Link>
          <div className="flex min-w-0 items-center gap-1">
            <ThemeToggle />
            <Skeleton className="h-10 w-24" aria-hidden />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
          <Skeleton className="h-10 w-36" aria-hidden />
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-16 outline-hidden"
      >
        <span role="status" className="sr-only">
          Loading
        </span>
        <Skeleton className="h-6 w-28" aria-hidden />
        {tokens ? (
          <div className="mt-6 flex flex-col gap-3">
            <Skeleton className="h-20 w-full rounded-lg" aria-hidden />
            <Skeleton className="h-20 w-full rounded-lg" aria-hidden />
          </div>
        ) : null}
      </main>
    </div>
  );
}
