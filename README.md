# aws-sam-watcher

A small file watcher for **auto-rebuilding an AWS SAM local stack**. Watches `./src/` for changes and restarts your local SAM API on the configured port whenever a source file changes.

## What it does

- Watches `./src/` recursively using `node:fs.watch`.
- On any `change` event:
  1. Finds whatever process is listening on port `3000` via `lsof -ti :3000`.
  2. Kills it with `kill -9`.
  3. Spawns `make local` in zsh, inheriting stdio so SAM logs stream to your terminal (with `FORCE_COLOR=1`).

## Zero dependencies

No `npm install` required. The script only uses Node built-ins, which ship with Node by default:

- `node:fs` — for `watch()` to observe the source directory.
- `child_process` — for `spawn` (run `make local`) and `spawnSync` (run `lsof` / `kill`).

That means you can drop `watcher.js` into any project and run it with `node watcher.js` — no `package.json`, no lockfile, no third-party packages.

## Requirements

- Node.js (uses ESM `import` — needs `"type": "module"` in `package.json` or rename to `.mjs`).
- macOS / Linux with `lsof` and `kill` available.
- AWS SAM CLI installed (`sam --version`).
- A `Makefile` with a `local` target that boots your SAM stack on port 3000 (see below).

## Usage

From the project root:

```sh
node watcher.js
```

Then edit any file under `./src/` and the watcher will kill whatever is on port 3000 and re-run `make local`.

## Configuration

Edit the constants at the top of `watcher.js`:

```js
const PORT = 3000
const WATCH_PATH = './src/'
```

The build command itself is hardcoded on **line 29** of `watcher.js`:

```js
const child = spawn('make', ['local'], { ... })
```

In this repo we shell out to `make local` because that's the convention for this AWS SAM project, but you can swap it for whatever build/run command suits your own workflow (e.g. `npm run dev`, `cargo run`, `docker compose up`, etc.).

## The Makefile

The watcher invokes `make local`, which is defined in the included `Makefile`:

```make
local:
	sam build
	sam local start-api --skip-pull-image --warm-containers LAZY
```

What each step does:

- **`sam build`** — packages your Lambda functions and dependencies into `.aws-sam/build/`, ready for local invocation.
- **`sam local start-api`** — spins up a local API Gateway emulator on port 3000 that routes requests to your Lambdas via Docker.
  - **`--skip-pull-image`** — don't re-pull the Lambda runtime Docker image on every start. Big speedup once you've pulled it once.
  - **`--warm-containers LAZY`** — keep Lambda containers alive between requests, created on first invocation. Subsequent calls skip the cold-start, which makes iterating dramatically faster.

So the full loop is: save a file → watcher kills port 3000 → `sam build` repackages → `sam local start-api` boots warm containers → you hit `localhost:3000` and see your change.

## Notes

- The watcher only reacts to `eventType === "change"` — file creation/rename events are ignored.
- It uses `kill -9` (SIGKILL), so the SAM process won't get a chance to clean up. Fine for local dev.
- If nothing is on the port, it logs `Nothing running on port 3000` and still starts `make local`.
