import type { Question } from "../event/answers.ts";
import { answersGame } from "../games/connections/answers.ts";
import { connectionsGame } from "../games/connections/connections.ts";
import { openSeatRequests } from "../games/open-seat/open-seat.ts";

/**
 * The showcase's questions in the answers game (spec section 6, "The answers
 * game"), the same for every participant, each with 2 to 4 choices. The IDs are
 * stored with each answer, so keep them when rewording a question or a
 * choice. A question or choice taken off the list drops out of everyone's
 * answers.
 *
 * BAC-162 replaces the placeholder questions before the event clear.
 */
export const showcaseQuestions: readonly Question[] = [
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
    id: "starting",
    text: "You have one hour to make something. How would you start?",
    choices: [
      { id: "plan", text: "Make a plan first" },
      { id: "prototype", text: "Make a rough version and improve it" },
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
    id: "project",
    text: "Which project would you most like to help create?",
    choices: [
      { id: "everyday", text: "Something that makes everyday life easier" },
      { id: "people", text: "Something that brings people together" },
      { id: "environment", text: "Something that helps the environment" },
      { id: "laughter", text: "Something that makes people laugh" },
    ],
  },
];

/** The showcase's answers game, which src/app.ts hands the base. */
export const showcaseAnswers = answersGame(showcaseQuestions);

/**
 * The showcase's connections game, whose match compares the answers above. A taken open seat's
 * request is judged by the open seat's rule (BAC-190).
 */
export const showcaseConnections = connectionsGame(showcaseAnswers, {
  requestRules: [openSeatRequests],
});
