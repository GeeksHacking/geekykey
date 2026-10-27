/*
  The station's rules about time, apart from the sketch so they can be tested
  on a laptop (test/tap_timing_test.cpp). Nothing here touches a pin, the
  reader or the network: the sketch asks, and does what the answer says.
*/

#pragma once

#include <stdint.h>
#include <string.h>

// The sounds a result can play on the buzzer. Each one is shorter than a
// result shows, so it ends while the result still shows.
#define SOUND_NONE 0
#define SOUND_ACCEPTED 1  // one 1-second beep
#define SOUND_COOLDOWN 2  // two slow beeps: not yet, try again later
#define SOUND_ERROR 3     // three fast beeps: something is wrong

// Whether the buzzer is on `elapsed` milliseconds after a sound started. The
// buzzer is an active one, which sounds while its pin is HIGH, so a sound is a
// pattern of beeps and gaps with no pitch.
inline bool soundIsOn(int sound, uint32_t elapsed) {
  // Each sound's steps in milliseconds, on first, then off, on, and so on.
  static const uint32_t accepted[] = {1000};
  static const uint32_t cooldown[] = {200, 200, 200};
  static const uint32_t error[] = {80, 80, 80, 80, 80};
  const uint32_t *steps = nullptr;
  int count = 0;
  if (sound == SOUND_ACCEPTED) {
    steps = accepted;
    count = sizeof(accepted) / sizeof(accepted[0]);
  } else if (sound == SOUND_COOLDOWN) {
    steps = cooldown;
    count = sizeof(cooldown) / sizeof(cooldown[0]);
  } else if (sound == SOUND_ERROR) {
    steps = error;
    count = sizeof(error) / sizeof(error[0]);
  }
  uint32_t stepEndsAt = 0;
  for (int i = 0; i < count; i++) {
    stepEndsAt += steps[i];
    if (elapsed < stepEndsAt) return i % 2 == 0;
  }
  return false;
}

// How long after a token is read the same token is answered from memory, with
// no request. It can't change anyone's points: the server's cooldown (300 s by
// default) decides those. A slow answer through a far data centre (3.7 s) and
// a second tap 1 s after its result still fall inside it.
#define REPEAT_WINDOW_MS 5000UL

// The longest UID as text: 10 bytes, two hex digits each, and the end.
#define UID_TEXT_MAX 21

// The last token read, so a repeat tap of it can be answered without asking
// the server again.
struct LastToken {
  char uid[UID_TEXT_MAX] = "";
  uint32_t readAt = 0;   // millis() when it was read and sent
  bool counted = false;  // the server answered accepted or cooldown
};

// What the station does with a token it has just read.
enum TokenAnswer {
  SEND_TAP,          // save it and send it, as any new tap
  KEEP_RESULT,       // its own result still shows: a click, and the screen stays as it is
  ALREADY_COUNTED,   // the server counted it a moment ago: say so, as for cooldown
  SHOW_LAST_RESULT,  // the server didn't count it a moment ago: show that result again
};

// `now` is millis(); times are uint32_t, as millis() is on the ESP32, so the
// subtraction is right across its wrap after about 49 days, on a laptop too.
// `resultShowing` is whether a result is on the screen. Any result shown
// belongs to the last token read, since a new token replaces it first.
inline TokenAnswer answerToken(const LastToken &last, const char *uid, uint32_t now, bool resultShowing) {
  if (strcmp(last.uid, uid) != 0) return SEND_TAP;
  if (resultShowing) return KEEP_RESULT;
  if ((uint32_t)(now - last.readAt) >= REPEAT_WINDOW_MS) return SEND_TAP;
  return last.counted ? ALREADY_COUNTED : SHOW_LAST_RESULT;
}

// Remembers a token that was just sent, and whether the server counted it.
inline void rememberToken(LastToken &last, const char *uid, uint32_t readAt, bool counted) {
  strncpy(last.uid, uid, UID_TEXT_MAX - 1);
  last.uid[UID_TEXT_MAX - 1] = '\0';
  last.readAt = readAt;
  last.counted = counted;
}
