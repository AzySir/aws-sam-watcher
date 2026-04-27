import { watch, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'child_process'

const PORT = 3000
const WATCH_PATH = './src/'
const BUILD_DIR = './.aws-sam/build'
const CLEAN_BUILD_DIR = false

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

const cleanupOrphanContainers = () => {
    const ps = spawnSync(
        'docker',
        ['ps', '-aq', '--filter', 'label=sam.cli.container.type=lambda'],
        { encoding: 'utf8' }
    )
    const ids = ps.stdout.trim().split('\n').filter(Boolean)
    if (ids.length === 0) return
    const inspect = spawnSync(
        'docker',
        ['inspect', '--format', '{{.Id}}\t{{range .Mounts}}{{.Source}};{{end}}', ...ids],
        { encoding: 'utf8' }
    )
    const projectBuild = `${process.cwd()}/.aws-sam/build`
    const orphans = inspect.stdout
        .trim()
        .split('\n')
        .filter((line) => line.includes(projectBuild))
        .map((line) => line.split('\t')[0])
    if (orphans.length === 0) return
    console.log(`Removing ${orphans.length} orphaned SAM container(s)`)
    spawnSync('docker', ['rm', '-f', ...orphans])
}

const watcher = () => {
    console.log("Watcher called")
    const watcherOptions = { recursive: true }

    let currentChild = null
    let debounceTimer = null
    let pendingRebuild = false

    const startBuild = () => {
        if (currentChild) {
            pendingRebuild = true
            // eslint-disable-next-line no-empty 
            try { process.kill(-currentChild.pid, 'SIGKILL') } catch {}
            killPort(PORT)
            cleanupOrphanContainers()
            return
        }

        killPort(PORT)
        cleanupOrphanContainers()
        if (CLEAN_BUILD_DIR) {
            rmSync(BUILD_DIR, { recursive: true, force: true })
        }
        console.log("Starting make local")
        currentChild = spawn('make', ['local'], {
            stdio: 'inherit',
            env: { ...process.env, FORCE_COLOR: '1' },
            detached: true,
        })
        currentChild.on('error', (error) => console.error(`spawn error: ${error}`))
        currentChild.on('exit', () => {
            currentChild = null
            if (pendingRebuild) {
                pendingRebuild = false
                startBuild()
            }
        })
    }

    startBuild()
    watch(WATCH_PATH, watcherOptions, (eventType, filename) => {
        if (eventType !== "change") return
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
            console.log(`Change detected: ${filename}`)
            startBuild()
        }, 200)
    })
}

killPort(PORT)
cleanupOrphanContainers()
watcher()
