import { createFileRoute } from "@tanstack/react-router";

// PROTOTYPE (FRO-105): the dashboard swapped for the avatar variants. Not for main.
import { AvatarPrototype } from "@/features/passport/prototype-fro-105/avatar-prototype";

export const Route = createFileRoute("/_app/")({
  component: AvatarPrototype,
});
