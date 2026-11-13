// Tests for station_screen.h, run on the laptop rather than the station:
//
//   c++ -std=c++17 -Wall -Wextra -o /tmp/station_screen_test firmware/geekykey_station/test/station_screen_test.cpp && /tmp/station_screen_test
//
// The Arduino builder compiles only a sketch's own folder and its src/, so
// this file never goes onto a station.

#include <cstdio>
#include <cstring>

#include "../station_screen.h"

static int failures = 0;

#define CHECK(condition)                                               \
  do {                                                                 \
    if (!(condition)) {                                                \
      std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition); \
      failures++;                                                      \
    }                                                                  \
  } while (0)

static Countdown countdownFrom(uint32_t startedAt, uint32_t seconds) {
  Countdown countdown;
  countdown.running = true;
  countdown.startedAt = startedAt;
  countdown.seconds = seconds;
  return countdown;
}

// A 27-second countdown shows 27 for its first second, drops by one each
// second after, and reaches 0 at 27 seconds.
static void countdownDropsByOneEachSecond() {
  const Countdown countdown = countdownFrom(5000, 27);
  CHECK(countdownSecondsLeft(countdown, 5000) == 27);
  CHECK(countdownSecondsLeft(countdown, 5999) == 27);
  CHECK(countdownSecondsLeft(countdown, 6000) == 26);
  CHECK(countdownSecondsLeft(countdown, 31001) == 1);
  CHECK(countdownSecondsLeft(countdown, 32000) == 0);
  CHECK(countdownSecondsLeft(countdown, 90000) == 0);
}

// millis() goes back to 0 after about 49 days. A countdown started just
// before that still counts on just after it.
static void countdownSurvivesMillisWrapping() {
  const Countdown countdown = countdownFrom(0xFFFFFFFFUL - 499, 10);
  CHECK(countdownSecondsLeft(countdown, 500) == 9);
  CHECK(countdownSecondsLeft(countdown, 9499) == 1);
  CHECK(countdownSecondsLeft(countdown, 9500) == 0);
}

// A countdown line's {s} becomes the seconds left, and the line is cut to the
// screen's 16 characters once it has.
static void countdownLineShowsTheSecondsLeft() {
  char line[LINE_CHARS + 1];
  fillCountdownLine(line, "3 in, {s}s left", 27);
  CHECK(strcmp(line, "3 in, 27s left") == 0);
  fillCountdownLine(line, "3 in, {s}s left", 9);
  CHECK(strcmp(line, "3 in, 9s left") == 0);
  fillCountdownLine(line, "{s}s left", 99);
  CHECK(strcmp(line, "99s left") == 0);
  fillCountdownLine(line, "Team duels", 27);
  CHECK(strcmp(line, "Team duels") == 0);
  // 17 characters with {s} counting as 2, as 6.1 allows: 16 once filled.
  fillCountdownLine(line, "12 players, {s}s!", 45);
  CHECK(strcmp(line, "12 players, 45s!") == 0);
  // Longer than 6.1 allows: cut, not wrapped.
  fillCountdownLine(line, "Many many players {s}", 5);
  CHECK(strcmp(line, "Many many player") == 0);
  // Only the first {s} is replaced.
  fillCountdownLine(line, "{s} and {s}", 7);
  CHECK(strcmp(line, "7 and {s}") == 0);
}

// With no countdown, the screen is a result while one shows, and the idle
// screen otherwise.
static void withoutACountdownResultsGiveWayToIdle() {
  const Countdown none;
  CHECK(screenNow(true, false, none, 1000, true) == SCREEN_RESULT);
  CHECK(screenNow(false, false, none, 1000, true) == SCREEN_IDLE);
}

// The tap that started a countdown shows it from the start, with its LED and
// sound, so the seconds tick on its own result too.
static void theCountdownsOwnResultCountsDown() {
  const Countdown countdown = countdownFrom(1000, 27);
  CHECK(screenNow(true, true, countdown, 1500, true) == SCREEN_COUNTDOWN);
  CHECK(screenNow(false, false, countdown, 3000, true) == SCREEN_COUNTDOWN);
}

// Another result during a countdown, such as an unknown tag, shows for its
// usual time. Then the countdown comes back, still running: 27 seconds from
// 1000 has 24 left at 4000, after a tap at 1500 whose result ended at 3500.
static void anotherResultPausesTheScreenNotTheCount() {
  const Countdown countdown = countdownFrom(1000, 27);
  CHECK(screenNow(true, false, countdown, 2000, true) == SCREEN_RESULT);
  CHECK(screenNow(false, false, countdown, 4000, true) == SCREEN_COUNTDOWN);
  CHECK(countdownSecondsLeft(countdown, 4000) == 24);
}

