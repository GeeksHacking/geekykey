/** One item in the booth visual: a short heading, the sentence under it, and an optional note. */
export interface BoothItem {
  heading: string;
  body: string;
  note?: string;
}

/**
 * The booth visual's words, in one place. The report (BAC-153), the poster and this page say the
 * same thing, so a sentence changes here first and then in the showcase plan. The ticket calls the
 * passport a second game: both games run in one event, so it isn't a second event.
 */
export const BOOTH_TITLE = "What stays and what changes each event";
export const BOOTH_KICKER = "The NFC token system for GeeksHacking events";
export const BOOTH_QUOTE =
  "We are not increasing tech debt; we are abstracting the parts that were always going to be rebuilt anyway.";

export const STAYS_HEADING = "Stays";
export const CHANGES_HEADING = "Changes with each event";

export const STAYS: readonly BoothItem[] = [
  {
    heading: "The token and who owns it",
    body: "A token is its chip's address, and it stays with the person who claimed it. The same token works at every event, and new tokens each year are written the same way.",
  },
  {
    heading: "The GeekyKey Service",
    body: "It checks each station's key, finds who owns the token, and hands the tap to the event. It keeps no database, so on restart it asks the Portal who owns each token.",
    note: "At the showcase, a stand-in holds that list until the Portal is ready.",
  },
  {
    heading: "The station hardware",
    body: "The ESP32, its reader and its screen stay. The casing changes.",
  },
  {
    heading: "How a station reads a token",
    body: "The same tap works at every event. Moved to another event, the box becomes a new station with that event's key, and setup mode changes its server, key or Wi-Fi without a reflash.",
  },
];

export const CHANGES: readonly BoothItem[] = [
  {
    heading: "The event's rules",
    body: "Who can connect, which challenge a new connection plays, the groups, the points and the cooldowns.",
  },
  {
    heading: "What each game records",
    body: "The passport's stamps, and each connection's match, rolls or reaction times.",
  },
  {
    heading: "The screens",
    body: "The event website's theme, sponsors and challenge statement change every year, so we rebuild them on purpose.",
  },
  {
    heading: "The games",
    body: "Events have to differ or people stop coming, so each event gets its own.",
  },
];

export const PASSPORT_HEADING = "The passport is a second game";
export const PASSPORT_BODY =
  "The same token and the same station hardware run it. Both games run in one event, so it isn't a second event.";
export const PASSPORT_EVIDENCE =
  "The dice, the 3D roll and the reaction test changed no file in the firmware, the GeekyKey Service or the token screens.";

export const COSTS_HEADING = "The honest costs";
export const COSTS: readonly string[] = [
  "Each token's chip holds a fixed address, so key.geekshacking.com/t/ has to keep working as long as tokens are in use.",
  "Stations are the real hardware upkeep. The buck converter arrived over a month late, which shows the risk.",
  "Only one event has run so far, so the yearly saving is a design goal, not a result yet.",
];
