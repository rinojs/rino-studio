import { staticSiteServer } from 'rinojs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

async function dev()
{
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const port = Number(process.env.PORT);
    const isValid = Number.isInteger(port) && port >= 3000 && port < 65536;

    await staticSiteServer(path.resolve(__dirname, "./"), isValid ? port : 3000);
}

dev();