// At zero the countdown ends, with its ending lines. A countdown shorter than
// its own result ends on time, but another result showing at zero keeps the
// screen until it ends, and the ending comes after it.
static void atZeroTheEndingShows() {
  const Countdown countdown = countdownFrom(1000, 27);
  CHECK(screenNow(false, false, countdown, 28000, true) == SCREEN_ENDING);
  CHECK(screenNow(true, false, countdown, 28000, true) == SCREEN_RESULT);
  CHECK(screenNow(false, false, countdown, 29500, true) == SCREEN_ENDING);

  const Countdown oneSecond = countdownFrom(1000, 1);
  CHECK(screenNow(true, true, oneSecond, 2000, true) == SCREEN_ENDING);
}

// Once the sketch stops a countdown at its ending, the idle screen follows.
static void aStoppedCountdownLeavesTheIdleScreen() {
  Countdown countdown = countdownFrom(1000, 27);
  countdown.running = false;
  CHECK(screenNow(false, false, countdown, 5000, true) == SCREEN_IDLE);
}

// A reader that stops answering shows its own screen over the countdown,
// since the station can't take taps, while the count goes on underneath and
// still ends on time. Another result still shows for its usual time first.
static void aReaderErrorCoversTheCountdown() {
  const Countdown countdown = countdownFrom(1000, 27);
  CHECK(screenNow(false, false, countdown, 5000, false) == SCREEN_IDLE);
  CHECK(screenNow(true, false, countdown, 5000, false) == SCREEN_RESULT);
  CHECK(screenNow(false, false, countdown, 28000, false) == SCREEN_ENDING);
}

// A new answer's countdown replaces the one running and counts from its own
// answer: that's how "3 in" becomes "4 in". Seconds outside 6.1's 1 to 99
// start nothing and leave the running one alone.
static void aNewCountdownReplacesTheRunningOne() {
  Countdown countdown = countdownFrom(1000, 27);
  CHECK(startCountdown(countdown, 20, 9000));
  CHECK(countdown.running);
  CHECK(countdownSecondsLeft(countdown, 9000) == 20);
  CHECK(countdownSecondsLeft(countdown, 10000) == 19);

  CHECK(!startCountdown(countdown, 0, 12000));
  CHECK(!startCountdown(countdown, 100, 12000));
  CHECK(!startCountdown(countdown, -5, 12000));
  CHECK(countdown.running);
  CHECK(countdownSecondsLeft(countdown, 12000) == 17);
}

static IdleLines idleLinesOf(const char *line1, const char *line2) {
  IdleLines idle;
  idle.given = true;
  copyLine(idle.lines[0], line1);
  copyLine(idle.lines[1], line2);
  return idle;
}

// Without idle lines from a heartbeat, the idle screen is Ready / Tap a tag.
static void theIdleScreenIsReadyWithoutIdleLines() {
  const ScreenLines shown = idleScreen(IdleLines{}, true, true);
  CHECK(strcmp(shown.line1, "Ready") == 0);
  CHECK(strcmp(shown.line2, "Tap a tag") == 0);
}

// The heartbeat's idle lines name the station's game in their place.
static void theIdleScreenShowsTheHeartbeatsLines() {
  const IdleLines idle = idleLinesOf("Team duels", "Tap to join");
  const ScreenLines shown = idleScreen(idle, true, true);
  CHECK(strcmp(shown.line1, "Team duels") == 0);
  CHECK(strcmp(shown.line2, "Tap to join") == 0);
}

// A reader that doesn't answer keeps its own screen, which matters more.
static void aReaderErrorComesFirst() {
  const ScreenLines shown = idleScreen(idleLinesOf("Team duels", "Tap to join"), false, true);
  CHECK(strcmp(shown.line1, "Reader error") == 0);
  CHECK(strcmp(shown.line2, "Tell organizer") == 0);
}

// Without WiFi or a game's idle lines, the station says it is saving taps.
static void withoutWifiTheIdleScreenSaysItIsSaving() {
  const ScreenLines shown = idleScreen(IdleLines{}, true, false);
  CHECK(strcmp(shown.line1, "Ready") == 0);
  CHECK(strcmp(shown.line2, "No WiFi: saving") == 0);
}

// Without WiFi, the game's first line stays so people know where they are.
static void withoutWifiTheGamesFirstLineStays() {
  const IdleLines idle = idleLinesOf("Team duels", "Tap to join");
  const ScreenLines shown = idleScreen(idle, true, false);
  CHECK(strcmp(shown.line1, "Team duels") == 0);
  CHECK(strcmp(shown.line2, "No WiFi: saving") == 0);
}

// A game with one idle line still leaves room for the WiFi warning.
static void withoutWifiOneIdleLineStillShowsTheWarning() {
  const IdleLines idle = idleLinesOf("Team duels", "");
  const ScreenLines shown = idleScreen(idle, true, false);
  CHECK(strcmp(shown.line1, "Team duels") == 0);
  CHECK(strcmp(shown.line2, "No WiFi: saving") == 0);
}

