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

    watch(WATCH_PATH, watcherOptions, (eventType, filename) => {
        if (eventType == "change") {
            console.log("Changed detected")
            killPort(PORT)

            const child = spawn('make', ['local'], {
                stdio: 'inherit',
                env: { ...process.env, FORCE_COLOR: '1' },
            })
            child.on('error', (error) => console.error(`spawn error: ${error}`))
        }
    })
}

watcher()