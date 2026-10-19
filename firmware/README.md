# Firmware

The code that runs on the GeekyKey stations and the tools around them.

| Folder | What it is |
|---|---|
| `geekykey_station/` | The station: reads a token's UID and sends the tap to the server |
| `token_writer/` | Writes the token page's address onto new tokens, on a spare station before an event |
| `NFC_test/`, `LCD_test/` | Small sketches for checking the RC522 and the screen |

How the station talks to the server is in [the API agreement](../apps/API-AGREEMENT.md), sections
6.1 and 6.2.

## Flashing a station

1. Copy `geekykey_station/secrets.example.h` to `geekykey_station/secrets.h` and fill it in. It's
   gitignored, so the key never reaches the repo.
2. In the Arduino IDE, pick the board and set **USB CDC On Boot** to **Enabled**. Without it, the
   ESP32-S3 prints nothing on its USB port and the setup mode can't hear you.
3. Upload.

`secrets.h` only gives the first settings. After that, the setup mode changes them.

## The setup mode

The setup mode gives a station a new server address, station key or Wi-Fi network without a
reflash. Use it when a station moves to a new venue or another event, when an organizer replaces
its key on the station board, or when the server address changes.

### Getting in

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
