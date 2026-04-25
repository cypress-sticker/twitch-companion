// preload.js
const { contextBridge, ipcRenderer } = require('electron');
const IPC = require('./src/utils/ipc-channels');

contextBridge.exposeInMainWorld('api', {
  // Auth
  startLogin: () => ipcRenderer.invoke(IPC.AUTH_START_LOGIN),
  logout: () => ipcRenderer.send(IPC.AUTH_LOGOUT),
  onLoginSuccess: (cb) => {
    ipcRenderer.removeAllListeners(IPC.AUTH_LOGIN_SUCCESS);
    ipcRenderer.on(IPC.AUTH_LOGIN_SUCCESS, (e, data) => cb(data));
  },
  onLoginError: (cb) => {
    ipcRenderer.removeAllListeners(IPC.AUTH_LOGIN_ERROR);
    ipcRenderer.on(IPC.AUTH_LOGIN_ERROR, (e, msg) => cb(msg));
  },
  onAuthStatus: (cb) => {
    ipcRenderer.removeAllListeners(IPC.AUTH_STATUS);
    ipcRenderer.on(IPC.AUTH_STATUS, (e, data) => cb(data));
  },

  // Settings
  loadSettings: () => ipcRenderer.invoke(IPC.SETTINGS_LOAD),
  saveSettings: (settings) => ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings),
  exportSettings: () => ipcRenderer.invoke(IPC.SETTINGS_EXPORT),
  importSettings: () => ipcRenderer.invoke(IPC.SETTINGS_IMPORT),
  resetSettings: () => ipcRenderer.invoke(IPC.SETTINGS_RESET),

  // Alert Server
  startAlertServer: () => ipcRenderer.send(IPC.ALERT_START),
  stopAlertServer: () => ipcRenderer.send(IPC.ALERT_STOP),
  onAlertEvent: (cb) => {
    ipcRenderer.removeAllListeners(IPC.ALERT_EVENT);
    ipcRenderer.on(IPC.ALERT_EVENT, (e, data) => cb(data));
  },
  onAlertStatus: (cb) => {
    ipcRenderer.removeAllListeners(IPC.ALERT_STATUS);
    ipcRenderer.on(IPC.ALERT_STATUS, (e, data) => cb(data));
  },

  // Bot Server
  startBotServer: () => ipcRenderer.send(IPC.BOT_START),
  stopBotServer: () => ipcRenderer.send(IPC.BOT_STOP),
  onBotStatus: (cb) => {
    ipcRenderer.removeAllListeners(IPC.BOT_STATUS);
    ipcRenderer.on(IPC.BOT_STATUS, (e, data) => cb(data));
  },

  // Overlay
  getOverlayUrl: () => ipcRenderer.invoke(IPC.OVERLAY_URL),
  selectAlertImage: () => ipcRenderer.invoke(IPC.ALERT_SELECT_IMAGE),
  selectAlertSound: () => ipcRenderer.invoke(IPC.ALERT_SELECT_SOUND),
  onShowAlert: (cb) => {
    ipcRenderer.removeAllListeners(IPC.OVERLAY_SHOW_ALERT);
    ipcRenderer.on(IPC.OVERLAY_SHOW_ALERT, (e, data) => cb(data));
  },

  // Cleanup
  removeAllListeners: () => {
    Object.values(IPC).forEach(channel => ipcRenderer.removeAllListeners(channel));
  },
});
