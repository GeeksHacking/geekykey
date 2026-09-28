/*
  ESP32-S3 + RC522 -> Read text from an NTAG213 (NDEF Text Record) -> (optionally) send to a server

  Every tag is assumed to be an NTAG213 -- no tag-type check is performed.
  Only the tag's written text is extracted (its factory UID is ignored).

  Wiring:
    RC522 3.3V  -> ESP32-S3 3V3
    RC522 GND   -> ESP32-S3 GND
    RC522 RST   -> GPIO9
    RC522 SCK   -> GPIO12
    RC522 MISO  -> GPIO13
    RC522 MOSI  -> GPIO11
    RC522 SDA   -> GPIO10   (this is the chip-select / SS pin)
    RC522 IRQ   -> not connected

  Library needed: "MFRC522" (Library Manager -> search MFRC522)
*/

#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>

#define SS_PIN   10
#define RST_PIN  9
#define SCK_PIN  12
#define MISO_PIN 13
#define MOSI_PIN 11

const char* ssid       = WIFI_SSID;
const char* password   = WIFI_PASSWORD;
const char* serverUrl  = "http://YOUR_SERVER_URL/api/tag"; // update once your server is ready

MFRC522 rfid(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  delay(1000);

  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  rfid.PCD_Init();

  Serial.println("--- RC522 self-test ---");
  rfid.PCD_DumpVersionToSerial(); // if this prints 0x00 or 0xFF, SPI wiring is broken
  Serial.println("------------------------");

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected! IP: " + WiFi.localIP().toString());

  Serial.println("Ready. Tap an NTAG213 tag...");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  // --- Read and parse the NDEF text ---
  String tagText = readNtag213Text();

  if (tagText.length() > 0) {
    Serial.println("Extracted text: " + tagText);
    sendToServer(tagText);
  } else {
    Serial.println("No NDEF text record found (tag may be blank, locked, or a different format).");
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1000); // simple debounce so one tap isn't read multiple times
}

// Reads user memory pages (starting at page 4) from an NTAG213 and returns
// the text payload of the first NDEF Text Record it finds.
String readNtag213Text() {
  byte fullBuffer[144]; // NTAG213 user memory is roughly 144 bytes
  int bytesRead = 0;
  byte page = 4;

  // MIFARE_Read pulls 16 bytes (4 pages) per call, same command works on Ultralight/NTAG
  while (page <= 39 && bytesRead < (int)sizeof(fullBuffer)) {
    byte buffer[18];
    byte size = sizeof(buffer);
    MFRC522::StatusCode status = rfid.MIFARE_Read(page, buffer, &size);
    if (status != MFRC522::STATUS_OK) break;

    int toCopy = min(16, (int)sizeof(fullBuffer) - bytesRead);
    memcpy(fullBuffer + bytesRead, buffer, toCopy);
    bytesRead += toCopy;
    page += 4;
  }

  return parseNdefText(fullBuffer, bytesRead);
}

// Walks the TLV structure to find an NDEF Message (type 0x03), then walks
// EVERY record inside that message (a tag can hold a URI record AND a Text
// record back to back) and returns only the payload of the Text record
// (type byte 0x54 = 'T'), skipping URI records (type byte 0x55 = 'U') or
// any other record type it encounters.
String parseNdefText(byte* data, int len) {
  int i = 0;
  while (i < len) {
    byte tlvType = data[i];

    if (tlvType == 0x00) { i++; continue; } // NULL TLV, skip
    if (tlvType == 0xFE) break;              // Terminator TLV, end of memory

    if (i + 1 >= len) break;
    int tlvLength  = data[i + 1];
    int valueStart = i + 2;

    if (tlvType == 0x03 && valueStart < len) { // NDEF Message TLV
      int p = valueStart;
      int messageEnd = valueStart + tlvLength;

      // Step through each record inside this one NDEF message
      while (p < messageEnd) {
        byte header = data[p];
        bool shortRecord = header & 0x10; // SR flag: payload length is 1 byte, not 4
        bool idPresent    = header & 0x08; // IL flag: an ID field is present

        byte typeLength = data[p + 1];
        int offset = p + 2;

        long payloadLength;
        if (shortRecord) {
          payloadLength = data[offset];
          offset += 1;
        } else {
          payloadLength = ((long)data[offset] << 24) | ((long)data[offset + 1] << 16) |
                           ((long)data[offset + 2] << 8) | data[offset + 3];
          offset += 4;
        }

        byte idLength = 0;
        if (idPresent) {
          idLength = data[offset];
          offset += 1;
        }

        byte typeField = data[offset]; // 'T' = 0x54 (Text), 'U' = 0x55 (URI)
        offset += typeLength;
        if (idPresent) offset += idLength; // skip past the ID field, if any

        if (typeField == 0x54) {
          // Found the Text record -- extract it and stop, ignoring any
          // URI or other records elsewhere in the message.
          byte statusByte = data[offset];
          int langCodeLen = statusByte & 0x3F; // low 6 bits = language code length
          int textStart   = offset + 1 + langCodeLen;
          int textLen     = payloadLength - 1 - langCodeLen;

          String text = "";
          for (int j = 0; j < textLen; j++) {
            text += (char)data[textStart + j];
          }
          return text;
        }

        // Not a Text record (e.g. it was a URI record) -- skip its payload
        // and move on to the next record in this same message.
        p = offset + payloadLength;
      }
    }

    i = valueStart + tlvLength; // move to next TLV entry
  }
  return ""; // no Text record found anywhere on the tag
}

// Currently just logs what would be sent. Since your server will likely just
// be appending to a text file, plain text (not JSON) keeps things simple.
// Uncomment the HTTP block once your server endpoint exists.
void sendToServer(String text) {
  Serial.println("[Would send to server] TEXT=" + text);

  /*
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "text/plain");
  int responseCode = http.POST(text);
  Serial.println("Server response code: " + String(responseCode));
  http.end();
  */
}
