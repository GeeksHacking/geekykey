# GeekyKey

NFC stamp-collection system for hackathons. Participants tap a physical token at ESP32
reader stations, collect stamps and points, and see them on a mobile web dashboard.
Organisers watch the event from a console.

This is a pnpm monorepo:

| Package | What it is |
|---|---|
| `apps/frontend` | React single-page app for participants and organisers |
| `apps/backend` | Hono on Deno event service with an SQLite database |
| `apps/API-AGREEMENT.md` | The contract between the two, and the ESP32 stations |

## Running the frontend

The frontend currently runs against **mock data** shaped like the API agreement, so you
do not need the backend, Deno, or a database to work on it.

### 1. Install the tools

The repo pins Node, pnpm, and Deno in `.mise.toml`, and [mise](https://mise.jdx.dev)
installs exactly those versions for you.

```bash
brew install mise        # macOS. Other platforms: https://mise.jdx.dev/getting-started.html
cd geekykey
mise install             # downloads the pinned Node, pnpm, and Deno
mise tasks               # sanity check: lists the tasks used below
```

Optionally, add mise to your shell so plain `node`, `pnpm`, and `deno` pick up the
pinned versions everywhere. For zsh:

```bash
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
```

You can skip that step. Every command in this guide is written as `mise run <task>`,
which works without shell activation.

mise is the only supported setup. Do not install pnpm through Corepack: this repo pins
pnpm 12, which ships as a native binary that Corepack cannot launch.

### 2. Install dependencies

```bash
mise run install
```

This installs every workspace package and can be run from any folder in the repo. You should see pnpm run an install script for
`esbuild`; that is expected and already approved in `pnpm-workspace.yaml`. If pnpm ever
prints "Ignored build scripts" instead, run `pnpm approve-builds esbuild` once from the
repo root and install again.

### 3. Start the dev server

```bash
mise run dev:frontend
```

Open [http://localhost:5173](http://localhost:5173). Edits under `apps/frontend/src`
reload in place.

### 4. Sign in

The portal sign-in is not wired yet. Use a seeded account from the form on the login page:

| Account | Role | What you get |
|---|---|---|
| Alex Tan | Participant | Dashboard, passport, activity, token pairing |
| Priya Raman | Organiser | Stations, scan log, QR fallback, summary |

The mock session survives a reload but not a new tab. A station simulator keeps adding
taps in the background, so the scan log and station board change while you watch.

### Other commands

These work from any folder in the repo:

```bash
mise run test:frontend     # unit tests (Vitest)
mise run build:frontend    # typecheck, then production build to apps/frontend/dist
mise tasks                 # everything else mise knows about, backend included
```

For the rest, `cd apps/frontend` first:

```bash
pnpm typecheck         # tsc, no emit
pnpm lint              # eslint
pnpm test:watch        # tests in watch mode
pnpm preview           # serve the production build locally
pnpm dlx shadcn@latest add <component>   # add a shadcn/ui component
```

### If something goes wrong

- **Blank page or the loading screen never goes away.** Open the browser console. If it
  shows an import error, run `mise run install` again; a dependency is probably missing after
  a pull.
- **Port 5173 is taken.** Stop the other process, or start Vite on another port with
  `pnpm --filter @geekykey/frontend dev --port 5174`.
- **`node -v` or `pnpm -v` shows a different version than `.mise.toml`.** Your shell is
  not activated, which is fine as long as you use `mise run`. If you want the plain
  commands to match, do the `mise activate` step above and open a new terminal.
- **`pnpm add -D typescript` installed TypeScript 7.** Do not do that. The project pins
  `typescript@~6.0.3` because the lint toolchain does not support 7 yet. Run
  `mise run install` to restore the pinned version.
- **The shadcn CLI wrote files into a folder literally called `@`.** The solution
  `apps/frontend/tsconfig.json` must keep its `paths` entry; the CLI reads the alias from
  there. Delete the stray folder and rerun the command.

### Where to read next

- `apps/frontend/CLAUDE.md` is the working agreement for the app: stack, layout, contract
  rules, and the definition of done for a screen.
- `apps/API-AGREEMENT.md` is what the screens are built against.
