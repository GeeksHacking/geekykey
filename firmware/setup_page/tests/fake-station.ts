// A station behind a fake navigator.serial, installed into the page before its
// script runs. It answers as geekykey_station.ino's setup mode does: it echoes
// what is typed except the key and the password, prints its prompts without a
// newline, and restarts on "exit". The lines the page waits for come from the
// page's own list (`lines`), which firmware-lines.spec.ts checks against the
// sketch; the other lines are copied from the sketch.
//
// Playwright sends this function into the page as text, so it must not use
// anything from outside its own body.

export interface FakeStationOptions {
  /** The page's list of station lines, from its #station-lines block. */
  lines: Record<string, string>;
  /** False for firmware from before the setup mode, which ignores what is typed. */
  setupMode?: boolean;
  /** Opening the port restarts the board, as the ESP32-S3's native USB port can. */
  restartOnOpen?: boolean;
  /** The station is already sitting at the setup mode's prompt when the page connects. */
  startInSetupMode?: boolean;
  /** A restart drops the USB port, and the board comes back as a new port. */
  dropPortOnRestart?: boolean;
  /** Whether the station joins the Wi-Fi network it is given. */
  wifiJoins?: boolean;
  /** False when the network has no way to the server, as a hotspot whose mobile data ran out. */
  serverAnswers?: boolean;
  /** Keys the server answers 401 for. */
  rejectedKeys?: string[];
  /** Settings the station fails to store, so it answers "Could not store it". */
  storeFails?: Array<"server" | "key" | "wifi">;
  /** Saved taps a move can't send, which the station then asks to clear. */
  tapsLeftAfterSending?: number;
  /** Starts the boot output this long after a restart. */
  bootDelayMs?: number;
  /** Prints the first key prompt this long after "key", as a station that's slow to answer once. */
  keyPromptDelayMs?: number;
  /** Busy and silent this long before it reads what's typed, as in a heartbeat. */
  busyMs?: number;
  /** A second board of the same kind is plugged in when the port comes back. */
  twinBoard?: boolean;
  settings?: {
    server?: string;
    key?: string;
    wifi?: string;
    password?: string;
    savedTaps?: number;
  };
}

export interface FakeStationRecord {
  /** Every whole line the station read, secrets included, in order. */
  received: string[];
  restarts: number;
  /** Everything the station printed, for checks on what the page shows. */
  printed: string;
}

