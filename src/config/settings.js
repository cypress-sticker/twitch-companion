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
    follow:        { enabled: true,  message: '{user} さんがフォローしました！', soundType: 'default', soundFile: '', volume: 70, image: '', imageSize: 'md', animation: 'slide-up' },
    subscribe:     { enabled: true,  message: '{user} さんがサブスクしました！', soundType: 'default', soundFile: '', volume: 70, image: '', imageSize: 'md', animation: 'slide-up' },
    raid:          { enabled: false, message: '{user} さんからレイド！ {viewers}人', soundType: 'default', soundFile: '', volume: 70, image: '', imageSize: 'md', animation: 'slide-up' },
    bits:          { enabled: false, message: '{user} さんから {amount} Bits！', soundType: 'default', soundFile: '', volume: 70, image: '', imageSize: 'md', animation: 'slide-up' },
    channelPoints: { enabled: false, message: '{user} さんがポイント交換！', soundType: 'default', soundFile: '', volume: 70, image: '', imageSize: 'md', animation: 'slide-up' },
  },
  raidChat: {
    enabled: false,
    messageTemplate: '{user}さんと{viewers}人のみなさんレイドありがとう！{user}さんは{profile}な人で、さっきまでは{game}を配信してたらしいよ！',
    shoutout: false,
  },
  periodicComments: {
    enabled: false,
    intervalMinutes: 30,
    messages: [],
  },
  overlay: {
    port: 3001,
    displayDuration: 5000,
    position: 'bottom-center',
    fontFamily: "'Yu Gothic UI', 'Yu Gothic', sans-serif",
    fontSize: 18,
  },
  theme: 'dark',
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const data = fs.readFileSync(getSettingsPath(), 'utf8');
    const saved = JSON.parse(data);
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      auth: { ...DEFAULT_SETTINGS.auth, ...(saved.auth || {}) },
      alerts: (() => {
        const mergeAlert = (def, saved) => ({
          ...def,
          ...(saved || {}),
          soundType: (saved?.soundType) || (saved?.sound === 'default' ? 'default' : saved?.sound ? 'custom' : 'default'),
        });
        return {
          follow:        mergeAlert(DEFAULT_SETTINGS.alerts.follow,        saved.alerts?.follow),
          subscribe:     mergeAlert(DEFAULT_SETTINGS.alerts.subscribe,     saved.alerts?.subscribe),
          raid:          mergeAlert(DEFAULT_SETTINGS.alerts.raid,          saved.alerts?.raid),
          bits:          mergeAlert(DEFAULT_SETTINGS.alerts.bits,          saved.alerts?.bits),
          channelPoints: mergeAlert(DEFAULT_SETTINGS.alerts.channelPoints, saved.alerts?.channelPoints),
        };
      })(),
      raidChat: { ...DEFAULT_SETTINGS.raidChat, ...(saved.raidChat || {}) },
      periodicComments: { ...DEFAULT_SETTINGS.periodicComments, ...(saved.periodicComments || {}) },
      overlay: { ...DEFAULT_SETTINGS.overlay, ...(saved.overlay || {}) },
    };
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
  // auth と theme はリセット対象外
  const resetData = { ...DEFAULT_SETTINGS, auth: settings.auth, theme: settings.theme || 'dark' };
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
