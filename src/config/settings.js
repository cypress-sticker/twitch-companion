// src/config/settings.js
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_SETTINGS = {
  auth: {
    accessToken: '',
    refreshToken: '',
    broadcasterId: '',
    broadcasterName: '',
  },
  alerts: {
    follow:        { enabled: true, message: '{user} さんがフォローしました！', sound: 'default', image: '' },
    subscribe:     { enabled: true, message: '{user} さんがサブスクしました！', sound: 'default', image: '' },
    raid:          { enabled: false, message: '{user} さんからレイド！ {viewers}人', sound: 'default', image: '' },
    bits:          { enabled: false, message: '{user} さんから {amount} Bits！', sound: 'default', image: '' },
    channelPoints: { enabled: false, message: '{user} さんがポイント交換！', sound: 'default', image: '' },
  },
  periodicComments: {
    enabled: false,
    intervalMinutes: 30,
    messages: [],
  },
  overlay: {
    port: 3001,
    displayDuration: 5000,
    animation: 'slide-up',
  },
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const data = fs.readFileSync(getSettingsPath(), 'utf8');
    const saved = JSON.parse(data);
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function exportSettings(filePath, settings) {
  const exportData = { ...settings };
  delete exportData.auth;
  try {
    fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function importSettings(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const imported = JSON.parse(data);
    delete imported.auth;
    return imported;
  } catch {
    return null;
  }
}

function resetSettings() {
  const settings = loadSettings();
  const resetData = { ...DEFAULT_SETTINGS, auth: settings.auth };
  saveSettings(resetData);
  return resetData;
}

module.exports = {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  exportSettings,
  importSettings,
  resetSettings,
};
