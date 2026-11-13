# Firmware

The code that runs on the GeekyKey stations and the tools around them.

| Folder | What it is |
|---|---|
| `geekykey_station/` | The station: reads a token's UID and sends the tap to the server |
| `token_writer/` | Writes the token page's address and the token's kind onto new tokens, on a spare station before an event |
| `setup_page/` | The setup page: a browser page that sets up a station over USB, without a terminal |
| `NFC_test/`, `LCD_test/` | Small sketches for checking the RC522 and the screen |

How the station talks to the server is in [the API agreement](../apps/API-AGREEMENT.md), sections
6.1, 6.2 and 6.3.

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

### The server address

The server setting is a base URL: `https://key-api.geekshacking.com` in production, or
`http://your-laptop.local:8000` for the GeekyKey Service running on a laptop
([docs/getting-started.md](../docs/getting-started.md)). The station checks an `https://` address
against the root certificates in `geekykey_station/ca_roots.h`. A plain `http://` address is for
local development only: the station sends its key without encryption, so it allows `http://` only
for a host ending in `.local`, on the network it is on. For a laptop, put the station on the same
network and give it a throwaway key from `mise run seed`, never a production key.

## Testing the station's timing rules

The station's rules about time are in `geekykey_station/tap_timing.h`: when the buzzer is on during
a result's sound, when the result's LED is on, which blinks for a finished game, and how a token
tapped again a moment later is answered without a request. They touch no pins, so their tests run
on a laptop with any C++ compiler, from the repo root:

```sh
c++ -std=c++17 -Wall -Wextra -o /tmp/tap_timing_test firmware/geekykey_station/test/tap_timing_test.cpp && /tmp/tap_timing_test
```

It prints `All passed`, or each check that failed. The Arduino IDE never builds the `test/` folder,
so nothing in it reaches a station.

What the screen shows between taps is in `geekykey_station/station_screen.h`. A tap's answer can
start a countdown (section 6.1 of the API agreement), and the file works out the seconds left and
puts them in place of `{s}`. It decides which screen shows when a result and a countdown overlap. It
also picks the idle screen from a heartbeat's answer (section 6.2) and the WiFi state. Its tests
run the same way:

```sh
c++ -std=c++17 -Wall -Wextra -o /tmp/station_screen_test firmware/geekykey_station/test/station_screen_test.cpp && /tmp/station_screen_test
```

## Station messages over a WebSocket

After a heartbeat sets the clock, the station opens one WebSocket to
`/api/v1/stations/socket` on the same server, with the same station key. This is optional:
taps and heartbeats keep using HTTP, and work while the socket is down or reconnecting. With a server
that has no socket endpoint, the station works as before. The server drops any message sent while
the socket is down.

A station message gives one or two screen lines, an optional countdown, and an optional attention
beep. The firmware knows no games. It shows the message as a result, with one short beep if asked,
and leaves the LED alone. A local tap's answer owns its first 2 seconds. A message that arrives then
waits, with only the newest kept, and its countdown still counts from its arrival. After that window,
a new message replaces the screen and any countdown, including one from a tap. A local tap's
answer replaces a message. No WiFi, setup errors and reader errors come first.

The socket checks the server's certificate against `ca_roots.h`, as HTTPS does. Plain WebSockets are
allowed only for an `http://` server whose host ends in `.local`. It follows no redirects and
never prints the key. It sends text `ping` every 30 seconds and expects text `pong` within 15
seconds. On a drop or a failed upgrade it retries after 5, 10, 20, 40, then 60 seconds, staying at
60 until an upgrade succeeds. A 401 shows the same setup error as a tap's 401 and retries after 60
seconds. Close code 4000 means a newer connection replaced this one, and the station waits as usual.

The socket has its own clients and a FreeRTOS task on core 0, so a TLS handshake never runs on the
reader's loop. A one-slot queue passes the newest valid message to the screen. There is no extra
Arduino library: the TLS is the ESP32 core's, as for HTTPS, and the station's own code only reads
and writes the frames. It joins a text message split over several frames, refuses a message over
2 KB and binary messages, and answers pings and closes. Serial output gives reasons for ignored messages
without printing their payload, plus free heap on each open and the task's stack headroom once
after its first successful upgrade. Check both on the classic ESP32 with HTTP and the socket open.

The wire rules and message validation have laptop tests, with no Arduino headers or libraries:

```sh
c++ -std=c++17 -Wall -Wextra -o /tmp/station_socket_test firmware/geekykey_station/test/station_socket_test.cpp && /tmp/station_socket_test
c++ -std=c++17 -Wall -Wextra -o /tmp/station_message_test firmware/geekykey_station/test/station_message_test.cpp && /tmp/station_message_test
```

Both print `All passed` on success. The screen tests above also cover messages waiting for taps,
newer messages replacing older ones, countdowns that keep counting while hidden, and the station's
own screens taking priority. The timing tests cover the attention beep.

## Writing tokens

`token_writer/` turns a spare ESP32-S3 station into a token writer. It writes each NTAG213 token's
address, `https://key.geekshacking.com/t/<UID>?k=<kind>`, and protects it with a password. The
chip fills in its own UID each time a phone reads it, so every token in a batch gets the same
bytes. The kind is one letter, such as `E`, and a phone that opens the address shows that kind's
token page ([ADR 0006](../docs/adr/0006-a-token-carries-its-kind.md)).

