/*
  Validation of station-message fields (API agreement 6.3). JSON stays in
  the sketch; these lengths also catch an embedded NUL in a JSON string.
*/
#pragma once
#include <stddef.h>

struct MessageLine {
  const char *text = nullptr;
  size_t length = 0;
};

inline const char *validateMessageLines(const MessageLine *lines, size_t count, bool countdown) {
  if (count < 1 || count > 2) return "expected 1 or 2 lines";
  size_t markers = 0;
  for (size_t i = 0; i < count; i++) {
    if (!lines[i].text) return "line is not text";
    const char *text = lines[i].text;
    const size_t length = lines[i].length;
    size_t visible = length;
    for (size_t j = 0; j < length; j++) {
      if ((unsigned char)text[j] < 0x20 || (unsigned char)text[j] > 0x7e)
        return "line is not printable ASCII";
      if (countdown && j + 2 < length && text[j] == '{' && text[j + 1] == 's' && text[j + 2] == '}') {
        markers++;
        visible--; // {s} occupies two screen characters, not three.
      }
    }
    if (visible > 16) return "line exceeds 16 characters";
  }
  if (markers > 1) return "more than one {s}";
  return nullptr;
}

struct MessageFields {
  MessageLine lines[2];
  size_t lineCount = 0;
  bool beepIsBool = true; // absent is allowed; a present field must be bool
  bool hasCountdown = false;
  bool secondsIsInteger = true;
  long seconds = 0;
  MessageLine countdownLines[2];
  size_t countdownLineCount = 0;
  MessageLine ending[2];
  size_t endingCount = 0;
};

inline const char *validateStationMessage(const MessageFields &fields) {
  const char *error = validateMessageLines(fields.lines, fields.lineCount, false);
  if (error) return error;
  if (!fields.beepIsBool) return "beep is not boolean";
  if (!fields.hasCountdown) return nullptr;
  if (!fields.secondsIsInteger || fields.seconds < 1 || fields.seconds > 99)
    return "countdown seconds must be an integer from 1 to 99";
  error = validateMessageLines(fields.countdownLines, fields.countdownLineCount, true);
  if (error) return error;
  return validateMessageLines(fields.ending, fields.endingCount, false);
}

// ArduinoJson accepts a JSON value followed by other bytes. Check the frame
// boundary as well: exactly one object, with only JSON whitespace after it.
// ArduinoJson still checks the contents, nesting and string escapes.
inline bool messageHasOneJsonObject(const char *text, size_t length) {
  size_t i = 0;
  const auto whitespace = [](char c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; };
  while (i < length && whitespace(text[i])) i++;
  if (i == length || text[i] != '{') return false;
  int depth = 0;
  bool quoted = false, escaped = false;
  for (; i < length; i++) {
    const char c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c == '\\') escaped = true;
      else if (c == '"') quoted = false;
      continue;
    }
    if (c == '"') quoted = true;
    else if (c == '{' || c == '[') depth++;
    else if (c == '}' || c == ']') {
      if (--depth == 0) {
        i++;
        while (i < length && whitespace(text[i])) i++;
        return c == '}' && i == length;
      }
    }
  }
  return false;
}
