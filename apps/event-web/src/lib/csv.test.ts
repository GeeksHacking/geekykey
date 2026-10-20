import { describe, expect, it } from "vitest";

import { sanitizeSpreadsheetCsv } from "@/lib/csv";

describe("sanitizeSpreadsheetCsv", () => {
  it("neutralizes formula prefixes in plain and quoted cells", () => {
    const csv = 'name,note\r\n=1+1,"=2+2"\r\n+cmd,-SUM(A1:A2)\r\n@evil, safe value\r\n';

    expect(sanitizeSpreadsheetCsv(csv)).toBe(
      "name,note\r\n'=1+1,'=2+2\r\n'+cmd,'-SUM(A1:A2)\r\n'@evil, safe value\r\n",
    );
  });

  it("preserves quoted delimiters, escaped quotes, and embedded newlines", () => {
    const csv = 'name,notes\n"Printer, Lab","Said ""hello""\nthen =1+1"\n';

    expect(sanitizeSpreadsheetCsv(csv)).toBe(
      'name,notes\n"Printer, Lab","Said ""hello""\nthen =1+1"\n',
    );
  });
});
