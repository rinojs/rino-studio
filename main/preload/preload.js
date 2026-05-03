const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  getState: () => ipcRenderer.invoke('studio:getState'),
  chooseProject: () => ipcRenderer.invoke('studio:chooseProject'),
  readFile: (projectPath, relativePath) => ipcRenderer.invoke('studio:readFile', { projectPath, relativePath }),
  writeFile: (projectPath, relativePath, content) => ipcRenderer.invoke('studio:writeFile', { projectPath, relativePath, content }),
  startPreview: (projectPath) => ipcRenderer.invoke('studio:startPreview', { projectPath }),
  stopPreview: (projectPath) => ipcRenderer.invoke('studio:stopPreview', { projectPath }),
});
