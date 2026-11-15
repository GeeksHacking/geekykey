import type { Question } from "@/api/types";
import type { CharacterKey } from "@/features/passport/avatar/art";
import {
  coloursFor,
  DEFAULT_COLOURS,
  type AvatarColours,
} from "@/features/passport/avatar/avatar-colours";

/**
 * Which answer sets which part of the starting look (FRO-109). The question and choice IDs are
 * the event's, so rewording a question keeps its mapping. A question or choice that isn't here
 * leaves its part at the character's drawn colour.
 */
type Rule =
  | { part: "character"; choices: Record<string, CharacterKey> }
  | { part: "skin"; choices: Record<string, AvatarColours["skin"]> }
  | { part: "hair"; choices: Record<string, AvatarColours["hair"]> }
  | { part: "suit"; choices: Record<string, AvatarColours["suit"]> };

const RULES: Record<string, Rule> = {
  starting: {
    part: "character",
    choices: { plan: "suit", prototype: "dress" },
  },
  project: {
    part: "skin",
    choices: { everyday: "light", people: "warm", environment: "medium", laughter: "brown" },
  },
  learning: {
    part: "hair",
    choices: { trying: "black", watching: "brown", reading: "auburn", talking: "blonde" },
  },
  stuck: {
    part: "suit",
    choices: { smaller_parts: "navy", help: "burgundy", different_idea: "emerald", break: "ivory" },
  },
};

/** Whether the guest has answered every question the event asks, so the look can be worked out. */
export function answersComplete(
  questions: readonly Question[] | null | undefined,
  answers: Readonly<Record<string, string>>,
): boolean {
  if (!questions || questions.length === 0) return false;
  return questions.every((question) => Object.hasOwn(answers, question.id));
}

/**
 * The starting look a guest's answers give (FRO-109). The character is chosen first, so the
 * other parts begin from that character's drawn colours. A question or choice the mapping
 * doesn't know leaves its part there, and an event with no answers game gives the default look.
 */
export function startingLook(
  questions: readonly Question[] | null | undefined,
  answers: Readonly<Record<string, string>>,
): AvatarColours {
  const look = coloursFor(characterFrom(questions, answers));
  for (const question of questions ?? []) {
    const rule = RULES[question.id];
    if (!rule || rule.part === "character") continue;
    const choice = answers[question.id];
    if (choice === undefined) continue;
    if (rule.part === "skin") {
      const value = rule.choices[choice];
      if (value !== undefined) look.skin = value;
    } else if (rule.part === "hair") {
      const value = rule.choices[choice];
      if (value !== undefined) look.hair = value;
    } else {
      const value = rule.choices[choice];
      if (value !== undefined) look.suit = value;
    }
  }
  return look;
}

function characterFrom(
  questions: readonly Question[] | null | undefined,
  answers: Readonly<Record<string, string>>,
): CharacterKey {
  if (!questions?.some((question) => question.id === "starting")) return DEFAULT_COLOURS.character;
  const rule = RULES.starting;
  if (rule?.part !== "character") return DEFAULT_COLOURS.character;
  const choice = answers.starting;
  return (choice === undefined ? undefined : rule.choices[choice]) ?? DEFAULT_COLOURS.character;
}
