/*
  Every TanStack Query key in the app, in one place, so invalidation after a
  mutation is a lookup rather than a guess. Keys are hierarchical: invalidating
  ["token"] hits every token query regardless of which UID is in the key.
*/
export const queryKeys = {
  me: ["me"] as const,
  token: (uid: string) => ["token", uid] as const,
} as const;
