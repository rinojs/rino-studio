import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import url from 'url';
import chokidar from 'chokidar';
import electron from 'electron';
import { findPort } from "rinojs";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ELECTRON_DEBOUNCE_MS = 250;
const RINO_READY_TIMEOUT_MS = 15000;
const RINO_READY_POLL_MS = 150;
const port = await findPort(3000);

let ElectronChild = null;
let RinoChild = null;
let et;
let electronLaunchVersion = 0;

function waitForPortReady(portToCheck, timeoutMs = RINO_READY_TIMEOUT_MS, pollMs = RINO_READY_POLL_MS)
{
    const startedAt = Date.now();

    return new Promise((resolve, reject) =>
    {
        function tryConnect()
        {
            let handled = false;
            const socket = net.createConnection({
                host: '127.0.0.1',
                port: portToCheck,
            });

            const retry = () =>
            {
                if (handled)
                {
                    return;
                }
                handled = true;
                socket.destroy();
                if ((Date.now() - startedAt) >= timeoutMs)
                {
                    reject(new Error(`Rino dev server was not ready on port ${ portToCheck } within ${ timeoutMs }ms.`));
                    return;
                }
                setTimeout(tryConnect, pollMs);
            };

            socket.once('connect', () =>
            {
                if (handled)
                {
                    return;
                }
                handled = true;
                socket.end();
                resolve();
            });
            socket.once('error', retry);
            socket.setTimeout(pollMs, retry);
        }

        tryConnect();
    });
}

async function startElectron(version)
{
    console.log(`[dev] Waiting for Rino dev server on http://localhost:${ port }`);
    try
    {
        await waitForPortReady(port);
    }
    catch (error)
    {
        if (version === electronLaunchVersion)
        {
            console.error(`[dev] ${ error instanceof Error ? error.message : error }`);
        }
        return;
    }

    if (version !== electronLaunchVersion)
    {
        return;
    }

    function spawnNow()
    {
        const env = {
            ...process.env,
            RINO_DEV: '1',
            RINO_URL: `http://localhost:${ port }`,
        };
        ElectronChild = spawn(electron, ['.', '--ignore-gpu-blocklist', '--disable-gpu', '--enable-webgl'], {
            stdio: ['ignore', 'inherit', 'inherit'],
            env,
        });
        ElectronChild.on('close', () => { ElectronChild = null; });
        console.log('[dev] Electron started/restarted');
    }

    if (ElectronChild)
    {
        const p = ElectronChild;
        ElectronChild = null;
        p.once('close', () => setTimeout(spawnNow, 50));
        try { p.kill(); } catch (error)
        {
            console.log(`Killing Electron Process Error: ${ error }`);
        }
    }
    else
    {
        spawnNow();
    }
}

function scheduleElectron()
{
    electronLaunchVersion += 1;
    const version = electronLaunchVersion;
    clearTimeout(et);
    et = setTimeout(() => { void startElectron(version); }, ELECTRON_DEBOUNCE_MS);
}

function startRino()
{
    if (RinoChild) return;

    const devPath = path.join(__dirname, 'rino', 'dev.js');
    const env = { ...process.env, PORT: String(port) };

    RinoChild = spawn(process.execPath, [devPath], {
        stdio: ['ignore', 'inherit', 'inherit'],
        env,
    });

    RinoChild.on('close', () =>
    {
        console.log('[dev] Rino dev server exited');
        RinoChild = null;
    });
}

const mainDir = path.join(__dirname, 'main');

chokidar
    .watch([
        mainDir
    ], { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 } }).on('all', (evt, file) =>
    {
        console.log(`[dev] ${ evt }: ${ file }`);
        scheduleElectron();
    });


function shutdown()
{
    if (ElectronChild) ElectronChild.kill();
    if (RinoChild) RinoChild.kill();

    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startRino();
scheduleElectron();
