import type { Question } from "../event/answers.ts";
import { answersGame } from "../games/connections/answers.ts";
import { connectionsGame } from "../games/connections/connections.ts";

/**
 * The grad tea's questions in the answers game (spec section 6, "The answers
 * game"), the same for every participant, each with 2 to 4 choices. The IDs are
 * stored with each answer, so keep them when rewording a question or a
 * choice. A question or choice taken off the list drops out of everyone's
 * answers.
 *
 * Placeholders from BAC-119. The grad tea team helps write the final ones
 * by Mon 9 Nov.
 */
export const gradTeaQuestions: readonly Question[] = [
  {
    id: "drink",
    text: "Tea or coffee?",
    choices: [
      { id: "tea", text: "Tea" },
      { id: "coffee", text: "Coffee" },
    ],
  },
  {
    id: "hours",
    text: "Night owl or early bird?",
    choices: [
      { id: "night_owl", text: "Night owl" },
      { id: "early_bird", text: "Early bird" },
    ],
  },
  {
    id: "school",
    text: "Best part of school?",
    choices: [
      { id: "friends", text: "Friends" },
      { id: "cca", text: "CCA" },
      { id: "camps", text: "Camps" },
      { id: "food", text: "The food" },
    ],
  },
  {
    id: "superpower",
    text: "Pick a superpower",
    choices: [
      { id: "fly", text: "Fly" },
      { id: "invisibility", text: "Invisibility" },
      { id: "reading_minds", text: "Reading minds" },
      { id: "time_travel", text: "Time travel" },
    ],
  },
  {
    id: "weekend",
    text: "Your weekend?",
    choices: [
      { id: "friends", text: "Out with friends" },
      { id: "home", text: "At home" },
      { id: "sport", text: "Sport" },
      { id: "games", text: "Games" },
    ],
  },
];

/** The grad tea's answers game, which src/app.ts hands the base. */
export const gradTeaAnswers = answersGame(gradTeaQuestions);

/** The grad tea's connections game, whose match compares the answers above. */
export const gradTeaConnections = connectionsGame(gradTeaAnswers);
