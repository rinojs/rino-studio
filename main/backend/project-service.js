import path from 'path';
import { readdir, readFile, stat, writeFile } from 'fs/promises';
import { assertPathInsideRoot, normalizeProjectPath, toProjectId } from './path-utils.js';

const PROJECT_DIR_GROUPS = [
    { key: 'pages', title: 'Pages', dir: 'pages', extensions: ['.html'] },
    { key: 'components', title: 'Components', dir: 'components', extensions: ['.html'] },
    { key: 'contentTheme', title: 'Content Theme', dir: 'content-theme', extensions: ['.html'] },
    { key: 'contents', title: 'Contents', dir: 'contents', extensions: ['.md'] },
    { key: 'mds', title: 'Markdown Pages', dir: 'mds', extensions: ['.md'] },
    { key: 'scripts', title: 'Scripts', dir: 'scripts', extensions: ['.js', '.ts'] },
    { key: 'styles', title: 'Styles', dir: 'styles', extensions: ['.css'] },
];

const WRITABLE_EXTENSIONS = new Set(['.md', '.html', '.css', '.js', '.ts', '.json']);

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

async function readDirectoryTree(rootPath, currentRelativePath = '', allowedExtensions = null)
{
    const absolutePath = assertPathInsideRoot(rootPath, currentRelativePath);
    const entries = await readdir(absolutePath, { withFileTypes: true });
    const children = [];

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name)))
    {
        const relativePath = path.posix.join(currentRelativePath.replaceAll('\\', '/'), entry.name).replace(/^\//, '');

        if (entry.isDirectory())
        {
            children.push({
                id: `${ relativePath }/`,
                label: entry.name,
                kind: 'directory',
                relativePath,
                children: await readDirectoryTree(rootPath, relativePath, allowedExtensions),
            });
            continue;
        }

        if (allowedExtensions && !allowedExtensions.includes(path.extname(entry.name).toLowerCase()))
        {
            continue;
        }

        children.push({
            id: relativePath,
            label: entry.name,
            kind: 'file',
            relativePath,
        });
    }

    return children;
}

function parseFrontMatterTitle(content, fallback)
{
    const lines = content.split(/\r?\n/);
    let inFrontMatter = false;

    for (const line of lines)
    {
        if (line.trim() === '---')
        {
            inFrontMatter = !inFrontMatter;
            continue;
        }

        if (inFrontMatter)
        {
            const titleMatch = line.match(/^title:\s*["']?(.*?)["']?\s*$/i);
            if (titleMatch?.[1])
            {
                return titleMatch[1];
            }
            continue;
        }

        const headingMatch = line.match(/^#\s+(.*)$/);
        if (headingMatch?.[1])
        {
            return headingMatch[1];
        }
    }

    return fallback;
}

async function readContentEntries(projectPath)
{
    const contentsRoot = path.join(projectPath, 'contents');
    if (!(await pathExists(contentsRoot)))
    {
        return [];
    }

    const tree = await readDirectoryTree(projectPath, 'contents', ['.md']);
    const flatEntries = [];

    async function walk(nodes)
    {
        for (const node of nodes)
        {
            if (node.kind === 'directory')
            {
                await walk(node.children ?? []);
                continue;
            }

            const raw = await readProjectFile(projectPath, node.relativePath);
            const parts = node.relativePath.split('/');
            flatEntries.push({
                relativePath: node.relativePath,
                language: parts[1] ?? '',
                category: parts[2] ?? '',
                slug: path.basename(node.relativePath, '.md'),
                title: parseFrontMatterTitle(raw, path.basename(node.relativePath, '.md')),
            });
        }
    }

    await walk(tree);
    return flatEntries;
}

function parsePortFromConfig(configSource)
{
    const match = configSource.match(/\bport\s*:\s*(\d{2,5})\b/);
    return match ? Number(match[1]) : 3000;
}

async function readPackageScripts(projectPath)
{
    const packagePath = path.join(projectPath, 'package.json');
    if (!(await pathExists(packagePath)))
    {
        return {};
    }

    try
    {
        const raw = await readFile(packagePath, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
    }
    catch
    {
        return {};
    }
}

export async function isRinoProject(projectPath)
{
    const absolutePath = normalizeProjectPath(projectPath);
    const checks = await Promise.all([
        pathExists(path.join(absolutePath, 'rino-config.js')),
        pathExists(path.join(absolutePath, 'pages')),
        pathExists(path.join(absolutePath, 'content-theme')),
        pathExists(path.join(absolutePath, 'contents')),
        pathExists(path.join(absolutePath, 'mds')),
    ]);

    return checks.some(Boolean) && checks[1];
}

export async function discoverWorkspaceProjects(workspaceRoot)
{
    const absoluteRoot = normalizeProjectPath(workspaceRoot);
    const directChildren = await readdir(absoluteRoot, { withFileTypes: true });
    const candidates = [absoluteRoot];

    for (const entry of directChildren)
    {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
        {
            candidates.push(path.join(absoluteRoot, entry.name));
        }
    }

    const projects = [];
    for (const candidate of candidates)
    {
        if (await isRinoProject(candidate))
        {
            projects.push(await inspectProject(candidate));
        }
    }

    return projects.sort((left, right) => left.name.localeCompare(right.name));
}

export async function inspectProject(projectPath)
{
    const absolutePath = normalizeProjectPath(projectPath);
    const configPath = path.join(absolutePath, 'rino-config.js');
    const packageScripts = await readPackageScripts(absolutePath);
    const hasConfig = await pathExists(configPath);
    const configSource = hasConfig ? await readFile(configPath, 'utf8') : '';
    const previewPort = parsePortFromConfig(configSource);
    const groups = [];

    for (const group of PROJECT_DIR_GROUPS)
    {
        const absoluteGroupPath = path.join(absolutePath, group.dir);
        if (!(await pathExists(absoluteGroupPath)))
        {
            continue;
        }

        groups.push({
            key: group.key,
            title: group.title,
            dir: group.dir,
            tree: await readDirectoryTree(absolutePath, group.dir, group.extensions),
        });
    }

    return {
        id: toProjectId(absolutePath),
        name: path.basename(absolutePath),
        path: absolutePath,
        previewPort,
        previewCommand: packageScripts.dev ? 'npm run dev' : ((await pathExists(path.join(absolutePath, 'dev.js'))) ? 'node dev.js' : null),
        backofficeCommand: packageScripts.backoffice ? 'npm run backoffice' : null,
        groups,
        contentEntries: await readContentEntries(absolutePath),
    };
}

export async function readProjectFile(projectPath, relativePath)
{
    const absolutePath = assertPathInsideRoot(projectPath, relativePath);
    return readFile(absolutePath, 'utf8');
}

export async function writeProjectFile(projectPath, relativePath, content)
{
    const absolutePath = assertPathInsideRoot(projectPath, relativePath);
    const extension = path.extname(absolutePath).toLowerCase();

    if (!WRITABLE_EXTENSIONS.has(extension))
    {
        throw new Error(`File type ${ extension || '(none)' } is not editable.`);
    }

    if (typeof content !== 'string')
    {
        throw new Error('Content must be a string.');
    }

    await writeFile(absolutePath, content, 'utf8');
    return { relativePath };
}
