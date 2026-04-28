// src/auth/oauth.js
const { BrowserWindow } = require('electron');
const https = require('https');
const crypto = require('crypto');

const CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'qcwtri71a1vzt8dndxmy1sebrz7p5u';
const REDIRECT_URI = 'http://localhost:3000';
const SCOPES = [
  'moderator:read:chatters',
  'moderator:read:followers',
  'channel:read:subscriptions',
  'bits:read',
  'channel:read:redemptions',
  'chat:edit',
  'chat:read',
].join(' ');

function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function validateToken(token) {
  const r = await httpsRequest({
    hostname: 'id.twitch.tv',
    path: '/oauth2/validate',
    headers: { 'Authorization': `OAuth ${token}` },
  });
  return r.status === 200 ? r.data : null;
}

async function getUserInfo(token) {
  const r = await httpsRequest({
    hostname: 'api.twitch.tv',
    path: '/helix/users',
    headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${token}` },
  });
  return r.data?.data?.[0] || null;
}

function startOAuthFlow() {
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);

  return new Promise((resolve, reject) => {
    let completed = false;

    const authWindow = new BrowserWindow({
      width: 520,
      height: 720,
      title: 'Twitchでログイン',
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    authWindow.loadURL(authUrl.toString());

    const handleNavigate = (event, url) => {
      if (completed) return;
      if (!url.startsWith(REDIRECT_URI)) return;
      completed = true;
      authWindow.destroy();

      const hash = new URL(url).hash.slice(1);
      const params = new URLSearchParams(hash);
      const token = params.get('access_token');
      const retState = params.get('state');
      const error = params.get('error');

      if (error) return reject(new Error('ログインがキャンセルされました'));
      if (retState !== state) return reject(new Error('不正なリクエスト'));
      if (!token) return reject(new Error('トークンが取得できませんでした'));

      resolve({ access_token: token });
    };

    authWindow.webContents.on('will-redirect', handleNavigate);
    authWindow.webContents.on('will-navigate', handleNavigate);

    authWindow.on('closed', () => {
      if (!completed) reject(new Error('ログインウィンドウが閉じられました'));
    });
  });
}

module.exports = {
  CLIENT_ID,
  validateToken,
  getUserInfo,
  startOAuthFlow,
};
