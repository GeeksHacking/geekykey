import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { dataSourceMessage } from "@/api/mode";
import { DataSourceNotice } from "@/components/layout/data-source-notice";

describe("data source notice", () => {
  it("distinguishes mock-only mode from a staged live slice", () => {
    expect(dataSourceMessage(false)).toContain("fixture data");
    // Case-insensitively: the sentence after the full stop is capitalised, and the
    // assertion is about which notice this is, not how it is punctuated.
    expect(dataSourceMessage(true)).toMatch(/token data is still mocked/i);
  });

  it("renders an accessible persistent notice", () => {
    render(<DataSourceNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("Demo data");
  });
});
