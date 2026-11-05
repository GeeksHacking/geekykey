import { describe, expect, it } from "vitest";

import { readWriterLog } from "@/features/token-kinds/read-writer-log";

/*
  The same rules as `pnpm db:token-kinds` (apps/event-service/scripts/load-token-kinds.ts).
  The Serial Monitor's text goes in as it is, so most of what's pasted isn't the list.
*/
describe("reading the token writer's log", () => {
  it("takes only lines of a UID, a comma and one capital letter", () => {
    const log = ["to write kind E", "04E45150324189,E", "OK kind E", "", "04A1B2C3D4E5F6,B"].join(
      "\n",
    );

    const read = readWriterLog(log);

    expect(read.tokens).toEqual([
      { uid: "04E45150324189", kind: "E" },
      { uid: "04A1B2C3D4E5F6", kind: "B" },
    ]);
    expect(read.skipped).toBe(2);
    expect(read.flagged).toEqual([]);
  });

  it("lets the last line for a UID win, since the writer rewrote that token", () => {
    const read = readWriterLog("04E45150324189,E\n04A1B2C3D4E5F6,B\n04E45150324189,V\n");

    expect(read.tokens).toEqual([
      { uid: "04E45150324189", kind: "V" },
      { uid: "04A1B2C3D4E5F6", kind: "B" },
    ]);
  });

  it("flags a line with a comma that isn't a list line, and skips it", () => {
    const log = [
      "04E45150324189,E",
      "04E4515032418,E", // A digit short, cut off when copied.
      "04e45150324189,E", // Lower case.
      "04A1B2C3D4E5F6,EE", // Two letters.
      "04A1B2C3D4E5F6,", // No letter.
      "12:00:01.123 -> 04D00D00D00D00,E", // The Serial Monitor's timestamp left on.
      "FAIL AUTH",
    ].join("\n");

    const read = readWriterLog(log);

    expect(read.tokens).toEqual([{ uid: "04E45150324189", kind: "E" }]);
    expect(read.flagged).toEqual([
      "04E4515032418,E",
      "04e45150324189,E",
      "04A1B2C3D4E5F6,EE",
      "04A1B2C3D4E5F6,",
      "12:00:01.123 -> 04D00D00D00D00,E",
    ]);
    expect(read.skipped).toBe(6);
  });

  it("reads Windows line endings and spaces around a line", () => {
    const read = readWriterLog("  04E45150324189,E  \r\n\t04A1B2C3D4E5F6,B\r\n");

    expect(read.tokens).toEqual([
      { uid: "04E45150324189", kind: "E" },
      { uid: "04A1B2C3D4E5F6", kind: "B" },
    ]);
    expect(read.skipped).toBe(0);
  });

  it("counts the tokens of each kind, in order, after the last line has won", () => {
    const read = readWriterLog(
      "04E45150324189,E\n04A1B2C3D4E5F6,E\n04D00D00D00D00,B\n04E45150324189,B\n",
    );

    expect(read.kinds).toEqual([
      { kind: "B", tokens: 2 },
      { kind: "E", tokens: 1 },
    ]);
  });

  it("reads nothing from an empty paste", () => {
    expect(readWriterLog("")).toEqual({ tokens: [], kinds: [], skipped: 0, flagged: [] });
  });
});
