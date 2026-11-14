import assert from "node:assert/strict";
import { test } from "vitest";
import type { Copy } from "./database-copy.ts";
import { showcaseSteps } from "./showcase-steps.ts";

const WINDOW = {
  from: new Date("2026-11-17T09:00:00+08:00"),
  to: new Date("2026-11-17T17:00:00+08:00"),
  leaveOut: [] as string[],
};

/** A copy as db:backup writes it, with only the tables the steps read. */
function copyOf(tables: Partial<Record<string, Record<string, unknown>[]>>): Copy {
  return {
    database: "geekykey_production",
    taken_at: "2026-11-17T11:30:00.000Z",
    tables: {
      users: [],
      answers: [],
      group_members: [],
      meeting_halves: [],
      connections: [],
      ...tables,
    } as Copy["tables"],
  };
}

function user(id: string, createdAt: string, more: Record<string, unknown> = {}) {
  return { id, display_name: "Guest", name_set_at: null, created_at: createdAt, ...more };
}

/** The line for one step, found by the step's name at its start. */
function lineFor(lines: string[], step: string): string {
  const line = lines.find((l) => l.trimStart().startsWith(step));
  assert.ok(line, `no line for ${step} in:\n${lines.join("\n")}`);
  return line;
}

test("only users created in the window and not left out by name are counted", () => {
  const copy = copyOf({
    users: [
      user("before", "2026-11-17T00:59:59.999Z"), // 8:59:59 am in Singapore
      user("first", "2026-11-17T01:00:00.000Z"),
      user("second", "2026-11-17T08:59:59.999Z"),
      user("after", "2026-11-17T09:00:00.000Z"), // 5 pm, the window's end
      user("team", "2026-11-17T02:00:00.000Z", { display_name: "  adam " }),
    ],
  });

  const lines = showcaseSteps(copy, { ...WINDOW, leaveOut: ["Adam"] });

  assert.match(lineFor(lines, "Created"), /^\s*Created\s+2$/);
  assert.ok(lines.some((l) => /left out by name: 1$/i.test(l)));
});

test("each step counts the users in the window who reached it", () => {
  const at = "2026-11-17T02:00:00.000Z";
  const copy = copyOf({
    users: [
      user("ana", at, { display_name: "Ana", name_set_at: "2026-11-17T02:01:00.000Z" }),
      user("ben", at, { display_name: "Ben", name_set_at: "2026-11-17T02:02:00.000Z" }),
      user("cai", at),
      user("old", "2026-11-10T02:00:00.000Z", { name_set_at: "2026-11-10T02:01:00.000Z" }),
    ],
    answers: [
      { user_id: "ana", choices: { q1: "a" }, fixed_at: null },
      { user_id: "ben", choices: { q1: "b", q2: "a" }, fixed_at: null },
      // A row with no answers in it, as a connection makes one.
      { user_id: "cai", choices: {}, fixed_at: null },
      { user_id: "old", choices: { q1: "a" }, fixed_at: null },
    ],
    group_members: [
      { user_id: "ana", group_id: "g1", joined_at: "2026-11-17T02:05:00.000Z" },
      { user_id: "old", group_id: "g1", joined_at: "2026-11-10T02:05:00.000Z" },
    ],
    connections: [{ user_a: "ana", user_b: "old", connected_at: "2026-11-17T02:10:00.000Z" }],
  });

  const lines = showcaseSteps(copy, WINDOW);

  assert.match(lineFor(lines, "Created"), /^\s*Created\s+3$/);
  assert.match(lineFor(lines, "Named"), /^\s*Named\s+2\b/);
  assert.match(lineFor(lines, "Answered"), /^\s*Answered\s+2\b/);
  assert.match(lineFor(lines, "Joined a group"), /^\s*Joined a group\s+1\b/);
  assert.match(lineFor(lines, "Connected"), /^\s*Connected\s+1\b/);
});

