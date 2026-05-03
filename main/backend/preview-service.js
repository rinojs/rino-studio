import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { readFile, stat } from 'fs/promises';
import { normalizeProjectPath } from './path-utils.js';

const previews = new Map();
const READY_TIMEOUT_MS = 10000;
const READY_POLL_MS = 200;

async function pathExists(targetPath)
{
    try
    {
        await stat(targetPath);
        return true;
    }
    catch
    {
        return false;
    }
}

function waitForPort(port, timeoutMs = READY_TIMEOUT_MS, pollMs = READY_POLL_MS)
{
    const startedAt = Date.now();

    return new Promise((resolve, reject) =>
    {
        function probe()
        {
            let done = false;
            const socket = net.createConnection({ host: '127.0.0.1', port });

            const retry = () =>
            {
                if (done)
                {
                    return;
                }
                done = true;
                socket.destroy();

                if ((Date.now() - startedAt) >= timeoutMs)
                {
                    reject(new Error(`Preview server did not start on port ${ port }.`));
                    return;
                }

                setTimeout(probe, pollMs);
            };

            socket.once('connect', () =>
            {
                if (done)
                {
                    return;
                }
                done = true;
                socket.end();
                resolve();
            });
            socket.once('error', retry);
            socket.setTimeout(pollMs, retry);
        }

        probe();
    });
}

async function readPackageScripts(projectPath)
{
    const packagePath = path.join(projectPath, 'package.json');
    if (!(await pathExists(packagePath)))
    {
        return {};
    }

    const raw = await readFile(packagePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
}

function parsePort(configSource)
{
    const match = configSource.match(/\bport\s*:\s*(\d{2,5})\b/);
    return match ? Number(match[1]) : 3000;
}

async function resolvePreviewCommand(projectPath)
{
    const scripts = await readPackageScripts(projectPath);
    if (scripts.dev)
    {
        return process.platform === 'win32'
            ? { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm run dev'] }
            : { command: 'npm', args: ['run', 'dev'] };
    }

    const devPath = path.join(projectPath, 'dev.js');
    if (await pathExists(devPath))
    {
        return { command: process.execPath, args: [devPath] };
    }

    throw new Error('No preview command found. Expected `npm run dev` or `dev.js`.');
}

function attachLogs(preview)
{
    const pushLog = (line) =>
    {
        preview.logs.push(line);
        if (preview.logs.length > 100)
        {
            preview.logs.shift();
        }
    };

    preview.child.stdout?.on('data', (chunk) => pushLog(String(chunk).trimEnd()));
    preview.child.stderr?.on('data', (chunk) => pushLog(String(chunk).trimEnd()));
}

export async function startPreview(projectPath)
{
    const absolutePath = normalizeProjectPath(projectPath);
    const configSource = await readFile(path.join(absolutePath, 'rino-config.js'), 'utf8');
    const port = parsePort(configSource);
    const existing = previews.get(absolutePath);

    if (existing?.status === 'running')
    {
        return {
            status: existing.status,
            url: `http://127.0.0.1:${ existing.port }`,
            logs: existing.logs,
        };
    }

    const { command, args } = await resolvePreviewCommand(absolutePath);
    const child = spawn(command, args, {
        cwd: absolutePath,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
    });

    const preview = {
        child,
        logs: [],
        port,
        status: 'starting',
    };
    previews.set(absolutePath, preview);
    attachLogs(preview);

    child.once('close', () =>
    {
        const activePreview = previews.get(absolutePath);
        if (activePreview === preview)
        {
            preview.status = 'stopped';
        }
    });

    await waitForPort(port);
    preview.status = 'running';

    return {
        status: preview.status,
        url: `http://127.0.0.1:${ port }`,
        logs: preview.logs,
    };
}

export function getPreviewStatus(projectPath)
{
    const absolutePath = normalizeProjectPath(projectPath);
    const preview = previews.get(absolutePath);

    if (!preview)
    {
        return { status: 'idle', url: null, logs: [] };
    }

    return {
        status: preview.status,
        url: `http://127.0.0.1:${ preview.port }`,
        logs: preview.logs,
    };
}

export function stopPreview(projectPath)
{
    const absolutePath = normalizeProjectPath(projectPath);
    const preview = previews.get(absolutePath);
    if (!preview)
    {
        return { status: 'idle' };
    }

    preview.child.kill();
    preview.status = 'stopped';
    previews.delete(absolutePath);
    return { status: 'stopped' };
}

export function stopAllPreviews()
{
    for (const [projectPath, preview] of previews)
    {
        preview.child.kill();
        previews.delete(projectPath);
    }
}
