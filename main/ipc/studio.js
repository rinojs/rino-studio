import { dialog, ipcMain } from 'electron';
import path from 'path';
import { discoverWorkspaceProjects, inspectProject, isRinoProject, readProjectFile, writeProjectFile } from '../backend/project-service.js';
import { getPreviewStatus, startPreview, stopPreview } from '../backend/preview-service.js';

function getWorkspaceRoot()
{
    return path.resolve(global.share.__dirname, '..');
}

function mapProjectResult(project)
{
    return {
        ...project,
        previewStatus: getPreviewStatus(project.path),
    };
}

export function register()
{
    ipcMain.handle('studio:getState', async () =>
    {
        const projects = await discoverWorkspaceProjects(getWorkspaceRoot());
        return {
            workspaceRoot: getWorkspaceRoot(),
            projects: projects.map(mapProjectResult),
        };
    });

    ipcMain.handle('studio:chooseProject', async () =>
    {
        const result = await dialog.showOpenDialog(global.share.mainWindow, {
            properties: ['openDirectory'],
        });

        if (result.canceled || result.filePaths.length === 0)
        {
            return null;
        }

        if (!(await isRinoProject(result.filePaths[0])))
        {
            throw new Error('Selected folder is not a recognizable Rino.js project.');
        }

        const project = await inspectProject(result.filePaths[0]);
        return mapProjectResult(project);
    });

    ipcMain.handle('studio:readFile', async (_event, { projectPath, relativePath }) =>
    {
        return readProjectFile(projectPath, relativePath);
    });

    ipcMain.handle('studio:writeFile', async (_event, { projectPath, relativePath, content }) =>
    {
        await writeProjectFile(projectPath, relativePath, content);
        return mapProjectResult(await inspectProject(projectPath));
    });

    ipcMain.handle('studio:startPreview', async (_event, { projectPath }) =>
    {
        return startPreview(projectPath);
    });

    ipcMain.handle('studio:stopPreview', async (_event, { projectPath }) =>
    {
        return stopPreview(projectPath);
    });
}
