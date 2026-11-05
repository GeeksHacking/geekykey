import type { TokenKind, TokenKindTotal } from "@/api/types";

export interface WriterLog {
  /** One entry per UID, with the kind of its last line. */
  tokens: TokenKind[];
  /** How many of `tokens` each kind has, by kind in order. */
  kinds: TokenKindTotal[];
  /** How many other lines there were, not counting blank ones. */
  skipped: number;
  /** The skipped lines with a comma: likely a list line cut or mistyped. */
  flagged: string[];
}

/** One line of the writer's list, as its README says: a UID in capital hex, a comma, a capital. */
const LIST_LINE = /^((?:[0-9A-F]{2}){4,10}),([A-Z])$/;

/**
 * Reads what the token writer printed in the Serial Monitor (firmware/README.md,
 * "Writing tokens"), pasted as it is. The rules are `pnpm db:token-kinds`'s, in
 * apps/event-service/scripts/load-token-kinds.ts, so change them together. Where a
 * UID shows up twice, its last line wins, since the writer rewrote that token.
 */
export function readWriterLog(text: string): WriterLog {
  const kindOf = new Map<string, string>();
  const flagged: string[] = [];
  let skipped = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    const match = LIST_LINE.exec(line);
    if (match) {
      kindOf.set(match[1]!, match[2]!);
    } else {
      skipped++;
      if (line.includes(",")) flagged.push(line);
    }
  }

  const counts = new Map<string, number>();
  for (const kind of kindOf.values()) counts.set(kind, (counts.get(kind) ?? 0) + 1);

  return {
    tokens: [...kindOf].map(([uid, kind]) => ({ uid, kind })),
    kinds: [...counts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kind, tokens]) => ({ kind, tokens })),
    skipped,
    flagged,
  };
}
