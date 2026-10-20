import { createRootRoute, Outlet } from "@tanstack/react-router";

import { NotFound } from "@/components/layout/not-found";
import { RootError } from "@/components/layout/root-error";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RootError,
  notFoundComponent: NotFound,
});

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  );
}
