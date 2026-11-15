import { describe, expect, it } from "vitest";

import type { Question } from "@/api/types";
import { coloursFor, DEFAULT_COLOURS } from "@/features/passport/avatar/avatar-colours";
import { answersComplete, startingLook } from "@/features/passport/avatar/starting-look";

const QUESTIONS: Question[] = [
  {
    id: "starting",
    text: "You have one hour to make something. How would you start?",
    choices: [
      { id: "plan", text: "Make a plan first" },
      { id: "prototype", text: "Make a rough version and improve it" },
    ],
  },
  {
    id: "project",
    text: "Which project would you most like to help create?",
    choices: [
      { id: "everyday", text: "Something that makes everyday life easier" },
      { id: "people", text: "Something that brings people together" },
      { id: "environment", text: "Something that helps the environment" },
      { id: "laughter", text: "Something that makes people laugh" },
    ],
  },
  {
    id: "learning",
    text: "How do you prefer to learn something new?",
    choices: [
      { id: "trying", text: "Try it myself" },
      { id: "watching", text: "Watch someone show me" },
      { id: "reading", text: "Read a guide" },
      { id: "talking", text: "Talk it through with someone" },
    ],
  },
  {
    id: "stuck",
    text: "Your team gets stuck. What would you try first?",
    choices: [
      { id: "smaller_parts", text: "Break the problem into smaller parts" },
      { id: "help", text: "Ask someone for help" },
      { id: "different_idea", text: "Try a different idea" },
      { id: "break", text: "Take a short break and come back" },
    ],
  },
  {
    id: "team_role",
    text: "Your team is making something new. Which part would you most enjoy?",
    choices: [
      { id: "ideas", text: "Coming up with ideas" },
      { id: "design", text: "Making it look good" },
      { id: "building", text: "Building it" },
      { id: "feedback", text: "Trying it out and giving feedback" },
    ],
  },
];

const ALL = {
  starting: "plan",
  project: "everyday",
  learning: "trying",
  stuck: "smaller_parts",
  team_role: "ideas",
};

describe("startingLook", () => {
  it("gives the character the starting answer names", () => {
    expect(startingLook(QUESTIONS, { ...ALL, starting: "plan" }).character).toBe("suit");
    expect(startingLook(QUESTIONS, { ...ALL, starting: "prototype" }).character).toBe("dress");
  });

  it("gives the skin the project answer names", () => {
    const skins = {
      everyday: "light",
      people: "warm",
      environment: "medium",
      laughter: "brown",
    } as const;
    for (const [choice, skin] of Object.entries(skins)) {
      expect(startingLook(QUESTIONS, { ...ALL, project: choice }).skin).toBe(skin);
    }
  });

  it("gives the hair the learning answer names", () => {
    const hairs = {
      trying: "black",
      watching: "brown",
      reading: "auburn",
      talking: "blonde",
    } as const;
    for (const [choice, hair] of Object.entries(hairs)) {
      expect(startingLook(QUESTIONS, { ...ALL, learning: choice }).hair).toBe(hair);
    }
  });

  it("gives the suit the stuck answer names", () => {
    const suits = {
      smaller_parts: "navy",
      help: "burgundy",
      different_idea: "emerald",
      break: "ivory",
    } as const;
    for (const [choice, suit] of Object.entries(suits)) {
      expect(startingLook(QUESTIONS, { ...ALL, stuck: choice }).suit).toBe(suit);
    }
  });

  it("starts the other parts from the character's drawn colours", () => {
    expect(startingLook(QUESTIONS, { starting: "prototype" })).toEqual(coloursFor("dress"));
    expect(startingLook(QUESTIONS, { starting: "plan" })).toEqual(coloursFor("suit"));
  });

  it("leaves a part at the character's default for a choice it doesn't know", () => {
    expect(startingLook(QUESTIONS, { starting: "prototype", project: "unknown" })).toEqual(
      coloursFor("dress"),
    );
  });

  it("ignores a question the mapping doesn't know", () => {
    const withDrink: Question[] = [
      ...QUESTIONS,
      {
        id: "drink",
        text: "Tea or coffee?",
        choices: [
          { id: "tea", text: "Tea" },
          { id: "coffee", text: "Coffee" },
        ],
      },
    ];
    expect(startingLook(withDrink, { ...ALL, drink: "tea" })).toEqual(startingLook(QUESTIONS, ALL));
  });

  it("ignores team_role, which the mapping leaves out", () => {
    expect(startingLook(QUESTIONS, { ...ALL, team_role: "design" })).toEqual(
      startingLook(QUESTIONS, ALL),
    );
  });

  it("uses only the questions the event asks", () => {
    const withoutStarting = QUESTIONS.filter((question) => question.id !== "starting");
    expect(startingLook(withoutStarting, { ...ALL, starting: "prototype" }).character).toBe("suit");
  });

  it("gives the default look with no questions", () => {
    expect(startingLook(null, ALL)).toEqual(DEFAULT_COLOURS);
    expect(startingLook([], ALL)).toEqual(DEFAULT_COLOURS);
  });

  it("gives two guests with different answers different looks", () => {
    const one = startingLook(QUESTIONS, {
      starting: "plan",
      project: "everyday",
      learning: "trying",
      stuck: "smaller_parts",
    });
    const two = startingLook(QUESTIONS, {
      starting: "prototype",
      project: "laughter",
      learning: "talking",
      stuck: "break",
    });
    expect(one).not.toEqual(two);
  });

  it("gives the same answers the same look", () => {
    expect(startingLook(QUESTIONS, ALL)).toEqual(startingLook(QUESTIONS, ALL));
  });
});

describe("answersComplete", () => {
  it("is true when every question has an answer", () => {
    expect(answersComplete(QUESTIONS, ALL)).toBe(true);
  });

  it("is false when a question is missing", () => {
    const { stuck: _, ...withoutStuck } = ALL;
    expect(answersComplete(QUESTIONS, withoutStuck)).toBe(false);
  });

  it("doesn't count an answer to a question the event doesn't ask", () => {
    const { stuck: _, ...withoutStuck } = ALL;
    expect(answersComplete(QUESTIONS, { ...withoutStuck, drink: "tea" })).toBe(false);
  });

  it("is false with no questions", () => {
    expect(answersComplete(null, ALL)).toBe(false);
    expect(answersComplete([], ALL)).toBe(false);
  });
});
