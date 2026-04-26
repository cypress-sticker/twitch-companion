// src/utils/ipc-channels.js
module.exports = {
  // Auth
  AUTH_START_LOGIN: 'auth:start-login',
  AUTH_LOGIN_SUCCESS: 'auth:login-success',
  AUTH_LOGIN_ERROR: 'auth:login-error',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_STATUS: 'auth:status',

  // Settings
  SETTINGS_LOAD: 'settings:load',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_EXPORT: 'settings:export',
  SETTINGS_IMPORT: 'settings:import',
  SETTINGS_RESET: 'settings:reset',

  // Alert Server
  ALERT_START: 'alert:start',
  ALERT_STOP: 'alert:stop',
  ALERT_EVENT: 'alert:event',
  ALERT_STATUS: 'alert:status',

  // Bot Server
  BOT_START: 'bot:start',
  BOT_STOP: 'bot:stop',
  BOT_STATUS: 'bot:status',
  BOT_SEND_MESSAGE: 'bot:send-message',

  // Overlay
  OVERLAY_URL: 'overlay:url',
  OVERLAY_SHOW_ALERT: 'overlay:show-alert',

  // Asset File Selection
  ALERT_SELECT_IMAGE: 'alert:select-image',
  ALERT_SELECT_SOUND: 'alert:select-sound',

  // Test
  ALERT_TEST: 'alert:test',
};
