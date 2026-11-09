const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('appApi', { uninstall: () => ipcRenderer.invoke('uninstall') });
