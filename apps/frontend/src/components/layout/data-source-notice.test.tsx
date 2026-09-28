import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataSourceNotice } from "@/components/layout/data-source-notice";
import { dataSourceMessage } from "@/api/mode";

describe("data source notice", () => {
  it("distinguishes mock-only mode from a staged live slice", () => {
    expect(dataSourceMessage("admin", false)).toContain("fixture data");
    expect(dataSourceMessage("admin", true)).toContain("resource data is still mocked");
    expect(dataSourceMessage("pair", true)).toContain("token pairing is still mocked");
  });

  it("renders an accessible persistent notice", () => {
    render(<DataSourceNotice scope="admin" />);
    expect(screen.getByRole("status")).toHaveTextContent("Demo data");
  });
});
