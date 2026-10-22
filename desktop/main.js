const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const os = require('os');

// Enforce single instance lock for POS terminals
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow = null;

function createMainWindow() {
  const iconPath = path.join(__dirname, 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    center: true,
    title: 'Plate Pilot - Restaurant POS & Management System',
    icon: iconPath,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false, // Allows flexible local printer & LAN KDS communication
      spellcheck: false
    }
  });

  // Load Main Web App
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Configure Native POS Application Menu
  const appMenuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New POS Order',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-action', 'new-order');
          }
        },
        {
          label: 'Print Thermal Receipt',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            mainWindow.webContents.send('menu-action', 'print-receipt');
          }
        },
        { type: 'separator' },
        {
          label: 'Refresh / Sync Cloud Data',
          accelerator: 'F5',
          click: () => {
            mainWindow.webContents.send('menu-action', 'refresh-cloud');
          }
        },
        {
          label: 'Force Reload UI',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            mainWindow.reload();
          }
        },
        { type: 'separator' },
        {
          label: 'Exit POS Terminal',
          accelerator: 'Alt+F4',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          }
        },
        {
          label: 'Toggle Kiosk Mode (Lockdown POS)',
          accelerator: 'CmdOrCtrl+Shift+K',
          click: () => {
            const nextKiosk = !mainWindow.isKiosk();
            mainWindow.setKiosk(nextKiosk);
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'POS Kiosk Mode',
              message: nextKiosk 
                ? 'Kiosk Mode ENABLED: POS is locked in fullscreen. Press Ctrl+Shift+K or Alt+F4 to exit.' 
                : 'Kiosk Mode DISABLED: Standard desktop window restored.'
            });
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'POS Hardware',
      submenu: [
        {
          label: 'Detect Connected Printers',
          click: async () => {
            try {
              const printers = await mainWindow.webContents.getPrintersAsync();
              const list = printers.map(p => `• ${p.name} (${p.isDefault ? 'Default' : 'Available'})`).join('\n') || 'No printers detected';
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Connected Receipt Printers',
                message: `Found ${printers.length} printer(s):\n\n${list}`
              });
            } catch (err) {
              dialog.showErrorBox('Printer Detection Error', err.message);
            }
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open QR Dining Menu in Browser',
          click: () => {
            shell.openExternal('http://localhost:5000/qr-menu.html');
          }
        },
        { type: 'separator' },
        {
          label: 'About Plate Pilot POS Desktop',
          click: () => {
            const arch = process.arch === 'x64' ? '64-bit (x64)' : '32-bit (ia32)';
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Plate Pilot POS',
              message: `Plate Pilot - Restaurant POS & Management System\n\nVersion: 1.0.0\nArchitecture: Windows ${arch}\nOS: ${os.type()} ${os.release()} (${os.arch()})\nElectron: ${process.versions.electron}\nChromium: ${process.versions.chrome}\nNode: ${process.versions.node}\n\n© 2026 Plate Pilot. All rights reserved.`
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(appMenuTemplate);
  Menu.setApplicationMenu(menu);

  // External link safety
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Second instance focus
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================================
// IPC HARDWARE & THERMAL PRINTING HANDLERS
// ============================================================================

// 1. Get List of System Printers
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch (e) {
    console.error('get-printers error:', e);
    return [];
  }
});

// 2. Silent Thermal Receipt Printing from HTML
ipcMain.handle('print-receipt', async (event, { htmlContent, printerName, silent = true, width = '80mm' }) => {
  return new Promise((resolve) => {
    // Create an invisible off-screen window formatted specifically for 80mm or 58mm thermal rolls
    const printWin = new BrowserWindow({
      show: false,
      width: width === '58mm' ? 220 : 320,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page {
            margin: 0;
            size: auto;
          }
          body {
            margin: 4mm 2mm;
            padding: 0;
            font-family: 'Courier New', Courier, monospace, sans-serif;
            font-size: 11px;
            line-height: 1.35;
            color: #000;
            background: #fff;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .flex-between { display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;

    printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);

    printWin.webContents.on('did-finish-load', () => {
      const printOptions = {
        silent: Boolean(silent),
        printBackground: true,
        margins: { marginType: 'none' }
      };

      if (printerName) {
        printOptions.deviceName = printerName;
      }

      printWin.webContents.print(printOptions, (success, failureReason) => {
        printWin.close();
        if (!success) {
          console.warn('Thermal print failed:', failureReason);
          resolve({ success: false, error: failureReason });
        } else {
          resolve({ success: true });
        }
      });
    });
  });
});

// 3. Silent Print Current Window
ipcMain.handle('print-silent', async (event, options = {}) => {
  if (!mainWindow) return { success: false, error: 'Window not active' };
  return new Promise((resolve) => {
    mainWindow.webContents.print({
      silent: true,
      printBackground: true,
      margins: { marginType: 'none' },
      deviceName: options.printerName || undefined
    }, (success, failureReason) => {
      resolve({ success, error: failureReason });
    });
  });
});

// 4. POS Terminal Toggles
ipcMain.handle('toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle('toggle-kiosk', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isKiosk();
  mainWindow.setKiosk(next);
  return next;
});

// 5. System Info
ipcMain.handle('get-system-info', () => {
  return {
    platform: process.platform,
    arch: process.arch, // 'x64' or 'ia32'
    osType: os.type(),
    osRelease: os.release(),
    hostname: os.hostname(),
    cpus: os.cpus().length,
    totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
    version: '1.0.0',
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  };
});

// Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});
