import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { createServiceClients } from "@/api/service-client";

describe("service client boundary", () => {
  it("groups each method under the service that owns it in the agreement", () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    const services = createServiceClients(api);

    expect(Object.keys(services)).toEqual(["session", "geekykey", "event"]);
    expect(Object.keys(services.session).sort()).toEqual(
      ["devLogin", "loginUrl", "logout", "me"].sort(),
    );
    expect(Object.keys(services.geekykey).sort()).toEqual(["createStation", "listStations"].sort());
    expect(Object.keys(services.event).sort()).toEqual(
      ["createFallbackTap", "exportCsv", "listStationBoard", "listTaps", "stats"].sort(),
    );
  });
});
