import { watch } from 'node:fs';
import { spawn, spawnSync } from 'child_process'

const PORT = 3000
const WATCH_PATH = './src/'

const killPort = (port) => {
    const lsof = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' })
    const pids = lsof.stdout.trim().split('\n').filter(Boolean)
    if (pids.length === 0) {
        console.log(`Nothing running on port ${port}`)
        return
    }
    console.log(`Killing pid(s) ${pids.join(', ')} on port ${port}`)
    spawnSync('kill', ['-9', ...pids])
}

const watcher = () => {
    console.log("Watcher called")
    const watcherOptions = {
        recursive: true
    }

    // Reference to the currently-running `make local` child. Used so a new
    // change event can cancel the in-flight build instead of racing it.
    let currentChild = null
    // Timer handle for the debounce window. A single file save typically
    // emits multiple "change" events; we collapse them into one rebuild.
    let debounceTimer = null
    // Set to true when a change arrives mid-build. After the current build
    // exits we automatically kick off one more rebuild to pick up the change.
    let pendingRebuild = false

    const startBuild = () => {
        // A build is already running. Mark that we want another build after
        // it dies, then kill the whole process tree so it exits quickly.
        // Using `process.kill(-pid)` (negative pid) signals the entire
        // process group — make, npm, esbuild, sam build — not just `make`.
        // Without this, child processes keep writing files and race with
        // the next build's `sam build` rmtree, causing the .mjs.map ENOENT.
        if (currentChild) {
            pendingRebuild = true
            try { process.kill(-currentChild.pid, 'SIGKILL') } catch { /* already exited */ }
            return
        }

        // Free port 3000 from the previous dev server before starting again.
        killPort(PORT)
        console.log("Starting make local")
        currentChild = spawn('make', ['local'], {
            stdio: 'inherit',
            env: { ...process.env, FORCE_COLOR: '1' },
            // `detached: true` puts the child in its own process group so the
            // negative-pid kill above can take down the whole subtree.
            detached: true,
        })
        currentChild.on('error', (error) => console.error(`spawn error: ${error}`))
        currentChild.on('exit', () => {
            // Build finished (or was killed). Clear the reference and, if a
            // change arrived while we were busy, run one more rebuild now.
            currentChild = null
            if (pendingRebuild) {
                pendingRebuild = false
                startBuild()
            }
        })
    }

    watch(WATCH_PATH, watcherOptions, (eventType, filename) => {
        if (eventType !== "change") return
        // Debounce: editors often write a file 2+ times per save and a
        // recursive watch emits one event per affected entry. Resetting the
        // timer on every event means we only trigger a build once the burst
        // has been quiet for 200ms.
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
            console.log(`Change detected: ${filename}`)
            startBuild()
        }, 200)
    })
}

watcher()