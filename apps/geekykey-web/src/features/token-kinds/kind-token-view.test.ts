import { describe, expect, it } from "vitest";

import type { AdminKindToken } from "@/api/types";
import { viewKindTokens, type KindTokenQuery } from "@/features/token-kinds/kind-token-view";

function token(uid: string, kind: string | null, owner: string | null = null): AdminKindToken {
  return {
    uid,
    kind,
    owner_id: owner,
    claimed_at: owner === null ? null : "2026-11-06T09:00:00.000Z",
  };
}

const tokens = [
  token("04A1", "E", "user-1"),
  token("04B2", "B"),
  token("04C3", null, "user-2"),
  token("04D4", "E"),
  token("04E5", "B", "user-3"),
  token("04F6", null, "user-4"),
];

const all: KindTokenQuery = { search: "", kind: "", ownership: "all", sort: "uid-asc" };
const uids = (query: Partial<KindTokenQuery>) =>
  viewKindTokens(tokens, { ...all, ...query }).map((t) => t.uid);

describe("sorting", () => {
  it("orders by UID either way", () => {
    expect(uids({ sort: "uid-asc" })).toEqual(["04A1", "04B2", "04C3", "04D4", "04E5", "04F6"]);
    expect(uids({ sort: "uid-desc" })).toEqual(["04F6", "04E5", "04D4", "04C3", "04B2", "04A1"]);
  });

  it("orders by kind with UID breaking ties, and puts no kind last either way", () => {
    expect(uids({ sort: "kind-asc" })).toEqual(["04B2", "04E5", "04A1", "04D4", "04C3", "04F6"]);
    expect(uids({ sort: "kind-desc" })).toEqual(["04A1", "04D4", "04B2", "04E5", "04C3", "04F6"]);
  });
});

it("orders older mixed-case kinds alphabetically", () => {
  const mixed = [token("01", "b"), token("02", "A"), token("03", "C"), token("04", "a")];
  expect(viewKindTokens(mixed, { ...all, sort: "kind-asc" }).map((t) => t.uid)).toEqual([
    "02",
    "04",
    "01",
    "03",
  ]);
});

describe("filters", () => {
  it("keeps only claimed or only unclaimed tokens", () => {
    expect(uids({ ownership: "claimed" })).toEqual(["04A1", "04C3", "04E5", "04F6"]);
    expect(uids({ ownership: "unclaimed" })).toEqual(["04B2", "04D4"]);
  });

  it("combines ownership, kind, search and sorting", () => {
    expect(uids({ ownership: "claimed", kind: "none", sort: "uid-desc" })).toEqual([
      "04F6",
      "04C3",
    ]);
    expect(uids({ ownership: "unclaimed", kind: "kind:E" })).toEqual(["04D4"]);
    expect(uids({ ownership: "claimed", search: "04:e", sort: "kind-asc" })).toEqual(["04E5"]);
  });

  it("tells a stored kind named none from no kind", () => {
    const named = [...tokens, token("DEADBEEF", "none")];
    expect(viewKindTokens(named, { ...all, kind: "kind:none" }).map((t) => t.uid)).toEqual([
      "DEADBEEF",
    ]);
    expect(viewKindTokens(named, { ...all, kind: "none" }).map((t) => t.uid)).toEqual([
      "04C3",
      "04F6",
    ]);
  });
});
