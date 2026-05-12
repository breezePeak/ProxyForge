const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  appName: 'All2API Desktop',
  automation: {
    registerBatch: (payload) => ipcRenderer.invoke('automation:register-batch', payload),
    launchKiroClient: (payload) => ipcRenderer.invoke('automation:launch-kiro-client', payload),
    captureKiroWebAccount: (payload) => ipcRenderer.invoke('automation:capture-kiro-web-account', payload),
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
  },
  quota: {
    getQuota: (params) => ipcRenderer.invoke('quota:getQuota', params)
  }
});
