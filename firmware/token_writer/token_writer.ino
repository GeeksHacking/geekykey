/*
  GeekyKey token writer  (NTAG213 only)
  Board: ESP32S3 Dev Module + RC522.   Run on a spare station before the event.

  Every token is written identically with:
    https://key.geekshacking.com/t/<14 placeholder zeros>
  and the chip's UID mirror swaps in the token's own UID each time it is read.
  Writes are protected by one password (secrets.h). Reads are open.

  NEVER set CFGLCK (ACCESS bit 6) and never touch the lock bytes on pages 02h/28h.
  Never turn on the read counter (NFC_CNT_EN).
  Datasheet: NXP NTAG213/215/216 Rev. 3.2, sections 8.5.7 and 8.7.

  Libraries: "MFRC522" (miguelbalboa, 1.4.x), "LiquidCrystal I2C" (Frank de Brabander).
*/

#include <SPI.h>
#include <Wire.h>
#include <MFRC522.h>
#include <LiquidCrystal_I2C.h>
#include "secrets.h"   // NTAG_PASSWORD[4], NTAG_PACK[2]  (gitignored, see secrets.h.example)

// ---- Wiring: change these to match the station ------------------------------
constexpr int     PIN_SCK  = 12;   // ESP32-S3 default FSPI pins
constexpr int     PIN_MISO = 13;
constexpr int     PIN_MOSI = 11;
constexpr int     PIN_SS   = 10;
constexpr int     PIN_RST  = 9;
constexpr int     PIN_SDA  = 7;    // LCD I2C
constexpr int     PIN_SCL  = 6;
constexpr uint8_t LCD_ADDR = 0x27;
constexpr uint8_t LCD_COLS = 16;
constexpr uint8_t LCD_ROWS = 2;
// ------------------------------------------------------------------------------

MFRC522 mfrc522(PIN_SS, PIN_RST);
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);

// ---- What goes on the token --------------------------------------------------
constexpr uint8_t FIRST_PAGE = 0x04;
constexpr uint8_t LAST_PAGE  = 0x11;
constexpr size_t  AREA_LEN   = (LAST_PAGE - FIRST_PAGE + 1) * 4;   // 56 bytes

// bytes 0-11: lock control TLV (as delivered), NDEF TLV, record header, "https://"
static const uint8_t NDEF_HEAD[] = {
  0x01, 0x03, 0xA0, 0x0C, 0x34,   // lock control TLV, kept as delivered
  0x03, 0x2A,                     // NDEF message, 42 bytes
  0xD1, 0x01, 0x26, 0x55,         // one record, type "U", payload 38 bytes
  0x04                            // "https://"
};
static const char URL_TAIL[] = "key.geekshacking.com/t/";   // 23 characters
constexpr size_t  UID_CHARS  = 14;
constexpr size_t  MIRROR_OFFSET = sizeof(NDEF_HEAD) + (sizeof(URL_TAIL) - 1);   // 35

static_assert(sizeof(NDEF_HEAD) == 12, "head must be 12 bytes");
static_assert(sizeof(URL_TAIL) - 1 == 23, "URL tail must be 23 characters");
static_assert(0x26 == 1 + (sizeof(URL_TAIL) - 1) + UID_CHARS, "record payload length");
static_assert(0x2A == 4 + 0x26, "NDEF message length");
static_assert(MIRROR_OFFSET == 35, "mirror starts at byte 3 of page 0Ch");
// The rest of page 11h stays 00, which also clears what an older, longer address left behind.
static_assert(MIRROR_OFFSET + UID_CHARS + 1 <= AREA_LEN, "FE must fit before page 12h");

constexpr uint8_t MIRROR_PAGE = FIRST_PAGE + MIRROR_OFFSET / 4;   // 0Ch
constexpr uint8_t MIRROR_BYTE = MIRROR_OFFSET % 4;                // 3

// ---- NTAG213 configuration pages ---------------------------------------------
constexpr uint8_t PAGE_CC     = 0x03;
constexpr uint8_t PAGE_CONFIG = 0x29;   // MIRROR, RFUI, MIRROR_PAGE, AUTH0
constexpr uint8_t PAGE_ACCESS = 0x2A;
constexpr uint8_t PAGE_PWD    = 0x2B;
constexpr uint8_t PAGE_PACK   = 0x2C;
constexpr uint8_t AUTH0_FRESH = 0xFF;
constexpr uint8_t AUTH0_ON    = 0x04;   // protect writes from page 04h onwards
constexpr uint8_t ACCESS_VAL  = 0x07;   // write-protect only, CFGLCK off, counter off, 7 tries
// UID ASCII mirror (bits 7-6 = 01), starting at MIRROR_BYTE (bits 5-4), strong modulation on (bit 2).
constexpr uint8_t MIRROR_UID_STRONG = 0x40 | (MIRROR_BYTE << 4) | 0x04;   // 74h

