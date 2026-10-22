import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataSourceNotice } from "@/components/layout/data-source-notice";

describe("data source notice", () => {
  it("says a mock build shows sample data, in section 13's words", () => {
    render(<DataSourceNotice live={false} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Demo data. This screen shows sample data.",
    );
  });

  it("uses no em-dash or en-dash", () => {
    // The copy rules ban both in visible text, and this notice sits above the claim
    // button, so it is the most-read string on the page.
    render(<DataSourceNotice live={false} />);

    expect(screen.getByRole("status").textContent).not.toMatch(/[\u2014\u2013]/);
  });

  it("is not there in a live build, where every answer is the service's", () => {
    render(<DataSourceNotice live />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
