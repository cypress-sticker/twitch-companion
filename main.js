// main.js
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');

const IPC = require('./src/utils/ipc-channels');
const { loadSettings, saveSettings, exportSettings, importSettings, resetSettings } = require('./src/config/settings');
const { startOAuthFlow, validateToken, getUserInfo } = require('./src/auth/oauth');

let mainWindow = null;
let alertServer = null;
let botServer = null;
let settings = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 720,
    title: 'Twitch Companion',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.webContents.on('did-finish-load', async () => {
    settings = loadSettings();

    if (settings.auth.accessToken) {
      const valid = await validateToken(settings.auth.accessToken);
      if (valid) {
        mainWindow.webContents.send(IPC.AUTH_STATUS, {
          authenticated: true,
          username: settings.auth.broadcasterName,
        });
        startServers();
      } else {
        settings.auth = { accessToken: '', refreshToken: '', broadcasterId: '', broadcasterName: '' };
        saveSettings(settings);
        mainWindow.webContents.send(IPC.AUTH_STATUS, { authenticated: false });
      }
    } else {
      mainWindow.webContents.send(IPC.AUTH_STATUS, { authenticated: false });
    }
  });
}

function createMenu() {
  const template = [
    {
      label: 'ファイル',
      submenu: [{ label: '終了', accelerator: 'Alt+F4', click: () => app.quit() }],
    },
    {
      label: 'ヘルプ',
      submenu: [
        { label: '不具合・お問い合わせ', click: () => shell.openExternal('https://x.com/cypress_sticker') },
        { type: 'separator' },
        { label: 'バージョン情報', click: () => dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'バージョン情報',
          message: 'Twitch Companion',
          detail: `バージョン: ${app.getVersion()}\n\nTwitch配信者向けアラート＆定期コメントツール`,
        }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function startServers() {
  if (settings.alerts.follow.enabled || settings.alerts.subscribe.enabled ||
      settings.alerts.raid.enabled || settings.alerts.bits.enabled ||
      settings.alerts.channelPoints.enabled) {
    startAlertServer();
  }

  if (settings.periodicComments.enabled && settings.periodicComments.messages.length > 0) {
    startBotServer();
  }
}

function startAlertServer() {
  if (alertServer) return;

  alertServer = fork(path.join(__dirname, 'src', 'servers', 'alert-server.js'));

  alertServer.on('message', (msg) => {
    if (msg.type === 'status') {
      mainWindow?.webContents.send(IPC.ALERT_STATUS, msg.status);
    } else if (msg.type === 'event') {
      mainWindow?.webContents.send(IPC.ALERT_EVENT, msg);
    } else if (msg.type === 'log') {
      console.log('[Alert]', msg.message);
    }
  });

  alertServer.send({
    type: 'start',
    config: {
      accessToken: settings.auth.accessToken,
      broadcasterId: settings.auth.broadcasterId,
      settings,
    },
  });
}

function stopAlertServer() {
  if (alertServer) {
    alertServer.send({ type: 'stop' });
    alertServer.kill();
    alertServer = null;
  }
}

function startBotServer() {
  if (botServer) return;

  botServer = fork(path.join(__dirname, 'src', 'servers', 'bot-server.js'));

  botServer.on('message', (msg) => {
    if (msg.type === 'status') {
      mainWindow?.webContents.send(IPC.BOT_STATUS, msg.status);
    } else if (msg.type === 'log') {
      console.log('[Bot]', msg.message);
    }
  });

  botServer.send({
    type: 'start',
    config: {
      accessToken: settings.auth.accessToken,
      broadcasterName: settings.auth.broadcasterName,
      settings,
    },
  });
}

function stopBotServer() {
  if (botServer) {
    botServer.send({ type: 'stop' });
    botServer.kill();
    botServer = null;
  }
}

// IPC Handlers
ipcMain.handle(IPC.AUTH_START_LOGIN, async () => {
  try {
    const tokenData = await startOAuthFlow();
    const user = await getUserInfo(tokenData.access_token);
    if (!user) throw new Error('ユーザー情報の取得に失敗しました');

    settings.auth = {
      accessToken: tokenData.access_token,
      refreshToken: '',
      broadcasterId: user.id,
      broadcasterName: user.login,
    };
    saveSettings(settings);

    mainWindow.webContents.send(IPC.AUTH_LOGIN_SUCCESS, { username: user.login });
    startServers();
    return { ok: true };
  } catch (err) {
    mainWindow.webContents.send(IPC.AUTH_LOGIN_ERROR, err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.on(IPC.AUTH_LOGOUT, () => {
  stopAlertServer();
  stopBotServer();
  settings.auth = { accessToken: '', refreshToken: '', broadcasterId: '', broadcasterName: '' };
  saveSettings(settings);
  mainWindow.webContents.send(IPC.AUTH_STATUS, { authenticated: false });
});

ipcMain.handle(IPC.SETTINGS_LOAD, () => {
  return loadSettings();
});

ipcMain.handle(IPC.SETTINGS_SAVE, (event, newSettings) => {
  settings = { ...settings, ...newSettings };
  const result = saveSettings(settings);

  if (alertServer) alertServer.send({ type: 'update-settings', settings });
  if (botServer) botServer.send({ type: 'update-settings', settings });

  return result;
});

ipcMain.handle(IPC.SETTINGS_EXPORT, async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '設定をエクスポート',
    defaultPath: 'twitch-companion-settings.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled) return { ok: false };
  const success = exportSettings(result.filePath, settings);
  return { ok: success, path: result.filePath };
});

ipcMain.handle(IPC.SETTINGS_IMPORT, async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '設定をインポート',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled) return { ok: false };
  const imported = importSettings(result.filePaths[0]);
  if (!imported) return { ok: false, error: 'ファイルの読み込みに失敗しました' };

  settings = { ...settings, ...imported };
  saveSettings(settings);

  if (alertServer) alertServer.send({ type: 'update-settings', settings });
  if (botServer) botServer.send({ type: 'update-settings', settings });

  return { ok: true, settings };
});

ipcMain.handle(IPC.SETTINGS_RESET, () => {
  settings = resetSettings();
  return settings;
});

ipcMain.on(IPC.ALERT_START, () => startAlertServer());
ipcMain.on(IPC.ALERT_STOP, () => stopAlertServer());
ipcMain.on(IPC.BOT_START, () => startBotServer());
ipcMain.on(IPC.BOT_STOP, () => stopBotServer());

ipcMain.handle(IPC.OVERLAY_URL, () => {
  return `http://localhost:${settings.overlay.port}/overlay`;
});

// App lifecycle
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  stopAlertServer();
  stopBotServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
