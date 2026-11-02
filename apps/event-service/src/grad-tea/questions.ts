/**
 * The questions in the grad tea's answers game (spec section 6, "The answers
 * game"). The Event Service gives each participant one of them the first time
 * their /me is asked for, and it never changes after (the API agreement's 8.1),
 * so a question taken off this list stays with those already given it.
 *
 * One for now, from the agreement's example. The group settles the wording,
 * and whether there are up to three, at the meeting on Thu 5 Nov.
 */
export const gradTeaQuestions: readonly string[] = ["What's the best snack at a party?"];
