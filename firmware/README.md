# Firmware

The code that runs on the GeekyKey stations and the tools around them.

| Folder | What it is |
|---|---|
| `geekykey_station/` | The station: reads a token's UID and sends the tap to the server |
| `token_writer/` | Writes the token page's address onto new tokens, on a spare station before an event |
| `setup_page/` | The setup page: a browser page that sets up a station over USB, without a terminal |
| `NFC_test/`, `LCD_test/` | Small sketches for checking the RC522 and the screen |

How the station talks to the server is in [the API agreement](../apps/API-AGREEMENT.md), sections
6.1 and 6.2.

## Flashing a station

1. Copy `geekykey_station/secrets.example.h` to `geekykey_station/secrets.h` and fill it in. It's
   gitignored, so the key never reaches the repo.
2. In the Arduino IDE, pick the board. The sketch picks its pins from that board, and the wiring for
   each is at the top of `geekykey_station.ino`.
   - For an ESP32-S3, pick **ESP32S3 Dev Module** and set **USB CDC On Boot** to **Enabled**.
     Without it, the S3 prints nothing on its USB port and the setup mode can't hear you. Also set
     **Partition Scheme** to **Huge APP (3MB No OTA/1MB SPIFFS)**. The default scheme leaves the
     sketch 1.25 MB, and it already uses 1.14 MB. The station is updated over USB, never over the
     air, so it doesn't need the default's second copy of the app. Both schemes keep the settings and
     saved taps in the same place, so a reflash with either keeps them. With `arduino-cli`, the
     board is `esp32:esp32:esp32s3:CDCOnBoot=cdc,PartitionScheme=huge_app`.
   - For a classic ESP32 on a DOIT DevKit V1, pick **DOIT ESP32 DEVKIT V1**. It needs no USB CDC
     setting, because its USB port goes through a separate USB-to-serial chip. Opening that port
     restarts the station.
3. Upload.

`secrets.h` only gives the first settings. After that, the setup mode changes them.

## Testing the station's timing rules

The station's rules about time are in `geekykey_station/tap_timing.h`: when the buzzer is on during
a result's sound, and how a token tapped again a moment later is answered without a request. They
touch no pins, so their tests run on a laptop with any C++ compiler, from the repo root:

```sh
c++ -std=c++17 -Wall -Wextra -o /tmp/tap_timing_test firmware/geekykey_station/test/tap_timing_test.cpp && /tmp/tap_timing_test
```

It prints `All passed`, or each check that failed. The Arduino IDE never builds the `test/` folder,
so nothing in it reaches a station.

## The setup mode

The setup mode gives a station a new server address, station key or Wi-Fi network without a
reflash. Use it when a station moves to a new venue or another event, when an organizer replaces
its key on the station board, or when the server address changes.

There are two ways in: the setup page, for anyone who'd rather not use a terminal, or a serial
terminal.

### The setup page

`setup_page/setup_page.html` is one file that does everything below from a form. It types what
you would type, so the station needs nothing extra.

