// Tests for tap_timing.h, run on the laptop rather than the station:
//
//   c++ -std=c++17 -Wall -Wextra -o /tmp/tap_timing_test firmware/geekykey_station/test/tap_timing_test.cpp && /tmp/tap_timing_test
//
// The Arduino builder compiles only a sketch's own folder and its src/, so
// this file never goes onto a station.

#include <cstdio>

#include "../tap_timing.h"

static int failures = 0;

#define CHECK(condition)                                               \
  do {                                                                 \
    if (!(condition)) {                                                \
      std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition); \
      failures++;                                                      \
    }                                                                  \
  } while (0)

// An accepted tap is one 1-second beep.
static void acceptedIsOneSecondBeep() {
  CHECK(soundIsOn(SOUND_ACCEPTED, 0));
  CHECK(soundIsOn(SOUND_ACCEPTED, 999));
  CHECK(!soundIsOn(SOUND_ACCEPTED, 1000));
  CHECK(!soundIsOn(SOUND_ACCEPTED, 1900));
}

// Cooldown is two slow beeps: 200 ms on, 200 off, 200 on.
static void cooldownIsTwoSlowBeeps() {
  CHECK(soundIsOn(SOUND_COOLDOWN, 0));
  CHECK(soundIsOn(SOUND_COOLDOWN, 199));
  CHECK(!soundIsOn(SOUND_COOLDOWN, 200));
  CHECK(!soundIsOn(SOUND_COOLDOWN, 399));
  CHECK(soundIsOn(SOUND_COOLDOWN, 400));
  CHECK(soundIsOn(SOUND_COOLDOWN, 599));
  CHECK(!soundIsOn(SOUND_COOLDOWN, 600));
}

// An error is three fast beeps: 80 ms on, 80 off, three times.
static void errorIsThreeFastBeeps() {
  CHECK(soundIsOn(SOUND_ERROR, 0));
  CHECK(soundIsOn(SOUND_ERROR, 79));
  CHECK(!soundIsOn(SOUND_ERROR, 80));
  CHECK(soundIsOn(SOUND_ERROR, 160));
  CHECK(!soundIsOn(SOUND_ERROR, 240));
  CHECK(soundIsOn(SOUND_ERROR, 320));
  CHECK(soundIsOn(SOUND_ERROR, 399));
  CHECK(!soundIsOn(SOUND_ERROR, 400));
}

static void noSoundIsSilent() {
  CHECK(!soundIsOn(SOUND_NONE, 0));
  CHECK(!soundIsOn(SOUND_NONE, 500));
}

static const char *TOKEN_A = "04E45150324189";
static const char *TOKEN_B = "04B47E53324189";

// A token other than the last one read is always sent, even while the last
// one's result shows.
static void anotherTokenIsSent() {
  LastToken last;
  CHECK(answerToken(last, TOKEN_A, 1000, false) == SEND_TAP);
  rememberToken(last, TOKEN_A, 1000, true);
  CHECK(answerToken(last, TOKEN_B, 1500, true) == SEND_TAP);
  CHECK(answerToken(last, TOKEN_B, 3000, false) == SEND_TAP);
}

// A token that slips off the reader and back while its own result shows
// leaves that result alone, however slow the answer was.
static void sameTokenDuringItsResultKeepsIt() {
  LastToken last;
  rememberToken(last, TOKEN_A, 1000, true);
  CHECK(answerToken(last, TOKEN_A, 1500, true) == KEEP_RESULT);
  CHECK(answerToken(last, TOKEN_A, 1000 + REPEAT_WINDOW_MS + 700, true) == KEEP_RESULT);
}

// Tapped again after its result, inside the window, a token the server
// counted gets "Already counted"; one it didn't, such as an unclaimed token,
// gets its last result again. Both with no request.
static void sameTokenAfterItsResultIsAnsweredFromMemory() {
  LastToken counted;
  rememberToken(counted, TOKEN_A, 1000, true);
  CHECK(answerToken(counted, TOKEN_A, 3500, false) == ALREADY_COUNTED);
  CHECK(answerToken(counted, TOKEN_A, 1000 + REPEAT_WINDOW_MS - 1, false) == ALREADY_COUNTED);

  LastToken notCounted;
  rememberToken(notCounted, TOKEN_A, 1000, false);
  CHECK(answerToken(notCounted, TOKEN_A, 3500, false) == SHOW_LAST_RESULT);
}

// The window counts from the tap, not from the end of its result, and once
// it's over the token is sent again for the server to judge.
static void sameTokenAfterTheWindowIsSent() {
  LastToken last;
  rememberToken(last, TOKEN_A, 1000, true);
  CHECK(answerToken(last, TOKEN_A, 1000 + REPEAT_WINDOW_MS, false) == SEND_TAP);
  CHECK(answerToken(last, TOKEN_A, 60000, false) == SEND_TAP);
}

// millis() goes back to 0 after about 49 days. A tap just before that is
// still a moment ago just after it.
static void theWindowSurvivesMillisWrapping() {
  const uint32_t justBeforeWrap = 0xFFFFFFFFUL - 999;
  LastToken last;
  rememberToken(last, TOKEN_A, justBeforeWrap, true);
  CHECK(answerToken(last, TOKEN_A, 1500, false) == ALREADY_COUNTED);
  CHECK(answerToken(last, TOKEN_A, REPEAT_WINDOW_MS, false) == SEND_TAP);
}

int main() {
  acceptedIsOneSecondBeep();
  cooldownIsTwoSlowBeeps();
  errorIsThreeFastBeeps();
  noSoundIsSilent();
  anotherTokenIsSent();
  sameTokenDuringItsResultKeepsIt();
  sameTokenAfterItsResultIsAnsweredFromMemory();
  sameTokenAfterTheWindowIsSent();
  theWindowSurvivesMillisWrapping();
  if (failures > 0) {
    std::printf("%d failed\n", failures);
    return 1;
  }
  std::printf("All passed\n");
  return 0;
}
