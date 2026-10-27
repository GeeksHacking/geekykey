import { createRootRoute, Outlet } from "@tanstack/react-router";

import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <Outlet />
      {/*
        Above the route tree, not inside the signed-in shell: a failed sign-out settles the
        session, and RequireSession sends the user to /login, which unmounts the shell. A
        Toaster mounted there would go with it and drop the message (FRO-47).
      */}
      <Toaster />
    </>
  );
}
