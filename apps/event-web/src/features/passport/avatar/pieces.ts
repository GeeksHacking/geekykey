import type { Connection } from "@/api/types";

/**
 * The pieces each character has. Every character has the same number, which `outfit.test.ts`
 * checks against the art, so a poll can count the outfit without loading the art itself.
 */
export const PIECES_PER_CHARACTER = 4;

/**
 * How many pieces the guest has earned: one for each connection, and one more for each win
 * (FRO-134). A connection has one challenge, the dice or the reaction test, and the service
 * answers `win` for a tie too, so a win adds exactly one. A connection from before the
 * challenges has neither, and gives one.
 */
export function piecesEarned(connections: readonly Connection[]): number {
  return connections.reduce((count, connection) => count + 1 + (won(connection) ? 1 : 0), 0);
}

function won(connection: Connection): boolean {
  return connection.dice?.result === "win" || connection.reaction?.result === "win";
}

/** The pieces the guest wears, capped at the character's count. */
export function wornPieces(connections: readonly Connection[]): number {
  return Math.min(piecesEarned(connections), PIECES_PER_CHARACTER);
}