1. Copy `token_writer/secrets.example.h` to `token_writer/secrets.h` and put in the write password.
   Every token written with one password can only be rewritten with that password, so keep a copy
   with Adam outside the repo. For uploads, fill in `WIFI_SSID`, `WIFI_PASSWORD`, `SERVER_URL` and
   `WRITER_KEY` in this same file. Adam makes the writer key (`gk_wri_` and 64 lower-case hex digits);
   the Worker keeps only its hash. It is a writer key, separate from a station key.
   Use a 2.4 GHz WiFi network with a password and no sign-in page. Leaving the WiFi settings or key
   empty or at their placeholders turns uploads off; writing and the serial log still work.
   `SERVER_URL` is a full base URL, such as `https://key-api.geekshacking.com`. HTTPS checks the
   certificates in `token_writer/ca_roots.h`. Plain HTTP is allowed only to a `.local` host found
   through mDNS, such as `http://your-laptop.local:8000`, on the same network. Use a throwaway
   writer key there: HTTP sends it without encryption.
2. Flash `token_writer/` to the station with the same board settings as the station itself.
   Flashing the station again later brings it back, with its setup-mode settings kept. The writer
   uses only its own `secrets.h`; it never reads or writes the station's saved settings.
3. Open the Serial Monitor at 115200 baud. Opening it restarts the S3, so open it before you start.
   Keep it open for the whole batch, because the log in step 5 comes only through it.
4. Type `kind E`, with the batch's letter in place of `E`. The letter can be upper or lower case,
   and the writer always writes a capital. The screen shows `Tap: kind E`. The writer writes
   nothing until a kind is set, and forgets it at every restart, so it never reuses an earlier
   batch's kind. Type `kind` again with another letter to start the next batch.
5. Tap a token, take it away when the screen says so, and tap it again to check it. The screen
   shows `OK kind E` or `FAIL` with the reason. Each token written prints a line such as
   `04E45150324189,E`, its UID and its kind, before the check, and queues the same write for upload.
   A failed check still uploads that write, because the token already carries its new address.
   The result shows `wait` while queued and `sent` when uploaded, and updates while the token is
   still on the reader. `full` means the queue had no room, `err` means the upload was rejected,
   and `off` means uploads are off. A `FAIL` reason too long for a suffix takes turns with `Upload: wait` or `Upload: sent`.
6. Between tokens, the second line shows `All uploaded`, how many are waiting, `No WiFi` with the
   waiting count, or `Uploads off`. Wait for `All uploaded` before unplugging. The queue holds
   256 writes in RAM only; unplugging or restarting loses everything still waiting. A token
   written while the queue is full still writes and logs normally, but needs the backup path below.

WiFi joins and reconnects in the background, so losing it never stops writing. The writer sends
FIFO batches of up to 50 writes. After a failed upload it retries after 5, 10, 20, 40, then 60
seconds, and stays at 60 until one succeeds. Serial reports the reason and waiting count, and
prints `Uploaded <UID> kind E` for each accepted write. A 401 retries every 60 seconds: check the
writer key and the Worker's secret with Adam. The Worker secret can be fixed without reflashing
the writer. A 400 means a firmware bug: that batch is rejected rather than retried forever, and
Serial lists the affected UIDs. Writes still waiting after seven days also need the backup path.
`Check serial log` (or a waiting count with `paste!`) means some writes need that path even after
the queue drains. This warning stays until restart.

Keep the Serial Monitor log as the backup when uploads fail or are off. Copy the `<UID>,<kind>`
lines for the tokens that didn't upload, and load them at
`https://key.geekshacking.com/admin/token-kinds`, which needs a GeekyKey admin's login. A writer's
NTAG213 line has 14 capital hex digits, a comma and one capital letter. Upload messages and the
writer's other text aren't part of the list. The screen reads only UID/kind lines, so Serial
Monitor text can be pasted as it is. Check the tokens per kind and any lines it flags, then press
Load. One load takes up to 500 tokens, so split a longer log. For a rewritten UID, use its latest
line. Keep the full log until every written token is on the server's list.

After a `FAIL` other than `AUTH` or `PASSWORD`, tap the same token again until it shows `OK`. A
failed check can leave the token written, and writing it again prints its line again.

The writer rewrites a token that was written before in the same way, with the new kind. Its new
line comes later in the log than the old one, so where a UID shows up twice, the later line is the
kind it carries. The writer tries the password once per tap, and every wrong try counts towards
the chip's limit of 7. After a `FAIL AUTH` or `FAIL PASSWORD`, check `secrets.h` before tapping
again.

`token_writer/token_address.h` builds the address and the log line, and touches no pins. Its tests
run on a laptop, from the repo root:

```sh
c++ -std=c++17 -Wall -Wextra -o /tmp/token_address_test firmware/token_writer/test/token_address_test.cpp && /tmp/token_address_test
```

The upload queue, retry timing, JSON body and screen/serial text also touch no pins:

```sh
c++ -std=c++17 -Wall -Wextra -o /tmp/token_upload_test firmware/token_writer/test/token_upload_test.cpp && /tmp/token_upload_test
```

Both tests print `All passed`. They don't open a serial port. To refresh the trusted certificates,
follow the commands at the top of `geekykey_station/make_ca_roots.py` from that folder; the script
writes both the station's and writer's `ca_roots.h` copies.

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
3. Opening the port may restart the station. Wait until it prints `Connecting to WiFi`. You don't
   need to wait for `Ready`, so a station that can't join its Wi-Fi can be given another one
   straight away.
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
