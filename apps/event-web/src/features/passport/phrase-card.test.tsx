import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PhraseCard } from "@/features/passport/phrase-card";

/** Each word of the card as a screen reader says it, in order. */
function wordsRead() {
  const list = screen.getByRole("list", { name: "The phrase" });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

describe("the phrase card (BAC-169)", () => {
  it("shows the phrase in order with a blank for each word still to find, and the count", () => {
    render(<PhraseCard phrase={{ words: ["Strangers", "become", null, "today"], your_word: 1 }} />);
    const card = screen.getByRole("region", { name: "Phrase" });
    expect(within(card).getByText("3 of 4 words")).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "Complete the phrase" })).toBeInTheDocument();
    expect(wordsRead()).toEqual([
      "Strangers",
      "become (your word)",
      "Word 3, not found yet",
      "today",
    ]);
    // Their own word is named in words, so the yellow isn't the only mark.
    expect(within(card).getByText(/^Your word is/)).toHaveTextContent("Your word is become.");
    expect(within(card).getByText(/when they accept, you each get the other's word/)).toBeVisible();
  });

  it("says the phrase is complete once no word is missing, and nothing about points", () => {
    render(
      <PhraseCard phrase={{ words: ["Strangers", "become", "friends", "today"], your_word: 1 }} />,
    );
    const card = screen.getByRole("region", { name: "Phrase" });
    expect(
      within(card).getByRole("heading", { name: "You completed the phrase!" }),
    ).toBeInTheDocument();
    expect(within(card).getByText("4 of 4 words")).toBeInTheDocument();
    expect(wordsRead()).toEqual(["Strangers", "become (your word)", "friends", "today"]);
    expect(within(card).queryByText(/you each get the other's word/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/point|piece/i)).not.toBeInTheDocument();
  });
});
