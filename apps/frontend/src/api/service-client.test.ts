import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { createServiceClients } from "@/api/service-client";

describe("service client boundary", () => {
  it("exposes the existing client through session, GeekyKey, and Event groups", () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    const services = createServiceClients(api);

    expect(services.session.me).toBeTypeOf("function");
    expect(services.geekykey.pairToken).toBeTypeOf("function");
    expect(services.event.listStations).toBeTypeOf("function");
    expect(services.event.stats).toBeTypeOf("function");
    expect("listStations" in services.geekykey).toBe(false);
    expect(Object.keys(services)).toEqual(["session", "geekykey", "event"]);
  });
});
