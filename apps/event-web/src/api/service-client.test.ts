import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { createServiceClients } from "@/api/service-client";

describe("service client boundary", () => {
  it("groups each method under the service that owns it in the agreement", () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    const services = createServiceClients(api);

    expect(Object.keys(services)).toEqual(["session", "event"]);
    expect(Object.keys(services.session).sort()).toEqual(
      ["devLogin", "firebaseLogin", "loginUrl", "logout", "me"].sort(),
    );
    expect(Object.keys(services.event).sort()).toEqual(
      [
        "createFallbackTap",
        "createStation",
        "disableStation",
        "enableStation",
        "exportCsv",
        "listStationBoard",
        "listTaps",
        "replaceStationKey",
        "setStationPassport",
        "stats",
      ].sort(),
    );
  });

  it("has no GeekyKey slice, because the Event screens make no GeekyKey call", () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    const services = createServiceClients(api);

    // Agreement 9.2 and 9.7 to 9.9 put every station call on the Event Service. The
    // GeekyKey Service owns token claims and releases, which this app never calls.
    expect(Object.keys(services)).not.toContain("geekykey");
  });
});