// -----------------------------------------------------------------------------

static char errBuf[17];

static void showLines(const char* l1, const char* l2 = "") {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(l1);
  lcd.setCursor(0, 1); lcd.print(l2);
}

// Keep identical to the station's uidToHex (upper-case hex, no separators).
String uidToHex(const MFRC522::Uid &uid) {
  String s;
  s.reserve(uid.size * 2);
  for (byte i = 0; i < uid.size; i++) {
    if (uid.uidByte[i] < 0x10) s += '0';
    s += String(uid.uidByte[i], HEX);
  }
  s.toUpperCase();
  return s;
}

static void buildNdef(uint8_t out[AREA_LEN]) {
  memset(out, 0, AREA_LEN);
  memcpy(out, NDEF_HEAD, sizeof(NDEF_HEAD));
  memcpy(out + sizeof(NDEF_HEAD), URL_TAIL, sizeof(URL_TAIL) - 1);
  memset(out + MIRROR_OFFSET, '0', UID_CHARS);
  out[MIRROR_OFFSET + UID_CHARS]     = 0xFE;   // end
  out[MIRROR_OFFSET + UID_CHARS + 1] = 0x00;   // padding
}

// Reads 4 pages (16 bytes) starting at firstPage.
static bool readPages(uint8_t firstPage, uint8_t out[16]) {
  uint8_t buf[18];
  uint8_t size = sizeof(buf);
  if (mfrc522.MIFARE_Read(firstPage, buf, &size) != MFRC522::STATUS_OK) return false;
  memcpy(out, buf, 16);
  return true;
}

static bool writePage(uint8_t page, const uint8_t data[4]) {
  uint8_t tmp[4];
  memcpy(tmp, data, 4);
  return mfrc522.MIFARE_Ultralight_Write(page, tmp, 4) == MFRC522::STATUS_OK;
}

// One attempt only. Every wrong password counts towards the chip's limit of 7.
static bool authenticate() {
  uint8_t pw[4], pack[2] = {0, 0};
  memcpy(pw, NTAG_PASSWORD, 4);
  if (mfrc522.PCD_NTAG216_AUTH(pw, pack) != MFRC522::STATUS_OK) return false;
  return pack[0] == NTAG_PACK[0] && pack[1] == NTAG_PACK[1];
}

static const char* failPage(const char* what, uint8_t page) {
  snprintf(errBuf, sizeof(errBuf), "%s %02X", what, page);
  return errBuf;
}

static bool waitForToken(uint32_t timeoutMs) {
  uint32_t start = millis();
  do {
    if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) return true;
    delay(30);
  } while (timeoutMs == 0 || millis() - start < timeoutMs);
  return false;
}

static void waitForRemoval() {
  mfrc522.PICC_HaltA();
  uint8_t misses = 0;
  while (misses < 5) {
    byte atqa[2];
    byte size = sizeof(atqa);
    if (mfrc522.PICC_WakeupA(atqa, &size) == MFRC522::STATUS_OK) {
      misses = 0;
      mfrc522.PICC_HaltA();
    } else {
      misses++;
    }
    delay(100);
  }
}

