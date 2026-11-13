/*
  What the station's screen shows between and after taps, apart from the
  sketch so it can be tested on a laptop (test/station_screen_test.cpp): a
  countdown a tap's answer starts, and the idle screen from a heartbeat's
  answer and the WiFi state (API agreement 6.1 and 6.2). Nothing here touches
  a pin or the screen: the sketch asks, and draws what the answer says.
*/

#pragma once

#include <stdint.h>
#include <stdio.h>
#include <string.h>

// The characters on one line of the screen, a 16x2 LCD.
#define LINE_CHARS 16

// Copies a line for the screen. 6.1 keeps a game's lines to 16 characters,
// and anything longer from a server that doesn't is cut, not wrapped.
inline void copyLine(char *line, const char *text) {
  strncpy(line, text, LINE_CHARS);
  line[LINE_CHARS] = '\0';
}

// The longest countdown line kept from an answer. 6.1 allows 17 characters,
// with {s} counting as 2; this leaves room for a server that sends more.
#define COUNTDOWN_LINE_MAX 32

// A countdown from a tap's answer (6.1). It counts from millis() when the
// answer arrived, not from the clock, so a station with a wrong clock still
// counts correctly.
struct Countdown {
  bool running = false;
  uint32_t startedAt = 0;  // millis() when the answer arrived
  uint32_t seconds = 0;    // 1 to 99, from the answer
  char lines[2][COUNTDOWN_LINE_MAX + 1] = {"", ""};  // with {s} still in them
  char ending[2][LINE_CHARS + 1] = {"", ""};         // shown at zero
};

// Fills in a countdown line: its first {s} becomes the seconds left. `line`
// holds LINE_CHARS characters and the end.
inline void fillCountdownLine(char *line, const char *countdownLine, uint32_t secondsLeft) {
  const char *marker = strstr(countdownLine, "{s}");
  if (!marker) {
    copyLine(line, countdownLine);
    return;
  }
  // Everything before {s}, the number, then everything after, cut to fit as
  // it goes: anything past the 16th character is never shown.
  char filled[LINE_CHARS + 1] = "";
  const size_t before = (size_t)(marker - countdownLine);
  const size_t kept = before < LINE_CHARS ? before : LINE_CHARS;
  strncpy(filled, countdownLine, kept);
  filled[kept] = '\0';
  char number[12];
  snprintf(number, sizeof(number), "%lu", (unsigned long)secondsLeft);
  strncat(filled, number, LINE_CHARS - strlen(filled));
  strncat(filled, marker + 3, LINE_CHARS - strlen(filled));
  copyLine(line, filled);
}

// The seconds left to show `now` millis(), rounded up, so the first second
// shows the answer's `seconds` and 0 comes only at the end.
// Times are uint32_t, as millis() is on the ESP32, so the subtraction is right
// across its wrap after about 49 days.
inline uint32_t countdownSecondsLeft(const Countdown &countdown, uint32_t now) {
  const uint32_t total = countdown.seconds * 1000UL;
  const uint32_t elapsed = now - countdown.startedAt;
  if (elapsed >= total) return 0;
  return (total - elapsed + 999) / 1000;
}

// Starts a countdown of `seconds` from `now`, replacing any running. Seconds
// outside 6.1's 1 to 99 start nothing, and the answer's lines show instead.
inline bool startCountdown(Countdown &countdown, long seconds, uint32_t now) {
  if (seconds < 1 || seconds > 99) return false;
  countdown.running = true;
  countdown.startedAt = now;
  countdown.seconds = (uint32_t)seconds;
  return true;
}

// What the screen shows now.
enum Screen {
  SCREEN_RESULT,     // a result other than the countdown's own: leave it as it is
  SCREEN_COUNTDOWN,  // the countdown's lines, with the seconds left
  SCREEN_ENDING,     // the countdown has reached zero: stop it and show its ending
  SCREEN_IDLE,       // the idle screen
};

// `resultShowing` is whether a result is on the screen, and `resultCountsDown`
// whether that result is the one that started the countdown. A reader that
// doesn't answer covers the countdown with the idle screen's reader error, and
// the count goes on underneath.
inline Screen screenNow(bool resultShowing, bool resultCountsDown, const Countdown &countdown, uint32_t now,
                        bool readerOk) {
  if (resultShowing && !resultCountsDown) return SCREEN_RESULT;
  if (countdown.running) {
    if (countdownSecondsLeft(countdown, now) == 0) return SCREEN_ENDING;
    return readerOk ? SCREEN_COUNTDOWN : SCREEN_IDLE;
  }
  return resultShowing ? SCREEN_RESULT : SCREEN_IDLE;
}

// The idle screen's lines from the latest heartbeat's answer (6.2), kept
// until the next answer. `given` is false when it had none.
struct IdleLines {
  bool given = false;
  char lines[2][LINE_CHARS + 1] = {"", ""};
};

// Two lines for the screen. They point at text that outlives the call.
struct ScreenLines {
  const char *line1;
  const char *line2;
};

// The idle screen, between taps: the heartbeat's idle lines, or Ready / Tap
// a tag without them. Without WiFi, only the second line becomes No WiFi:
// saving. A reader that doesn't answer shows its own screen instead, since
// the station can't take taps.
inline ScreenLines idleScreen(const IdleLines &idle, bool readerOk, bool wifiConnected) {
  if (!readerOk) return ScreenLines{"Reader error", "Tell organizer"};
  if (!wifiConnected) return ScreenLines{idle.given ? idle.lines[0] : "Ready", "No WiFi: saving"};
  if (!idle.given) return ScreenLines{"Ready", "Tap a tag"};
  return ScreenLines{idle.lines[0], idle.lines[1]};
}