test("each timed step gives the median time since the timed step before, over users with both", () => {
  const minutes = (m: number) =>
    new Date(Date.parse("2026-11-17T02:00:00.000Z") + m * 60_000).toISOString();
  const copy = copyOf({
    users: [
      user("ana", minutes(0), { name_set_at: minutes(1) }),
      user("ben", minutes(0), { name_set_at: minutes(3) }),
      user("cai", minutes(0), { name_set_at: minutes(2) }),
      user("dee", minutes(0)),
    ],
    answers: [{ user_id: "ana", choices: { q1: "a" }, fixed_at: null }],
    group_members: [
      { user_id: "ana", group_id: "g1", joined_at: minutes(5) }, // 4 min after naming
      { user_id: "ben", group_id: "g1", joined_at: minutes(9) }, // 6 min after naming
      { user_id: "dee", group_id: "g1", joined_at: minutes(1) }, // never named
    ],
    connections: [
      // Ana's first connection counts, 10 min 30 s after joining. Cai never joined.
      { user_a: "ana", user_b: "team-member", connected_at: minutes(15.5) },
      { user_a: "ana", user_b: "cai", connected_at: minutes(40) },
    ],
  });

  const lines = showcaseSteps(copy, WINDOW);

  assert.match(lineFor(lines, "Created"), /^\s*Created\s+4$/);
  assert.match(lineFor(lines, "Named"), /\s3\s+median 2 min after created \(3 users\)$/);
  assert.match(lineFor(lines, "Answered"), /\s1\s+no time kept$/);
  assert.match(lineFor(lines, "Joined a group"), /\s3\s+median 5 min after named \(2 users\)$/);
  assert.match(
    lineFor(lines, "Connected"),
    /\s2\s+median 10 min 30 s after joined a group \(1 user\)$/,
  );
});

test("a step most users reached first reads as before, and long times read in hours", () => {
  const copy = copyOf({
    users: [user("ana", "2026-11-17T02:00:00.000Z", { name_set_at: "2026-11-17T03:05:00.000Z" })],
    group_members: [{ user_id: "ana", group_id: "g1", joined_at: "2026-11-17T03:00:00.000Z" }],
  });

  const lines = showcaseSteps(copy, WINDOW);

  assert.match(lineFor(lines, "Named"), /median 1 h 5 min after created \(1 user\)$/);
  assert.match(lineFor(lines, "Joined a group"), /median 5 min before named \(1 user\)$/);
});

test("users who sent a request still waiting when the copy was taken are counted on their own line", () => {
  const at = "2026-11-17T02:00:00.000Z";
  const copy = copyOf({
    users: [user("ana", at), user("ben", at), user("cai", at), user("dee", at)],
    meeting_halves: [
      // Ana sent a request that still waits for the team member.
      { user_a: "ana", user_b: "team", a_met_at: at, b_met_at: null, request_id: "r1" },
      // Ben's half is from before requests, which counts for nothing.
      { user_a: "abe", user_b: "ben", a_met_at: null, b_met_at: at, request_id: null },
      // Dee sent Cai a request: Dee counts, Cai, who got it, doesn't.
      { user_a: "cai", user_b: "dee", a_met_at: null, b_met_at: at, request_id: "r2" },
    ],
  });

  const lines = showcaseSteps(copy, WINDOW);

  assert.ok(
    lines.includes("Sent a request still waiting when the copy was taken: 2"),
    lines.join("\n"),
  );
});

test("the lines give the window and the copy's time in Singapore time, and no name or user ID", () => {
  const at = "2026-11-17T02:00:00.000Z";
  const copy = copyOf({
    users: [
      user("uid-zq81", at, { display_name: "Zephyrine", name_set_at: at }),
      user("uid-kk02", at, { display_name: "Adam Lee" }),
    ],
    answers: [{ user_id: "uid-zq81", choices: { q1: "a" }, fixed_at: null }],
    group_members: [{ user_id: "uid-zq81", group_id: "grp-9", joined_at: at }],
    connections: [{ user_a: "uid-zq81", user_b: "uid-x", connected_at: at }],
    meeting_halves: [
      { user_a: "uid-zq81", user_b: "uid-y", a_met_at: at, b_met_at: null, request_id: "req-5" },
    ],
  });

  const lines = showcaseSteps(copy, { ...WINDOW, leaveOut: ["Adam Lee"] });

  assert.equal(
    lines[0],
    "Copy of geekykey_production, taken Tue 17 Nov 2026, 19:30 Singapore time",
  );
  assert.equal(
    lines[1],
    "Users created from Tue 17 Nov 2026, 09:00 to Tue 17 Nov 2026, 17:00 Singapore time",
  );
  const text = lines.join("\n");
  for (const secret of ["uid-", "Zephyrine", "Adam", "grp-9", "req-5"]) {
    assert.ok(!text.includes(secret), `${secret} printed in:\n${text}`);
  }
});
