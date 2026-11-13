/*
  The socket owns its clients and runs on core 0. Only copied messages and
  atomic facts cross into loop(); none of these calls waits for the network.
*/
#pragma once
#include <Arduino.h>
#include "station_screen.h"

bool startStationSocket(const String &host, uint16_t port, bool https, bool local,
                        const String &key, const char *roots);
void stationSocketClockSet();
void stationSocketWifi(bool connected);
void pauseStationSocket();
bool takeSocketMessage(StationMessage &message);
// 0 means no change, 401 rejected, 101 opened.
int takeSocketStatus();
