const { contextBridge, ipcRenderer } = require('electron');

// Expose protected desktop capabilities safely to renderer process
contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  platform: process.platform,
  arch: process.arch, // 'x64' or 'ia32'
  version: '1.0.0',

  // Printer Management & Silent Thermal Printing
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printReceipt: (htmlContent, options = {}) => ipcRenderer.invoke('print-receipt', { htmlContent, ...options }),
  printSilent: (options = {}) => ipcRenderer.invoke('print-silent', options),
  
  // POS Terminal Display Controls
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  toggleKiosk: () => ipcRenderer.invoke('toggle-kiosk'),
  
  // System Info
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),

  // Window Controls (if used in custom header)
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Event Listeners from Main Menu
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (event, action, data) => callback(action, data));
  }
});
