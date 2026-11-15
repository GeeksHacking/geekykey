import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID } from "@/api/mock/fixtures";
import type { MeResponse, Question } from "@/api/types";
import { useStartingLook } from "@/features/passport/avatar/use-starting-look";
import { makeMe } from "@/test/make-me";
import { createTestProviders } from "@/test/providers";

const KEY = `gk-avatar-colours:${SEEDED_GUEST_ID}`;

const QUESTIONS: Question[] = [
  {
    id: "starting",
    text: "How would you start?",
    choices: [
      { id: "plan", text: "Make a plan" },
      { id: "prototype", text: "Make a rough version" },
    ],
  },
  {
    id: "project",
    text: "Which project?",
    choices: [
      { id: "everyday", text: "Everyday life" },
      { id: "people", text: "People together" },
      { id: "environment", text: "Environment" },
      { id: "laughter", text: "Laughter" },
    ],
  },
  {
    id: "learning",
    text: "How do you learn?",
    choices: [
      { id: "trying", text: "Try it" },
      { id: "watching", text: "Watch" },
      { id: "reading", text: "Read" },
      { id: "talking", text: "Talk" },
    ],
  },
  {
    id: "stuck",
    text: "What do you try when stuck?",
    choices: [
      { id: "smaller_parts", text: "Smaller parts" },
      { id: "help", text: "Ask for help" },
      { id: "different_idea", text: "A different idea" },
      { id: "break", text: "Take a break" },
    ],
  },
];

const ANSWERS = {
  starting: "prototype",
  project: "people",
  learning: "reading",
  stuck: "break",
};

const LOOK = { character: "dress", skin: "warm", hair: "auburn", suit: "ivory" };
const SAVED = { character: "suit", skin: "deep", hair: "black", suit: "emerald" };
const FROM_SERVICE = { character: "suit", skin: "warm", hair: "auburn", suit: "emerald" };

function Probe({ me }: { me: MeResponse }) {
  useStartingLook(me);
  return null;
}

function setup(me: MeResponse) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_GUEST_ID);
  const spy = vi.spyOn(api, "updateMe");
  const { Providers } = createTestProviders(api, { session: true });
  const view = render(
    <Providers>
      <Probe me={me} />
    </Providers>,
  );
  return { api, spy, Providers, ...view };
}

beforeEach(() => localStorage.clear());

describe("the starting look from the answers (FRO-109)", () => {
  it("saves the look the answers give, once", async () => {
    const me = makeMe({
      questions: QUESTIONS,
      user: { id: SEEDED_GUEST_ID, answers: ANSWERS, avatar: null },
    });
    const { spy, Providers, rerender } = setup(me);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith({ avatar: LOOK });

    rerender(
      <Providers>
        <Probe me={{ ...me }} />
      </Providers>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("waits while an answer is missing", async () => {
    const { starting: _, ...missing } = ANSWERS;
    const { spy } = setup(
      makeMe({
        questions: QUESTIONS,
        user: { id: SEEDED_GUEST_ID, answers: missing, avatar: null },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps a look the service already has", async () => {
    const { spy } = setup(
      makeMe({
        questions: QUESTIONS,
        user: { id: SEEDED_GUEST_ID, answers: ANSWERS, avatar: FROM_SERVICE },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps a look this browser saved", async () => {
    localStorage.setItem(KEY, JSON.stringify(SAVED));
    const { spy } = setup(
      makeMe({
        questions: QUESTIONS,
        user: { id: SEEDED_GUEST_ID, answers: ANSWERS, avatar: null },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spy).not.toHaveBeenCalled();
  });

  it("doesn't save one for an organiser", async () => {
    const { spy } = setup(
      makeMe({
        questions: QUESTIONS,
        user: {
          id: SEEDED_GUEST_ID,
          role: "organizer",
          answers: ANSWERS,
          avatar: null,
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spy).not.toHaveBeenCalled();
  });

  it("doesn't save one with no answers game", async () => {
    const { spy } = setup(
      makeMe({
        questions: null,
        user: { id: SEEDED_GUEST_ID, answers: {}, avatar: null },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spy).not.toHaveBeenCalled();
  });
});
