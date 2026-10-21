import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { dataSourceMessage } from "@/api/mode";
import { DataSourceNotice } from "@/components/layout/data-source-notice";

describe("data source notice", () => {
  it("distinguishes mock-only mode from a staged live slice", () => {
    expect(dataSourceMessage(false)).toContain("sample data");
    expect(dataSourceMessage(true)).toContain("sample stations and taps");
  });

  it("renders an accessible persistent notice", () => {
    render(<DataSourceNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("Demo data");
  });
});
