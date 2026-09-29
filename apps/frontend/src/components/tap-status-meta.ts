import { CheckCircle, Question, Timer, type Icon } from "@phosphor-icons/react";

import type { TapStatus } from "@/api/types";

export interface TapStatusMeta {
  /** Organiser wording, matches the API vocabulary. */
  label: string;
  /** Participant wording, plain language. */
  participantLabel: string;
  icon: Icon;
  textClass: string;
  bgClass: string;
  /** Why the tap did not count, shown to participants. Null when it did count. */
  participantReason: string | null;
  organiserNote: string;
}

/*
  Colour follows the station LED mapping in the agreement (green, amber, red)
  but is never the only signal: every status carries an icon and a label.
*/
export const TAP_STATUS_META: Record<TapStatus, TapStatusMeta> = {
  accepted: {
    label: "Accepted",
    participantLabel: "Stamped",
    icon: CheckCircle,
    textClass: "text-status-accepted",
    bgClass: "bg-status-accepted/10",
    participantReason: null,
    organiserNote: "Counted for stamps and points.",
  },
  cooldown: {
    label: "Cooldown",
    participantLabel: "Too soon",
    icon: Timer,
    textClass: "text-status-cooldown",
    bgClass: "bg-status-cooldown/10",
    participantReason: "Tapped again within the cooldown window. Not counted.",
    organiserNote:
      "The same participant tapped here within the cooldown window. Recorded, not counted.",
  },
  unknown_token: {
    label: "Unknown token",
    participantLabel: "Unknown token",
    icon: Question,
    textClass: "text-status-unknown",
    bgClass: "bg-status-unknown/10",
    participantReason: "This token was not paired at the time. Not counted.",
    organiserNote: "No account is paired to that token. Recorded, not counted.",
  },
  no_event: {
    label: "No event",
    participantLabel: "No active event",
    icon: Question,
    textClass: "text-status-unknown",
    bgClass: "bg-status-unknown/10",
    participantReason: "No event is accepting taps right now.",
    organiserNote: "The station is not linked to an event that is accepting taps.",
  },
  no_game: {
    label: "No game",
    participantLabel: "Not in this game",
    icon: Question,
    textClass: "text-status-unknown",
    bgClass: "bg-status-unknown/10",
    participantReason: "This station is not part of the current game.",
    organiserNote: "The station is not part of the current event game.",
  },
};

/** The statuses the tap log can hold, for its filter. `no_event` is never stored, so it is not here. */
export const TAP_STATUSES: TapStatus[] = ["accepted", "cooldown", "unknown_token", "no_game"];
