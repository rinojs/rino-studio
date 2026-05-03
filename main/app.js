
import
{
    app,
    BrowserWindow,
    shell
} from 'electron';
import url from 'url';
import path from 'path';
import { readdir } from 'fs/promises';
import { stopAllPreviews } from './backend/preview-service.js';
const __appdata = app.getPath('userData');
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

global.share = { mainWindow, __appdata, __filename, __dirname };

async function registerAllIpc()
{
    const dir = path.join(__dirname, 'ipc');
    const files = (await readdir(dir)).filter(f => f.endsWith('.js'));
    for (const f of files)
    {
        const mod = await import(url.pathToFileURL(path.join(dir, f)));
        if (typeof mod.register === 'function')
        {
            mod.register();
        }
    }
}

await registerAllIpc();

function createWindow()
{
    global.share.mainWindow = new BrowserWindow({
        title: 'Rino Studio',
        width: 1280,
        height: 720,
        minWidth: 720,
        minHeight: 720,
        frame: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.resolve(__dirname, 'preload/preload.js')
        }
    });

    //global.share.mainWindow.webContents.session.enableNetworkEmulation({ offline: true })

    const appURL = process.env.ELECTRON_START_URL || url.format({
        pathname: path.join(__dirname, '../www/index.html'),
        protocol: 'file:',
        slashes: true
    });

    global.share.mainWindow.loadURL(appURL);
    if (!app.isPackaged)
    {
        global.share.mainWindow.webContents.openDevTools();
    }
    global.share.mainWindow.setMenu(null);

    global.share.mainWindow.on('closed', function ()
    {
        if (process.platform !== 'darwin')
        {
            global.share.mainWindow = null;

            app.quit();
        }
    });

    global.share.mainWindow.webContents.setWindowOpenHandler(({ url: theUrl }) =>
    {
        shell.openExternal(theUrl);
        return { action: 'deny' };
    });
}

app.on('ready', function ()
{
    createWindow();
});

app.on('window-all-closed', function ()
{
    if (process.platform !== 'darwin')
    {
        stopAllPreviews();
        global.share.mainWindow = null;
        app.quit();
    }
});

app.on('before-quit', () =>
{
    stopAllPreviews();
});

app.on('activate', function ()
{
    if (global.share.mainWindow === null)
    {
        createWindow()
    }
});
