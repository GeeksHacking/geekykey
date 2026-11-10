import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionWordLine } from "@/features/passport/connection-word-line";

describe("the word a connection gave (BAC-169)", () => {
  it("names a word that was new", () => {
    render(<ConnectionWordLine word={{ text: "today", already_had: false }} />);
    expect(screen.getByText(/Gave you the word/)).toHaveTextContent("Gave you the word today.");
  });

  it("says so when they had the word already", () => {
    render(<ConnectionWordLine word={{ text: "today", already_had: true }} />);
    expect(screen.getByText(/Their word is/)).toHaveTextContent(
      "Their word is today, which you already had.",
    );
  });

  it("says when the other person holds no word", () => {
    render(<ConnectionWordLine word={null} />);
    expect(
      screen.getByText("You're connected, but they hold no word of the phrase."),
    ).toBeInTheDocument();
  });

  it("takes no line with no phrase to see", () => {
    const { container } = render(<ConnectionWordLine word={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
