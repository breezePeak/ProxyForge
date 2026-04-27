const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  appName: 'All2API Desktop',
  automation: {
    registerBatch: (payload) => ipcRenderer.invoke('automation:register-batch', payload),
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('automation:progress', listener);
      return () => {
        ipcRenderer.removeListener('automation:progress', listener);
      };
    }
  },
  mailbox: {
    listProviders: () => ipcRenderer.invoke('mailbox:list-providers'),
    create: (payload) => ipcRenderer.invoke('mailbox:create', payload),
    waitCode: (payload) => ipcRenderer.invoke('mailbox:wait-code', payload)
  }
});
