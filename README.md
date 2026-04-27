<p align="center">
  <img src="docs/AWS-SAM-WATCHER-LOGO.png" alt="aws-sam-watcher logo" width="320" />
</p>

# aws-sam-watcher

A small file watcher for **auto-rebuilding an AWS SAM local stack**. Watches `./src/` for changes and restarts your local SAM API on the configured port whenever a source file changes.

## About AWS SAM

[AWS SAM (Serverless Application Model)](https://aws.amazon.com/serverless/sam/) is an open-source framework from AWS for building serverless applications. It extends CloudFormation with shorthand syntax for defining Lambda functions, API Gateway routes, DynamoDB tables, IAM roles, etc., all in a single `template.yaml` file.

The **SAM CLI** (`sam` on the command line) lets you:

- **`sam build`** — package your functions and their dependencies into a deployable artifact.
- **`sam local start-api`** — emulate API Gateway + Lambda locally via Docker, so you can hit `http://localhost:3000` and exercise your stack without deploying.
- **`sam deploy`** — push the built artifact to AWS using settings from `samconfig.toml`.

This watcher exists because `sam local start-api` doesn't auto-rebuild on file changes — so it pairs the SAM CLI with a tiny Node script that recycles the local stack whenever you save.

## What it does

- Watches `./src/` recursively using `node:fs.watch`.
- On any `change` event:
  1. Finds whatever process is listening on port `3000` via `lsof -ti :3000`.
  2. Kills it with `kill -9`.
  3. Spawns `make local`, inheriting stdio so SAM logs stream to your terminal (with `FORCE_COLOR=1`).

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

## Where to put it

Drop `watcher.js` and the `Makefile` at the **root of your SAM project** — the same directory that contains your `samconfig.toml` and `template.yaml`. That's important for two reasons:

- `sam build` and `sam local start-api` resolve `template.yaml` from the current working directory by default. Running `make local` from anywhere else means SAM can't find your stack.
- `WATCH_PATH = './src/'` is resolved relative to wherever you launch `node watcher.js`. Most SAM projects put their Lambda source under `./src/` next to the template, so dropping the watcher at the root just works.

Your project layout should end up looking roughly like this:

```
my-sam-project/
├── samconfig.toml
├── template.yaml
├── Makefile          ← from this repo
├── watcher.js        ← from this repo
└── src/
    └── handlers/
        └── ...
```

## Install

**Don't `git clone` this repo to use it** — you only need two files (`watcher.js` and `Makefile`). Cloning would drag in `eslint.config.mjs`, `.github/`, and the rest of the dev tooling that's irrelevant to consumers.

Instead, `cd` into your SAM project root and `curl` the two files directly from GitHub.

### Latest (track `main`)

```sh
curl -O https://raw.githubusercontent.com/AzySir/aws-sam-watcher/main/watcher.js
curl -O https://raw.githubusercontent.com/AzySir/aws-sam-watcher/main/Makefile
```

This always grabs the current tip of `main` — fine for trying it out, but you're at the mercy of whatever's been pushed since.

### Pinned to a release tag (recommended)

GitHub's raw URLs accept any ref — branch, tag, or commit SHA — in the path. Swap `main` for a release tag (e.g. `v1.0.0`) to lock yourself to a specific version:

```sh
TAG=v1.0.0
curl -O "https://raw.githubusercontent.com/AzySir/aws-sam-watcher/$TAG/watcher.js"
curl -O "https://raw.githubusercontent.com/AzySir/aws-sam-watcher/$TAG/Makefile"
```

Pick a tag from the [releases page](https://github.com/AzySir/aws-sam-watcher/releases). Pinning means you decide when to upgrade — re-run the same commands with a newer `TAG` to bump.

### Latest tag (auto-resolved)

If you want "always the latest stable tag" without manually bumping `TAG`, ask the GitHub API for the most recent release tag and substitute it:

```sh
TAG=$(curl -s https://api.github.com/repos/AzySir/aws-sam-watcher/releases/latest | grep -oE '"tag_name": "[^"]+"' | cut -d'"' -f4)
curl -O "https://raw.githubusercontent.com/AzySir/aws-sam-watcher/$TAG/watcher.js"
curl -O "https://raw.githubusercontent.com/AzySir/aws-sam-watcher/$TAG/Makefile"
```

Why not just use `raw.githubusercontent.com/.../latest/...`? GitHub's raw URLs don't accept `latest` as a ref — only branches, tags, or SHAs. The API call is the workaround.

Caveats:

- The unauthenticated GitHub API is rate-limited to 60 requests/hour per IP. Fine for occasional updates, not for CI that runs constantly. In CI, set `Authorization: Bearer $GITHUB_TOKEN` or pin to an explicit `TAG` instead.
- "Latest" follows whatever you cut next — re-running this script can silently upgrade you across breaking changes. If that matters, use the pinned-tag approach above.

### Updating

To upgrade, just re-run the curl commands with a newer `TAG`. `curl -O` overwrites the local file in place, so you go from `v1.0.0` → `v1.1.0` with:

```sh
TAG=v1.1.0
curl -O "https://raw.githubusercontent.com/AzySir/aws-sam-watcher/$TAG/watcher.js"
curl -O "https://raw.githubusercontent.com/AzySir/aws-sam-watcher/$TAG/Makefile"
```

> ⚠️ **Heads up: don't blindly overwrite your `Makefile`.**
>
> Most real SAM projects already have a `Makefile` with other targets (`deploy`, `test`, `lint`, etc.). If you `curl -O` the `Makefile` from this repo, you'll **wipe all of those out** — `curl -O` does a full file overwrite, not a merge.
>
> If your project already has a `Makefile`, do one of these instead:
>
> 1. **Curl to a temp file and copy the target across manually:**
>    ```sh
>    curl -o /tmp/watcher.Makefile "https://raw.githubusercontent.com/AzySir/aws-sam-watcher/$TAG/Makefile"
>    # then copy the `local:` target into your existing Makefile
>    ```
> 2. **Just write the `local:` target by hand** — it's only three lines and unlikely to change much between releases:
>    ```make
>    local:
>    	sam build
>    	sam local start-api --skip-pull-image --warm-containers LAZY
>    ```
>
> `watcher.js` is safe to overwrite freely on update — it's a standalone script with no project-specific contents.

## Usage

From the project root (next to `template.yaml`):

```sh
node watcher.js
```

Then edit any file under `./src/` and the watcher will kill whatever is on port 3000 and re-run `make local`.

## Configuration

The two knobs you'll almost certainly want to change live at the top of `watcher.js`:

```js
const PORT = 3000
const WATCH_PATH = './src/'
```

Tune them to match your repo:

### `PORT`

Whatever port your local stack listens on — the watcher kills this port before each rebuild so the next `sam local start-api` can bind to it cleanly.

- Default `3000` matches `sam local start-api`'s default.
- If you pass `sam local start-api --port 4000` (or set it in `samconfig.toml`), bump this to `4000` to match. **Mismatch here is the #1 footgun**: the watcher will kill the wrong port, your old SAM process keeps running on the real one, and the new one fails to bind with `EADDRINUSE`.
- If you also run a frontend dev server on 3000, move SAM (and this constant) to a different port to avoid collisions.

### `WATCH_PATH`

The directory the watcher recurses into. Set this to wherever your handler source lives, **relative to where you run `node watcher.js`**.

- `./src/` — typical SAM layout (`src/handlers/foo.js`, etc.).
- `./functions/` — common alternative seen in some SAM templates.
- `./packages/api/src/` — if your SAM app sits inside a monorepo workspace.
- `./` — watch everything, but expect noisy rebuilds (it'll fire on `.git/`, `node_modules/`, `.aws-sam/`, etc., which is rarely what you want).

Whatever path you choose, make sure it's the directory `sam build` actually consumes — watching `./lib/` while SAM builds from `./src/` means saves trigger rebuilds that don't include your changes.

### The build command (line 29)

```js
const child = spawn('make', ['local'], { ... })
```

In this repo we shell out to `make local` because that's the convention for this AWS SAM project, but swap it for whatever fits your repo:

- **Different make target:** `spawn('make', ['dev'], ...)` if your Makefile uses `dev` instead of `local`.
- **No Makefile:** call `sam` directly — `spawn('sam', ['local', 'start-api', '--warm-containers', 'LAZY'], ...)`.
- **Different stack entirely:** `spawn('npm', ['run', 'dev'], ...)`, `spawn('cargo', ['run'], ...)`, `spawn('docker', ['compose', 'up'], ...)`.

The watcher itself doesn't care what command you run — it just kills the port and respawns.

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

### The full loop

```
   ┌─────────────────────────┐
   │  1. You save a file     │
   │     under ./src/        │
   └────────────┬────────────┘
                │  fs.watch fires "change"
                ▼
   ┌─────────────────────────┐
   │  2. Watcher kills       │
   │     port 3000 (SIGKILL) │
   └────────────┬────────────┘
                │  spawn('make', ['local'])
                ▼
   ┌─────────────────────────┐
   │  3. sam build           │
   │     repackages Lambdas  │
   │     into .aws-sam/build │
   └────────────┬────────────┘
                │
                ▼
   ┌─────────────────────────┐
   │  4. sam local start-api │
   │     boots warm          │
   │     containers (LAZY)   │
   └────────────┬────────────┘
                │  listening on :3000
                ▼
   ┌─────────────────────────┐
   │  5. You hit             │
   │     localhost:3000      │
   │     → see your change   │
   └─────────────────────────┘
```

## Notes

- The watcher only reacts to `eventType === "change"` — file creation/rename events are ignored.
- It uses `kill -9` (SIGKILL), so the SAM process won't get a chance to clean up. Fine for local dev.
- If nothing is on the port, it logs `Nothing running on port 3000` and still starts `make local`.
