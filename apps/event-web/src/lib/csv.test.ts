import { describe, expect, it } from "vitest";

import { escapeSpreadsheetFormulas } from "@/lib/csv";

describe("escapeSpreadsheetFormulas", () => {
  it("leaves the service's file alone when no cell needs it", () => {
    const csv = 'tap_id,station_name,display_name\r\n1,"Printer, Lab",Alex\r\n';

    expect(escapeSpreadsheetFormulas(csv)).toEqual({ csv, escaped: false });
  });

  it("leaves an empty file empty", () => {
    expect(escapeSpreadsheetFormulas("")).toEqual({ csv: "", escaped: false });
  });

  // The service may quote a cell the file would not need quoted, and the organiser's copy
  // has to be the service's file, so the quoting stays as it was sent.
  it("keeps the quoting the service used", () => {
    const csv = 'tap_id,display_name\r\n1,"Alex"\r\n';

    expect(escapeSpreadsheetFormulas(csv)).toEqual({ csv, escaped: false });
  });

  it("puts an apostrophe in front of a name a spreadsheet could run as a formula", () => {
    const csv = "tap_id,display_name\r\n1,=2+2\r\n";

    expect(escapeSpreadsheetFormulas(csv)).toEqual({
      csv: "tap_id,display_name\r\n1,'=2+2\r\n",
      escaped: true,
    });
  });

  it("escapes a name that starts with any of the four characters", () => {
    const csv = "tap_id,display_name\r\n1,=a\r\n2,+a\r\n3,-a\r\n4,@a\r\n";

    expect(escapeSpreadsheetFormulas(csv)).toEqual({
      csv: "tap_id,display_name\r\n1,'=a\r\n2,'+a\r\n3,'-a\r\n4,'@a\r\n",
      escaped: true,
    });
  });

  // A spreadsheet ignores the spaces before deciding the cell is a formula, so the rule covers
  // them, and the apostrophe goes in front of the spaces.
  it("escapes a value in any column, not only a name", () => {
    // A QR fallback's user_id is typed by an organiser, and a station sends its own
    // client_tap_id, so either can start like a formula (section 13).
    const csv = "tap_id,client_tap_id,user_id\r\n1,@sum,=1+1\r\n";

    expect(escapeSpreadsheetFormulas(csv)).toEqual({
      csv: "tap_id,client_tap_id,user_id\r\n1,'@sum,'=1+1\r\n",
      escaped: true,
    });
  });

  it("escapes a name that has spaces before the character", () => {
    const csv = "tap_id,display_name\r\n1,  =2+2\r\n";

    expect(escapeSpreadsheetFormulas(csv)).toEqual({
      csv: "tap_id,display_name\r\n1,'  =2+2\r\n",
      escaped: true,
    });
  });

  it("keeps a quoted cell quoted", () => {
    const csv = 'tap_id,display_name\r\n1,"=2+2"\r\n';

    expect(escapeSpreadsheetFormulas(csv)).toEqual({
      csv: 'tap_id,display_name\r\n1,"\'=2+2"\r\n',
      escaped: true,
    });
  });

  it("escapes a quoted cell that holds a newline", () => {
    const csv = 'tap_id,display_name\r\n1,"=2+2\nsecond line"\r\n';

    expect(escapeSpreadsheetFormulas(csv)).toEqual({
      csv: 'tap_id,display_name\r\n1,"\'=2+2\nsecond line"\r\n',
      escaped: true,
    });
  });

  // The export is the feed for the A/B analysis, so the file the organiser saves
  // is the file the service sent. Only the cell that needed an apostrophe changes.
  it("changes only the cell that needed it", () => {
    const csv = 'tap_id,station_name,display_name\r\n1,"Printer, Lab",-Alex\r\n';

    expect(escapeSpreadsheetFormulas(csv)).toEqual({
      csv: 'tap_id,station_name,display_name\r\n1,"Printer, Lab",\'-Alex\r\n',
      escaped: true,
    });
  });

  it("preserves quoted delimiters, escaped quotes, and embedded newlines", () => {
    const csv = 'name,notes\n"Printer, Lab","Said ""hello""\nthen =1+1"\n';

    expect(escapeSpreadsheetFormulas(csv)).toEqual({ csv, escaped: false });
  });
});
