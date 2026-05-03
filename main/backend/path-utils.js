import path from 'path';

export function normalizeProjectPath(projectPath)
{
    if (typeof projectPath !== 'string' || projectPath.trim().length === 0)
    {
        throw new Error('Project path is required.');
    }

    return path.resolve(projectPath);
}

export function assertPathInsideRoot(rootPath, relativePath = '.')
{
    if (typeof relativePath !== 'string' || relativePath.includes('\0'))
    {
        throw new Error('Invalid path.');
    }

    const absoluteRoot = normalizeProjectPath(rootPath);
    const absoluteTarget = path.resolve(absoluteRoot, relativePath);
    const relativeToRoot = path.relative(absoluteRoot, absoluteTarget);

    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot))
    {
        throw new Error('Path traversal is not allowed.');
    }

    return absoluteTarget;
}

export function toProjectId(projectPath)
{
    return normalizeProjectPath(projectPath).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}
