export function HomePage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-primary-text">GeekyKey</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Tokens and stations</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        This is the GeekyKey web app. Token claiming, My tokens, and station administration screens
        arrive in later tickets.
      </p>
    </main>
  );
}