1. Get the file: download it from this folder on GitHub (the download button on the file's page),
   or have someone send it to you. It doesn't need a web server or a sign-in.
2. Open it in Chrome or Edge on a laptop. Safari and Firefox can't open a USB port.
3. Plug the station in, press **Connect** and pick its port. If the station prints nothing, close
   the Arduino IDE's Serial Monitor: only one program can hold the port.
4. Fill in only what changes, and press **Set up the station**.

The page puts the station into setup mode and shows its settings. Then it sends the changes in this
order: a move, the Wi-Fi network, the server, a replaced key. It stops at the first one the station
refuses, and says why. At the end it restarts the station and reports what the start-up showed:
whether it joined the Wi-Fi network, and whether the server accepted its heartbeat. Everything the
station printed is under **What the station printed**.

For a key, you have to pick whether it's a replaced key or a move to another event (see below). If a
move can't send all the saved taps, the page asks whether to drop them. It never drops them on its
own.

The key and the Wi-Fi password never show on the page, and the page keeps neither. They go to the
station and nowhere else.

The page matches the station's lines word for word. If you reword a line the setup mode or the
start-up prints, update the list at the bottom of `setup_page.html`. Its tests
(`pnpm test:setup-page`) fail until you do.

### Getting in, from a terminal

1. Plug the station into a laptop with a USB cable.
2. Open a serial terminal at 115200 baud:
   - **Arduino IDE:** Tools, Serial Monitor. Set the line ending to **Newline** (any setting except
     "No line ending" works).
   - **macOS terminal:** `screen /dev/cu.usbmodem* 115200`. To leave `screen`, press Ctrl-A, then
     K, then Y.
3. Opening the port may restart the station. Wait until it prints `Ready`.
4. Type `setup` and press Enter.

The screen shows `Setup mode` / `Use USB serial`. The station takes no taps and sends no heartbeats
until it restarts, so after 2 minutes the station board shows it as offline. That's expected.

### Commands

Each command asks for what it needs, one line at a time.

| Command | What it does |
|---|---|
| `show` | Prints the settings, and whether each came from the setup mode or `secrets.h` |
| `server` | A new server address, such as `https://key-api.geekshacking.com` |
| `key` | A replaced key for this same station. Its saved taps are kept and go out with the new key |
| `move` | A key from another event. Its saved taps are sent first, and any left are cleared |
| `wifi` | A new Wi-Fi network name and password |
| `reset` | Forgets everything the setup mode stored, so `secrets.h` applies again |
| `exit` | Restarts the station with the new settings |

After `server`, `key` or `move`, the station sends one heartbeat and tells you how it went:

- `OK`: the server knows the key, and the station is ready.
- `Key rejected (401)`: the server doesn't know the key, or an organizer disabled the station.
- `No answer`: the server couldn't be reached.

The station restarts on `exit`, or by itself after 5 minutes with nothing typed, and prints its
settings again as it starts. If the terminal goes quiet instead, open the port again.

### A replaced key, or a move to another event

Both give the station a new key, but they aren't the same thing:

- **`key`** is for when an organizer replaced this station's key on the station board. It's still
  the same station, so its saved taps are kept and count once they're sent with the new key.
- **`move`** is for when the station hardware goes to another event, where it becomes a new
  station with that event's key. The station first sends its saved taps with the old key. If some
  can't be sent, it says how many and why, and drops them only if you type `clear`. Anything else
  cancels, and nothing changes. This way, no tap from one event ever reaches another.

`reset` goes back to the key in `secrets.h`. If that's a different key, it handles the saved taps
as `move` does.

### Wi-Fi

`wifi` tries the new network for up to 20 seconds and says whether it joined. It keeps the network
either way, so you can set up a station the night before for a venue that isn't in range yet.

- Leave the password empty for an open network. Otherwise it's 8 to 63 characters.
- The ESP32 only joins 2.4 GHz networks.
- A network with a "log in to continue" page doesn't work. The station can't get past it.

### What the station keeps, and for how long

What the setup mode stores stays across restarts and **wins over `secrets.h`, even after a
reflash**, because an upload doesn't erase it. So if you reflash with a new `secrets.h` and nothing
changes, type `setup`, then `reset`. Every start-up prints each setting with `(setup mode)` or
`(secrets.h)` beside it.

The key is never printed in full: only `gk_sta_...` and its last 4 characters. The Wi-Fi
password is never printed, and neither is shown as you type it.

### Who can change a station

Anyone with a USB cable and a terminal can use the setup mode, and there's no password. They could
point a station at their own server and collect its key. A password wouldn't stop that: the same
person can already read the key out of the board's flash. A station pointed elsewhere stops
reaching our server, and the station board shows it as offline within 2 minutes. If a station
goes offline when it shouldn't, check it. If it was tampered with, replace its key on the station
board and give it the new one with `key`.
