import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { createServiceClients } from "@/api/service-client";

describe("service client boundary", () => {
  it("puts the session calls in the session bundle and every other method in the Event one", () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    const services = createServiceClients(api);
    const session = Object.keys(services.session);
    const event = Object.keys(services.event);
    // Every method of the client, read from the client itself, so a new one can't be left out.
    const methods = Object.keys(api).filter((key) => key !== "mock");

    expect(Object.keys(services)).toEqual(["session", "event"]);
    expect(session.sort()).toEqual(["devLogin", "firebaseLogin", "loginLink", "logout", "me"]);
    expect(event.filter((key) => session.includes(key))).toEqual([]);
    expect([...session, ...event].sort()).toEqual(methods.sort());
  });

  it("has no GeekyKey slice, because the Event screens make no GeekyKey call", () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    const services = createServiceClients(api);

    // Agreement 9.2 and 9.7 to 9.9 put every station call on the Event Service. The
    // GeekyKey Service owns token claims and releases, which this app never calls.
    expect(Object.keys(services)).not.toContain("geekykey");
  });
});
