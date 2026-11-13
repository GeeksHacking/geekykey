#pragma once
#include <Arduino.h>
#include "token_upload.h"

// No network calls on loop(). The task owns WiFi, mDNS and both clients.
void startTokenUploads();
void writerPrintLine(const String& line);
// Prints the unchanged backup line and queues that write under one lock.
uint32_t logWrittenToken(const char* uid, char kind);
struct UploadSnapshot {
  bool enabled = false;
  bool wifi = false;
  size_t waiting = 0;
  uint32_t pasteNeeded = 0;
  UploadState state = UploadState::Off;
};
UploadSnapshot tokenUploadSnapshot(uint32_t id = 0);
