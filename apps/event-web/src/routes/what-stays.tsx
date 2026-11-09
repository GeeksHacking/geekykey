import { createFileRoute } from "@tanstack/react-router";

import { BoothVisual } from "@/features/booth/booth-visual";

/**
 * The booth visual. It reads no data, so it has no session gate: the page opens on any laptop or
 * phone at the booth, and the printed A3 comes from the same source.
 */
export const Route = createFileRoute("/what-stays")({
  component: BoothVisual,
});
