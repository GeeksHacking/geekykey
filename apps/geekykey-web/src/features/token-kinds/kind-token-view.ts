import type { AdminKindToken } from "@/api/types";

export type Ownership = "all" | "claimed" | "unclaimed";

/** A row with a claim, which is what Release needs: the owner the admin confirms. */
export type ClaimedKindToken = AdminKindToken & { owner_id: string };

export const isClaimed = (token: AdminKindToken): token is ClaimedKindToken =>
  token.owner_id !== null;
export type KindTokenSort = "uid-asc" | "uid-desc" | "kind-asc" | "kind-desc";

/**
 * What the admin asked the list for. `kind` is "" for every kind, "none" for tokens with
 * no kind, or "kind:<kind>" for one kind, so a stored kind named "none" stays its own.
 */
export interface KindTokenQuery {
  search: string;
  kind: string;
  ownership: Ownership;
  sort: KindTokenSort;
}

/** Where the list starts, and where Clear filters returns the filters (not the sort) to. */
export const START_QUERY: KindTokenQuery = {
  search: "",
  kind: "",
  ownership: "all",
  sort: "uid-asc",
};

export const isFiltering = (query: KindTokenQuery) =>
  query.search !== START_QUERY.search ||
  query.kind !== START_QUERY.kind ||
  query.ownership !== START_QUERY.ownership;

/** A UID typed with spaces, colons or lower case still finds the stored form. */
const normalizeSearch = (search: string) => search.toUpperCase().replace(/[^0-9A-Z]/g, "");

/** UIDs are upper-case hex, so plain code order is their order. */
const byUid = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** An older kind can have up to 32 characters (10.2), so kinds ignore case. */
const byKind = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

/**
 * The whole fetched list, filtered and sorted, before it is cut into pages (agreement
 * 10.2 gives no server filtering). Sorting by kind breaks ties by UID, ascending either
 * way, and keeps tokens with no kind at the end either way, so a row never jumps when
 * only the direction changes.
 */
export function viewKindTokens(tokens: AdminKindToken[], query: KindTokenQuery): AdminKindToken[] {
  const search = normalizeSearch(query.search);
  const matches = tokens.filter(
    (token) =>
      token.uid.includes(search) &&
      (query.kind === "" ||
        (query.kind === "none" ? token.kind === null : `kind:${token.kind}` === query.kind)) &&
      (query.ownership === "all" || (query.ownership === "claimed") === isClaimed(token)),
  );

  const direction = query.sort.endsWith("desc") ? -1 : 1;
  return matches.sort((a, b) => {
    if (query.sort.startsWith("uid")) return direction * byUid(a.uid, b.uid);
    if (a.kind !== b.kind) {
      if (a.kind === null) return 1;
      if (b.kind === null) return -1;
      const order = byKind(a.kind, b.kind);
      if (order !== 0) return direction * order;
    }
    return byUid(a.uid, b.uid);
  });
}
