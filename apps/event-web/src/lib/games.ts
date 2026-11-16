import type { EventGame } from "@/api/types";

/** 9.2's games, in the order the station board shows them (BAC-184, BAC-190, BAC-203). */
export const GAMES: EventGame[] = [
  { id: "passport", name: "Passport" },
  { id: "team_duels", name: "Team duels" },
  { id: "relay", name: "Relay" },
  { id: "open_seat", name: "Open seat" },
  { id: "hint_hunt", name: "Hint hunt" },
];

/** The game's name from 9.2, or its id when the screen doesn't know it. */
export function gameName(id: string): string {
  return GAMES.find((game) => game.id === id)?.name ?? id;
}
