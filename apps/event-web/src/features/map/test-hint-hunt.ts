import type { HintHuntRound, MapHintHuntResponse } from "@/api/types";

/** Agreement 9.22's example, with patches for the map's round states. */
export function hintHuntPoll(patch: Partial<HintHuntRound> = {}): MapHintHuntResponse {
  return {
    hint_hunt: {
      rounds: [
        {
          station_id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
          opened_at: "2026-11-17T06:00:00.000Z",
          joining_until: "2026-11-17T06:00:30.000Z",
          players: 5,
          started_at: "2026-11-17T06:00:30.000Z",
          hints: [
            {
              question: "Where do you get your best ideas?",
              choice: "In the shower",
              short: "Q3B",
            },
            { question: "Coffee or tea?", choice: "Tea", short: "Q1B" },
          ],
          tries_left: 2,
          next_hint_at: "2026-11-17T06:00:50.000Z",
          ends_at: null,
          ended_at: null,
          ended_how: null,
          ...patch,
        },
      ],
    },
  };
}
