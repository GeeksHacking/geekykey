// Message fields are validated here; the sketch reads JSON into these fields.
#include <cstdio>
#include <cstring>
#include "../station_message.h"
static int failures = 0;

#define CHECK(condition)                                               \
  do {                                                                 \
    if (!(condition)) {                                                \
      std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition); \
      failures++;                                                      \
    }                                                                  \
  } while (0)

static void linesFollowTheScreenContract() {
  MessageLine lines[] = {{"", 0}, {"0123456789abcdef", 16}};
  CHECK(validateMessageLines(lines, 1, false) == nullptr);
  CHECK(validateMessageLines(lines, 2, false) == nullptr);
  CHECK(validateMessageLines(lines, 0, false) != nullptr);
  CHECK(validateMessageLines(lines, 3, false) != nullptr);
  lines[0] = {nullptr, 0};
  CHECK(validateMessageLines(lines, 1, false) != nullptr);
  lines[0] = {"0123456789abcdefg", 17};
  CHECK(validateMessageLines(lines, 1, false) != nullptr);
  lines[0] = {"a\nb", 3};
  CHECK(validateMessageLines(lines, 1, false) != nullptr);
  lines[0] = {"a\0b", 3};
  CHECK(validateMessageLines(lines, 1, false) != nullptr);
  lines[0] = {"\x7f", 1};
  CHECK(validateMessageLines(lines, 1, false) != nullptr);
  lines[0] = {"\xc3\xa9", 2};
  CHECK(validateMessageLines(lines, 1, false) != nullptr);
  lines[0] = {" ~", 2};
  CHECK(validateMessageLines(lines, 1, false) == nullptr);
}

static void countdownAndBeepFollowTheContract() {
  MessageFields fields;
  fields.lines[0] = {"Tap here", 8}; fields.lineCount = 1;
  CHECK(validateStationMessage(fields) == nullptr);
  fields.beepIsBool = false;
  CHECK(validateStationMessage(fields) != nullptr);
  fields.beepIsBool = true;
  fields.hasCountdown = true;
  fields.seconds = 1;
  fields.countdownLines[0] = {"0123456789abc{s}", 16}; fields.countdownLineCount = 1;
  fields.ending[0] = {"Done", 4}; fields.endingCount = 1;
  CHECK(validateStationMessage(fields) == nullptr);
  fields.seconds = 99;
  CHECK(validateStationMessage(fields) == nullptr);
  fields.seconds = 0;
  CHECK(validateStationMessage(fields) != nullptr);
  fields.seconds = 100;
  CHECK(validateStationMessage(fields) != nullptr);
  fields.seconds = 20;
  fields.secondsIsInteger = false;
  CHECK(validateStationMessage(fields) != nullptr);
  fields.secondsIsInteger = true;
  fields.countdownLines[0] = {"0123456789abcd{s}", 17};
  CHECK(validateStationMessage(fields) == nullptr);
  fields.countdownLines[1] = {"{s}", 3}; fields.countdownLineCount = 2;
  CHECK(validateStationMessage(fields) != nullptr);
  fields.countdownLines[0] = {"{s} {s}", 7}; fields.countdownLineCount = 1;
  CHECK(validateStationMessage(fields) != nullptr);
  fields.countdownLines[0] = {"Time left", 9};
  CHECK(validateStationMessage(fields) == nullptr);
  fields.endingCount = 0;
  CHECK(validateStationMessage(fields) != nullptr);
}

static void aFrameContainsOneWholeJsonObject() {
  CHECK(messageHasOneJsonObject(" {} ", 4));
  const char *nested = "{\"lines\":[\"}\\\"{\"],\"countdown\":{}}";
  CHECK(messageHasOneJsonObject(nested, strlen(nested)));
  CHECK(!messageHasOneJsonObject("{}garbage", 9));
  CHECK(!messageHasOneJsonObject("{} {}", 5));
  CHECK(!messageHasOneJsonObject("[]", 2));
  CHECK(!messageHasOneJsonObject("{", 1));
  CHECK(!messageHasOneJsonObject("{}\0", 3));
}

int main() {
  aFrameContainsOneWholeJsonObject();
  linesFollowTheScreenContract();
  countdownAndBeepFollowTheContract();
  if (failures > 0) {
    std::printf("%d failed\n", failures);
    return 1;
  }
  std::printf("All passed\n");
}
