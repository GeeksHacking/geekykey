import assert from "node:assert/strict";
import { createConnection } from "mysql2/promise";
import { onTestFinished, test } from "vitest";
import { columnsOf, migrationsUpTo, scratchDatabase } from "../../test-support/migrations.ts";
import { migrate } from "../db/migrate.ts";
import { testDb } from "../test-helpers.ts";

test("each Event table has only the columns the spec gives it", async () => {
  const expected = {
    stations: [
      "id",
      "api_key_hash",
      "label",
      "disabled_at",
      "created_at",
      "last_seen_at",
      "firmware_version",
      "buffered_taps",
      "reader_ok",
    ],
    users: ["id", "display_name", "name_set_at", "created_at"],
    taps: [
      "id",
      "station_id",
      "client_tap_id",
      "user_id",
      "source",
      "status",
      "tapped_at",
      "received_at",
    ],
    passport_stations: ["station_id", "name", "location", "booth", "points", "added_at"],
  };
  for (const [table, columns] of Object.entries(expected)) {
    assert.deepEqual((await columnsOf(testDb(), table)).toSorted(), columns.toSorted(), table);
  }
});

test("dropping the old columns keeps the stations, their keys and every tap with a user", async () => {
  // Production as the version before this one left it, with test data from
  // older versions: a tap stored with no user, and a user's old role.
  const url = await scratchDatabase("geekykey_event_migration");
  await migrate(url, await migrationsUpTo("0007_taps_are_never_unknown_token"));
  const connection = await createConnection({ uri: url });
  onTestFinished(() => connection.end());
  await connection.query(
    `INSERT INTO stations (id, label, name, location, api_key_hash, points, created_at) VALUES
      ('station-1', 'Booth 1', 'Booth 1', 'Hall A', '${"a".repeat(64)}', 2, '2026-10-12T05:00:00.000Z')`,
  );
  await connection.query(
    `INSERT INTO passport_stations (station_id, name, location, points, added_at) VALUES
      ('station-1', 'Booth 1', 'Hall A', 2, '2026-10-12T05:00:00.000Z')`,
  );
  await connection.query(
    `INSERT INTO users (id, portal_user_id, display_name, role, created_at) VALUES
      ('test-participant', 'test-participant', 'Alex', 'organizer', '2026-10-12T05:00:00.000Z')`,
  );
  await connection.query(
    `INSERT INTO taps (station_id, client_tap_id, token_uid, user_id, status, received_at) VALUES
      ('station-1', 't1', '04A1B2C3D4E5F6', 'test-participant', 'accepted', '2026-10-12T05:01:00.000Z'),
      ('station-1', 't2', '04A1B2C3D4E5F6', NULL, 'cooldown', '2026-10-12T05:02:00.000Z'),
      ('station-1', 't3', NULL, 'test-participant', 'no_game', '2026-10-12T05:03:00.000Z')`,
  );

  await migrate(url);

  const [stations] = await connection.query("SELECT id, label, api_key_hash FROM stations");
  assert.deepEqual(stations, [{ id: "station-1", label: "Booth 1", api_key_hash: "a".repeat(64) }]);
  const [passport] = await connection.query(
    "SELECT station_id, name, location, points FROM passport_stations",
  );
  assert.deepEqual(passport, [
    { station_id: "station-1", name: "Booth 1", location: "Hall A", points: 2 },
  ]);
  const [users] = await connection.query("SELECT id, display_name FROM users");
  assert.deepEqual(users, [{ id: "test-participant", display_name: "Alex" }]);
  const [taps] = await connection.query(
    "SELECT client_tap_id, user_id, status FROM taps ORDER BY client_tap_id",
  );
  assert.deepEqual(taps, [
    { client_tap_id: "t1", user_id: "test-participant", status: "accepted" },
    { client_tap_id: "t3", user_id: "test-participant", status: "no_game" },
  ]);
  // A tap with no user is refused from now on.
  await assert.rejects(
    connection.query(
      `INSERT INTO taps (station_id, client_tap_id, user_id, status, received_at) VALUES
        ('station-1', 't4', NULL, 'accepted', '2026-10-12T05:04:00.000Z')`,
    ),
    /cannot be null/,
  );
});

test("users given the old default name get the new one, and every name still comes from a login", async () => {
  const url = await scratchDatabase("geekykey_event_migration");
  await migrate(url, await migrationsUpTo("0008_the_old_columns_go"));
  const connection = await createConnection({ uri: url });
  onTestFinished(() => connection.end());
  await connection.query(
    `INSERT INTO users (id, display_name, created_at) VALUES
      ('google-user', 'Ada Lim', '2026-10-20T05:00:00.000Z'),
      ('guest', 'GeeksHacking member', '2026-10-21T05:00:00.000Z')`,
  );

  await migrate(url);

  const [users] = await connection.query(
    "SELECT id, display_name, name_set_at FROM users ORDER BY id",
  );
  assert.deepEqual(users, [
    { id: "google-user", display_name: "Ada Lim", name_set_at: null },
    { id: "guest", display_name: "Guest", name_set_at: null },
  ]);
});
