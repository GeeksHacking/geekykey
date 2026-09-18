import { createRootRoute, Outlet } from "@tanstack/react-router";

import { NotFound } from "@/components/layout/not-found";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
  component: RootLayout,
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
