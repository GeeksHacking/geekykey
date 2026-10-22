import { describe, expect, it } from "vitest";

import { escapeSpreadsheetFormulas } from "@/lib/csv";

describe("escapeSpreadsheetFormulas", () => {
  it("leaves the service's file alone when no cell needs it", () => {
    const csv = 'tap_id,station_name,display_name\r\n1,"Printer, Lab",Alex\r\n';

    expect(escapeSpreadsheetFormulas(csv)).toEqual({ csv, rewritten: false });
  });

  // The service may quote a cell the file would not need quoted, and the organiser's copy
  // has to be the service's file, so the quoting stays as it was sent.
  it("keeps the quoting the service used", () => {
    const csv = 'tap_id,display_name\r\n1,"Alex"\r\n';

    expect(escapeSpreadsheetFormulas(csv)).toEqual({ csv, rewritten: false });
  });

  it("puts an apostrophe in front of a name a spreadsheet could run as a formula", () => {
    const csv = "tap_id,display_name\r\n1,=2+2\r\n";

    expect(escapeSpreadsheetFormulas(csv)).toEqual({
      csv: "tap_id,display_name\r\n1,'=2+2\r\n",
      rewritten: true,
    });
  });

  it("escapes a name that starts with any of the four characters", () => {
    const csv = "tap_id,display_name\r\n1,=a\r\n2,+a\r\n3,-a\r\n4,@a\r\n";

    expect(escapeSpreadsheetFormulas(csv)).toEqual({
      csv: "tap_id,display_name\r\n1,'=a\r\n2,'+a\r\n3,'-a\r\n4,'@a\r\n",
      rewritten: true,
    });
  });

  it("escapes a name that has spaces before the character", () => {
    const csv = "tap_id,display_name\r\n1,  =2+2\r\n";

    expect(escapeSpreadsheetFormulas(csv)).toEqual({
      csv: "tap_id,display_name\r\n1,'  =2+2\r\n",
      rewritten: true,
    });
  });

  it("keeps a quoted cell quoted", () => {
    const csv = 'tap_id,display_name\r\n1,"=2+2"\r\n';

    expect(escapeSpreadsheetFormulas(csv)).toEqual({
      csv: 'tap_id,display_name\r\n1,"\'=2+2"\r\n',
      rewritten: true,
    });
  });

  // The export is the feed for the A/B analysis, so the file the organiser saves
  // is the file the service sent. Only the cell that needed an apostrophe changes.
  it("changes only the cell that needed it", () => {
    const csv = 'tap_id,station_name,display_name\r\n1,"Printer, Lab",-Alex\r\n';

    expect(escapeSpreadsheetFormulas(csv)).toEqual({
      csv: 'tap_id,station_name,display_name\r\n1,"Printer, Lab",\'-Alex\r\n',
      rewritten: true,
    });
  });

  it("preserves quoted delimiters, escaped quotes, and embedded newlines", () => {
    const csv = 'name,notes\n"Printer, Lab","Said ""hello""\nthen =1+1"\n';

    expect(escapeSpreadsheetFormulas(csv)).toEqual({ csv, rewritten: false });
  });
});
