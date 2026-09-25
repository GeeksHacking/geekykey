#include <Wire.h>

#define I2C_SDA 7
#define I2C_SCL 6

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(I2C_SDA, I2C_SCL);
  Serial.println("I2C Scanner starting...");
}

void loop() {
  byte count = 0;
  Serial.println("Scanning...");

  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();

    if (error == 0) {
      Serial.print("Found device at address 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
      count++;
    }
  }

  if (count == 0) {
    Serial.println("No I2C devices found. Check wiring/power.");
  } else {
    Serial.println("Done. Found " + String(count) + " device(s).");
  }

  delay(3000);
}