// A reader that doesn't answer matters more than WiFi, with or without a game.
static void aReaderErrorComesBeforeNoWifi() {
  const ScreenLines withoutGame = idleScreen(IdleLines{}, false, false);
  CHECK(strcmp(withoutGame.line1, "Reader error") == 0);
  CHECK(strcmp(withoutGame.line2, "Tell organizer") == 0);
  const ScreenLines withGame = idleScreen(idleLinesOf("Team duels", "Tap to join"), false, false);
  CHECK(strcmp(withGame.line1, "Reader error") == 0);
  CHECK(strcmp(withGame.line2, "Tell organizer") == 0);
}

// WiFi returning restores the second line, without needing another heartbeat.
static void wifiReturningRestoresTheIdleLines() {
  struct Case {
    IdleLines idle;
    ScreenLines online;
  };
  const Case cases[] = {
      {IdleLines{}, {"Ready", "Tap a tag"}},
      {idleLinesOf("Team duels", "Tap to join"), {"Team duels", "Tap to join"}},
      {idleLinesOf("Team duels", ""), {"Team duels", ""}},
  };
  for (const Case &c : cases) {
    const ScreenLines offline = idleScreen(c.idle, true, false);
    CHECK(strcmp(offline.line1, c.online.line1) == 0);
    CHECK(strcmp(offline.line2, "No WiFi: saving") == 0);
    const ScreenLines online = idleScreen(c.idle, true, true);
    CHECK(strcmp(online.line1, c.online.line1) == 0);
    CHECK(strcmp(online.line2, c.online.line2) == 0);
  }
}

// A tap owns its first two seconds even if its countdown ends earlier.
// Only the newest waiting message survives, and its clock starts at arrival.
static void messagesWaitForTheTapThenReplaceItsCountdown() {
  StationMessages messages;
  messages.tapAnswered(1000);
  StationMessage first;
  copyLine(first.lines[0], "Old"); first.arrivedAt = 1100;
  messages.receive(first);
  StationMessage latest;
  copyLine(latest.lines[0], "Need Red"); latest.beep = true; latest.arrivedAt = 1500;
  startCountdown(latest.countdown, 20, latest.arrivedAt);
  messages.receive(latest);
  StationMessage shown;
  CHECK(!messages.take(2999, 2000, false, shown));
  CHECK(messages.take(3000, 2000, false, shown));
  CHECK(strcmp(shown.lines[0], "Need Red") == 0 && shown.beep);
  CHECK(countdownSecondsLeft(shown.countdown, 3000) == 19);
  CHECK(!messages.take(3001, 2000, false, shown)); // beep cannot play twice
  messages.receive(first);
  CHECK(messages.take(3001, 2000, false, shown)); // a newer message needs no window
  CHECK(!shown.countdown.running); // it replaces a running countdown too
}
static void ownScreensComeBeforeMessages() {
  StationMessages messages;
  StationMessage next; next.arrivedAt = 1000;
  startCountdown(next.countdown, 1, 1000);
  messages.receive(next);
  StationMessage shown;
  CHECK(!messages.take(1500, 2000, true, shown));
  CHECK(messages.take(4000, 2000, false, shown));
  CHECK(countdownSecondsLeft(shown.countdown, 4000) == 0);
  CHECK(screenNow(true, false, Countdown{}, 4000, false, true, false, true) == SCREEN_IDLE);
  CHECK(screenNow(true, false, Countdown{}, 4000, true, false, false, true) == SCREEN_IDLE);
  CHECK(screenNow(true, false, Countdown{}, 4000, true, true, true, true) == SCREEN_IDLE);
  messages.tapAnswered(0xffffff00UL);
  messages.receive(next);
  CHECK(!messages.take(500, 2000, false, shown));
  CHECK(messages.take(1744, 2000, false, shown));
}
int main() {
  messagesWaitForTheTapThenReplaceItsCountdown();
  ownScreensComeBeforeMessages();
  countdownDropsByOneEachSecond();
  countdownSurvivesMillisWrapping();
  countdownLineShowsTheSecondsLeft();
  withoutACountdownResultsGiveWayToIdle();
  theCountdownsOwnResultCountsDown();
  anotherResultPausesTheScreenNotTheCount();
  atZeroTheEndingShows();
  aStoppedCountdownLeavesTheIdleScreen();
  aReaderErrorCoversTheCountdown();
  aNewCountdownReplacesTheRunningOne();
  theIdleScreenIsReadyWithoutIdleLines();
  theIdleScreenShowsTheHeartbeatsLines();
  aReaderErrorComesFirst();
  withoutWifiTheIdleScreenSaysItIsSaving();
  withoutWifiTheGamesFirstLineStays();
  withoutWifiOneIdleLineStillShowsTheWarning();
  aReaderErrorComesBeforeNoWifi();
  wifiReturningRestoresTheIdleLines();
  if (failures > 0) {
    std::printf("%d failed\n", failures);
    return 1;
  }
  std::printf("All passed\n");
  return 0;
}