export function installFakeStation(options: FakeStationOptions) {
  const L = options.lines;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const state = {
    server: options.settings?.server ?? "https://key-api.geekshacking.com",
    key: options.settings?.key ?? "gk_sta_oldoldoldoldold0001",
    wifi: options.settings?.wifi ?? "Pixel_4936",
    password: options.settings?.password ?? "hotspotpass",
    savedTaps: options.settings?.savedTaps ?? 0,
    wifiJoined: true,
    serverFromSetup: false,
    keyFromSetup: false,
    wifiFromSetup: false,
  };
  const record: FakeStationRecord = { received: [], restarts: 0, printed: "" };
  (window as unknown as { __station: FakeStationRecord }).__station = record;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const serial = new EventTarget();
  const ports: FakePort[] = [];
  let current: FakePort | null = null;

  // What has been typed but not yet read, and the one reader waiting for a
  // line. A restart empties both, as the board's receive buffer is lost.
  let typed = "";
  let partial = "";
  let lastWasCR = false;
  let waiting: { echo: boolean; resolve: (line: string) => void } | null = null;
  let generation = 0;
  let booting = false;
  let slowedOnce = false;

  class FakePort extends EventTarget {
    readable: ReadableStream<Uint8Array> | null = null;
    writable: WritableStream<Uint8Array> | null = null;
    controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    lost = false;

    async open(openOptions: { baudRate: number }) {
      if (this.lost) throw new DOMException("The device has been lost.", "NetworkError");
      if (this.readable) throw new DOMException("The port is already open.", "InvalidStateError");
      if (openOptions.baudRate !== 115200) throw new Error("The station talks at 115200 baud");
      this.readable = new ReadableStream<Uint8Array>({
        start: (controller) => {
          this.controller = controller;
        },
      });
      this.writable = new WritableStream<Uint8Array>({
        write: (chunk) => {
          typed += decoder.decode(chunk);
          pump();
        },
      });
      // The station prints to whichever port is open, so it keeps this one.
      // oxlint-disable-next-line no-this-alias
      current = this;
      // The board restarts just after the port opens, not during the call. A
      // board already starting up, whose port came back, doesn't restart again.
      if ((options.restartOnOpen ?? true) && !booting) setTimeout(restart, 10);
    }

    async close() {
      this.readable = null;
      this.writable = null;
      this.controller = null;
      if (current === this) current = null;
    }

    async setSignals() {}

    getInfo() {
      return { usbVendorId: 0x303a, usbProductId: 0x1001 };
    }
  }

  function print(text: string) {
    record.printed += text;
    current?.controller?.enqueue(encoder.encode(text));
  }
  function println(text = "") {
    print(text + "\r\n");
  }

  // The sketch's takeSerialLine: Enter is CR, LF or CR LF, and a hidden line
  // prints nothing but the newline.
  function pump() {
    while (waiting && typed.length > 0) {
      const c = typed[0];
      typed = typed.slice(1);
      if (c === "\n" && lastWasCR) {
        lastWasCR = false;
        continue;
      }
      lastWasCR = c === "\r";
      if (c === "\r" || c === "\n") {
        println();
        const line = partial;
        partial = "";
        record.received.push(line);
        const reader = waiting;
        waiting = null;
        reader.resolve(line);
        return;
      }
      partial += c;
      if (waiting.echo) print(c);
    }
  }

  // Resolves with the next line, unless the station restarts first.
  function readLine(echo: boolean): Promise<string> {
    const mine = generation;
    return new Promise((resolve) => {
      waiting = {
        echo,
        resolve: (line) => {
          if (mine === generation) resolve(line);
        },
      };
      pump();
    });
  }

  function masked(key: string) {
    return "gk_sta_..." + key.slice(-4);
  }
  function source(fromSetup: boolean) {
    return fromSetup ? "  (setup mode)" : "  (secrets.h)";
  }
  function printSettings() {
    println("Server:     " + state.server + source(state.serverFromSetup));
    println("Key:        " + masked(state.key) + source(state.keyFromSetup));
    println("Wi-Fi:      " + state.wifi + source(state.wifiFromSetup));
    println(
      "Password:   " +
        (state.password.length > 0 ? "set" : "none, an open network") +
        source(state.wifiFromSetup),
    );
    println("Saved taps: " + state.savedTaps);
  }

  // The heartbeat's own line, as sendHeartbeat prints it, and its HTTP code.
  function heartbeat(): number {
    if (!state.wifiJoined) {
      println("Heartbeat: not sent, no WiFi");
      return 0;
    }
    if (options.serverAnswers === false) {
      println("Heartbeat: no answer, connection refused");
      return -1;
    }
    if ((options.rejectedKeys ?? []).includes(state.key)) {
      println("Heartbeat: HTTP 401");
      return 401;
    }
    println("Heartbeat: clock set to 2026-10-20T01:00:00.000Z");
    return 200;
  }

  function reportHeartbeat() {
    println("Checking with a heartbeat...");
    const code = heartbeat();
    if (code === 200) println(L.heartbeatOk);
    else if (code === 401) println(L.heartbeatRejected);
    else if (code === 0) println(L.heartbeatNotChecked);
    else if (code < 0) println(L.heartbeatNoAnswer);
  }

  function restart() {
    generation += 1;
    record.restarts += 1;
    booting = true;
    typed = "";
    partial = "";
    waiting = null;
    const mine = generation;
    if (options.dropPortOnRestart && current) {
      // The sketch flushes and waits 200 ms before restarting, so what it
      // printed last reaches the page before the port goes.
      const lost = current;
      current = null;
      setTimeout(() => {
        lost.lost = true;
        lost.controller?.error(new DOMException("The device has been lost.", "NetworkError"));
        lost.readable = null;
        lost.writable = null;
        lost.controller = null;
        ports.splice(ports.indexOf(lost), 1);
        setTimeout(() => {
          ports.push(new FakePort());
          if (options.twinBoard) ports.push(new FakePort());
          serial.dispatchEvent(new Event("connect"));
        }, 200);
      }, 200);
    }
    void boot(mine);
  }

  async function boot(mine: number) {
    await sleep(options.bootDelayMs ?? 50);
    // The board starts printing once someone has its port open again.
    for (let i = 0; i < 100 && !current?.controller; i++) await sleep(50);
    if (mine !== generation) return;
    printSettings();
    print("Connecting to WiFi");
    for (let i = 0; i < 3; i++) {
      await sleep(10);
      print(".");
    }
    if (state.wifiJoined) println("\r\n" + L.bootWifiJoined + "10.0.0.5");
    else println("\r\n" + L.bootWifiMissing);
    await sleep(10);
    heartbeat();
    println(L.ready);
    booting = false;
    await runLoop(mine);
  }

  // loop(): only "setup" does anything, and only on firmware that has it.
  async function runLoop(mine: number) {
    if (!(options.setupMode ?? true)) return;
    if (options.busyMs) await sleep(options.busyMs);
    while (mine === generation) {
      const line = (await readLine(true)).trim().toLowerCase();
      if (line === "setup") return runSetupMode(mine);
      if (line.length > 0) {
        println("Type setup and Enter to change the server, the station key or the Wi-Fi network.");
      }
    }
  }

  async function runSetupMode(mine: number, printIntro = true) {
    if (printIntro) {
      println();
      println(L.setupStarted);
      printSettings();
      println("Commands:");
      println("  show    the settings, and where each came from");
      println("  exit    restart with the new settings");
    }
    while (mine === generation) {
      print(L.prompt);
      const command = (await readLine(true)).trim().toLowerCase();
      if (command.length === 0) continue;
      if (command === "show") printSettings();
      else if (command === "server") await setServer();
      else if (command === "key") await replaceKey();
      else if (command === "move") await moveToEvent();
      else if (command === "wifi") await setWifi();
      else if (command === "exit") {
        println(L.restarting);
        restart();
        return;
      } else println(L.unknownCommand);
    }
  }

  function fails(setting: "server" | "key" | "wifi") {
    return (options.storeFails ?? []).includes(setting);
  }

  async function setServer() {
    print(L.serverPrompt);
    const url = (await readLine(true)).trim();
    if (!url.startsWith("https://") && !url.startsWith("http://")) {
      println("The server address must start with https:// or http://");
      println("Not changed.");
      return;
    }
    if (fails("server")) {
      println("Could not store it. Not changed.");
      return;
    }
    state.server = url;
    state.serverFromSetup = true;
    println("Server stored. The " + state.savedTaps + " saved tap(s) are kept.");
    reportHeartbeat();
  }

  async function askForKey(prompt: string) {
    print(prompt);
    const key = (await readLine(false)).trim();
    if (!key.startsWith("gk_sta_") || key.length < 12 || key.includes(" ")) {
      println("That isn't a station key, which starts with gk_sta_. Not changed.");
      return "";
    }
    return key;
  }

  async function replaceKey() {
    if (options.keyPromptDelayMs && !slowedOnce) {
      slowedOnce = true;
      await sleep(options.keyPromptDelayMs);
    }
    const key = await askForKey(L.keyPrompt);
    if (key.length === 0) return;
    if (fails("key")) {
      println("Could not store it. Not changed.");
      return;
    }
    state.key = key;
    state.keyFromSetup = true;
    println("Key stored: " + masked(key) + ". The " + state.savedTaps + L.keyStored);
    reportHeartbeat();
  }

  async function moveToEvent() {
    const key = await askForKey(L.movePrompt);
    if (key.length === 0) return;
    if (state.savedTaps > 0) {
      println("Sending the " + state.savedTaps + " saved tap(s) with the old key...");
      state.savedTaps = options.tapsLeftAfterSending ?? 0;
      if (state.savedTaps === 0) {
        println("All saved taps sent.");
      } else {
        println(state.savedTaps + L.stillSaved + "no Wi-Fi).");
        print(L.clearPrompt);
        const answer = (await readLine(true)).trim();
        if (answer !== "clear") {
          println(L.cancelled);
          return;
        }
        state.savedTaps = 0;
        println("Saved taps cleared.");
      }
    }
    if (fails("key")) {
      println("Could not store the key. It's still the old one.");
      return;
    }
    state.key = key;
    state.keyFromSetup = true;
    println("Key stored: " + masked(key) + L.moveStored);
    reportHeartbeat();
  }

  async function setWifi() {
    print(L.wifiNamePrompt);
    const ssid = await readLine(true);
    if (ssid.length === 0 || ssid.length > 32) {
      println("A Wi-Fi name is 1 to 32 characters. Not changed.");
      return;
    }
    print(L.wifiPasswordPrompt);
    const pass = await readLine(false);
    if (fails("wifi")) {
      println("Could not store it. Type wifi to try again.");
      return;
    }
    state.wifi = ssid;
    state.password = pass;
    state.wifiFromSetup = true;
    println(L.wifiStored + ssid + " for up to 20 seconds...");
    state.wifiJoined = options.wifiJoins ?? true;
    if (state.wifiJoined) println(L.wifiJoined + ssid + ", IP 10.0.0.7.");
    else
      println(
        L.wifiNotJoined + ssid + ". It's kept, and the station tries it again after it restarts.",
      );
  }

  const first = new FakePort();
  ports.push(first);
  Object.assign(serial, {
    requestPort: async () => ports[0],
    getPorts: async () => [...ports],
  });
  Object.defineProperty(Navigator.prototype, "serial", { get: () => serial, configurable: true });

  // The station has been running since before the page opened.
  if (options.startInSetupMode) void runSetupMode(generation, false);
  else void runLoop(generation);
}