// Steps 1-5. Returns nullptr on success, or a short reason (max 11 characters).
static const char* writeToken() {
  uint8_t page[16];

  if (mfrc522.uid.size != 7) return "UID SIZE";

  // Must be an NTAG213: capability container says 144 bytes (0x12).
  if (!readPages(PAGE_CC, page)) return "READ CC";
  if (page[0] != 0xE1 || page[2] != 0x12) return "NOT NTAG213";

  // Step 1: was it written before? Reading is never protected.
  if (!readPages(PAGE_CONFIG, page)) return "READ CONFIG";
  if (page[4] & 0x40) return "CFG LOCKED";           // CFGLCK already set, ACCESS can't change
  if (page[3] != AUTH0_FRESH) {
    Serial.println("Token was written before, authenticating (one try only)");
    if (!authenticate()) return "AUTH";
  }

  // Step 2: the address, pages 04h-11h.
  uint8_t area[AREA_LEN];
  buildNdef(area);
  for (uint8_t p = FIRST_PAGE; p <= LAST_PAGE; p++) {
    if (!writePage(p, &area[(p - FIRST_PAGE) * 4])) return failPage("WRITE", p);
  }

  // Step 3: password first, before protection is switched on.
  uint8_t pwdPage[4], packPage[4] = {NTAG_PACK[0], NTAG_PACK[1], 0x00, 0x00};
  memcpy(pwdPage, NTAG_PASSWORD, 4);
  if (!writePage(PAGE_PWD,  pwdPage))  return failPage("WRITE", PAGE_PWD);
  if (!writePage(PAGE_PACK, packPage)) return failPage("WRITE", PAGE_PACK);

  // Step 4: ACCESS.
  const uint8_t access[4] = {ACCESS_VAL, 0x00, 0x00, 0x00};
  if (!writePage(PAGE_ACCESS, access)) return failPage("WRITE", PAGE_ACCESS);

  // Step 5: config page last. Keep the reserved bits as they were.
  if (!readPages(PAGE_CONFIG, page)) return "READ CONFIG";
  const uint8_t cfg[4] = {
    (uint8_t)((page[0] & 0x0B) | MIRROR_UID_STRONG),   // keep RFUI bits 3,1,0
    page[1],
    MIRROR_PAGE,
    AUTH0_ON
  };
  if (!writePage(PAGE_CONFIG, cfg)) return failPage("WRITE", PAGE_CONFIG);

  return nullptr;
}

// Step 6. Token must be taken away and tapped again. nullptr = OK.
static const char* verifyToken(const String &expectedUid) {
  showLines("Remove token", expectedUid.c_str());
  waitForRemoval();
  showLines("Tap same token", "to check it");
  if (!waitForToken(30000)) return "NO RETAP";
  if (uidToHex(mfrc522.uid) != expectedUid) return "OTHER TOKEN";

  // The address must be the template, ending in this token's own UID.
  uint8_t expected[AREA_LEN], got[64];
  buildNdef(expected);
  for (uint8_t i = 0; i < 4; i++) {
    if (!readPages(FIRST_PAGE + i * 4, &got[i * 16])) return "READ";
  }
  if (memcmp(got, expected, MIRROR_OFFSET) != 0) return "ADDRESS";
  if (memcmp(got + MIRROR_OFFSET, expectedUid.c_str(), UID_CHARS) != 0) return "UID MIRROR";
  if (got[MIRROR_OFFSET + UID_CHARS] != 0xFE) return "ADDRESS END";

  // The protection settings.
  uint8_t cfg[16];
  if (!readPages(PAGE_CONFIG, cfg)) return "READ CONFIG";
  if (cfg[3] != AUTH0_ON || cfg[2] != MIRROR_PAGE || (cfg[0] & 0xF4) != MIRROR_UID_STRONG) return "CONFIG";
  if (cfg[4] != ACCESS_VAL) return "ACCESS";

  // Prove the password really works, so the token can be rewritten later.
  if (!authenticate()) return "PASSWORD";
  return nullptr;
}

static bool secretsLookUnset() {
  bool allFF = true, all00 = true;
  for (uint8_t i = 0; i < 4; i++) {
    if (NTAG_PASSWORD[i] != 0xFF) allFF = false;
    if (NTAG_PASSWORD[i] != 0x00) all00 = false;
  }
  return allFF || all00;   // FF FF FF FF is the chip's factory value
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Wire.begin(PIN_SDA, PIN_SCL);
  lcd.init();
  lcd.backlight();

  if (secretsLookUnset()) {
    showLines("Set secrets.h", "then reflash");
    Serial.println("secrets.h still has the placeholder password. Stopping.");
    while (true) delay(1000);
  }

  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_SS);
  mfrc522.PCD_Init();
  Serial.println("GeekyKey token writer ready");
}

void loop() {
  showLines("Tap a token", "to write it");
  waitForToken(0);

  String uid = uidToHex(mfrc522.uid);
  Serial.print("Token UID: "); Serial.println(uid);
  showLines("Writing...", uid.c_str());

  const char* err = writeToken();
  if (!err) err = verifyToken(uid);

  char line1[17];
  if (err) {
    snprintf(line1, sizeof(line1), "FAIL %s", err);
    Serial.print("FAIL: "); Serial.println(err);
    if (!strcmp(err, "AUTH") || !strcmp(err, "PASSWORD")) {
      Serial.println("Don't keep re-tapping: every wrong password counts towards the chip's limit of 7.");
    }
  } else {
    snprintf(line1, sizeof(line1), "OK");
    Serial.print("OK  https://key.geekshacking.com/t/"); Serial.println(uid);
  }
  showLines(line1, uid.c_str());

  waitForRemoval();
  delay(1500);
}
