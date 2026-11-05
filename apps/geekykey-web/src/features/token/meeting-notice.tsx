import type { EventServiceLink, Meeting, MeetingStatus } from "@/api/types";
import { EventButtons } from "@/components/event-buttons";

/*
  What came of the half a tap sent (agreement 8.8), under the sentence that says the token
  belongs to someone else. Section 13 fixes the wording for every answer but `same_group` and
  `no_group`, whose sentences are approved for the agreement's next version (BAC-140), and
  `waiting`, whose new sentence is a draft for Ethan to approve (BAC-149), so the sentences are
  here as the agreement writes them; a status added to the union fails the type check until it
  has one.
*/

/** Section 13's words, one per status an Event Service can answer with (11.10). */
const SENTENCE: Record<MeetingStatus, string> = {
  // A draft for Ethan to approve (BAC-149).
  waiting: "Request sent. Ask them to open their dashboard and accept.",
  connected: "You're connected!",
  already_connected: "You're already connected.",
  same_kind: "You're in the same group. Find someone from another group.",
  // Approved for the agreement's next version (BAC-140).
  same_group: "You're in the same group. Find someone from another group.",
  no_group: "You both need to be in a group to connect. Ask an organiser.",
  unavailable: "Couldn't connect. Tap their token again.",
};

/**
 * One line per Event Service that took the half. 8.4 says the showcase has exactly one,
 * so this shows once in practice and stays right if a second appears.
 */
export function MeetingNotice({
  meetings,
  events,
  uid,
}: {
  meetings: Meeting[];
  events: EventServiceLink[];
  /** The token page's token, which its buttons name so the link carries its kind (11.9). */
  uid: string;
}) {
  if (meetings.length === 0) return null;

  return (
    <div className="flex flex-col items-start gap-4">
      {meetings.map((meeting) => (
        <MeetingLine key={meeting.event_id} meeting={meeting} events={events} uid={uid} />
      ))}
    </div>
  );
}

/**
 * Section 13 gives the pair's own event button to `waiting`, `connected` and
 * `already_connected`, because that button opens the dashboard through a login link (8.6), and
 * the reveal comes there, at once or after the other person accepts. Every other answer has
 * nothing to open yet.
 */
function MeetingLine({
  meeting,
  events,
  uid,
}: {
  meeting: Meeting;
  events: EventServiceLink[];
  uid: string;
}) {
  const offersEvent =
    meeting.status === "waiting" ||
    meeting.status === "connected" ||
    meeting.status === "already_connected";
  const event = events.find((item) => item.id === meeting.event_id);

  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-base">{SENTENCE[meeting.status]}</p>
      {offersEvent && event ? <EventButtons events={[event]} uid={uid} /> : null}
    </div>
  );
}
