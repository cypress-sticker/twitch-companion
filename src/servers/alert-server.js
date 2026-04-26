// src/servers/alert-server.js
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const https = require('https');
const tmi = require('tmi.js');

const CLIENT_ID = 'qcwtri71a1vzt8dndxmy1sebrz7p5u';

let accessToken = null;
let broadcasterId = null;
let broadcasterName = null;
let settings = null;
let httpServer = null;
let twitchWs = null;
let overlayClients = [];
let sessionId = null;
let tmiClient = null;

const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';

const EVENT_TYPES = {
  'channel.follow': 'follow',
  'channel.subscribe': 'subscribe',
  'channel.subscription.gift': 'subscribe',
  'channel.raid': 'raid',
  'channel.cheer': 'bits',
  'channel.channel_points_custom_reward_redemption.add': 'channelPoints',
};

function log(msg) {
  process.send({ type: 'log', message: msg });
}

function sendStatus(status) {
  process.send({ type: 'status', status });
}

function sendEvent(eventType, data) {
  process.send({ type: 'event', eventType, data });
}

const POSITION_CSS = {
  'top-left':      'top: 20px; left: 20px; align-items: flex-start;',
  'top-center':    'top: 20px; left: 50%; transform: translateX(-50%);',
  'top-right':     'top: 20px; right: 20px; align-items: flex-end;',
  'middle-left':   'top: 50%; left: 20px; transform: translateY(-50%); align-items: flex-start;',
  'center':        'top: 50%; left: 50%; transform: translate(-50%, -50%);',
  'middle-right':  'top: 50%; right: 20px; transform: translateY(-50%); align-items: flex-end;',
  'bottom-left':   'bottom: 20px; left: 20px; align-items: flex-start;',
  'bottom-center': 'bottom: 20px; left: 50%; transform: translateX(-50%);',
  'bottom-right':  'bottom: 20px; right: 20px; align-items: flex-end;',
};

function getOverlayHtml() {
  const ov = settings?.overlay || {};
  const posStyle = POSITION_CSS[ov.position] || POSITION_CSS['bottom-center'];
  const font = ov.fontFamily || "'Yu Gothic UI', sans-serif";
  const fontSize = ov.fontSize || 18;
  const dur = ov.displayDuration || 5000;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: transparent; font-family: ${font}; font-size: ${fontSize}px; overflow: hidden; }
    #alert-container {
      position: fixed;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .alert {
      background: rgba(24, 24, 27, 0.95);
      border: 2px solid #9147ff;
      border-radius: 12px;
      padding: 16px 24px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .alert img.img-sm { width: 32px;  height: 32px;  border-radius: 6px; }
    .alert img.img-md { width: 48px;  height: 48px;  border-radius: 8px; }
    .alert img.img-lg { width: 72px;  height: 72px;  border-radius: 10px; }

    @keyframes slideUpAnim   { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes slideDownAnim { from { transform: translateY(-100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes fadeInAnim    { from { opacity: 0; } to { opacity: 1; } }
    @keyframes zoomInAnim    { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes bounceAnim    { 0% { transform: translateY(100px); opacity: 0; } 60% { transform: translateY(-15px); opacity: 1; } 80% { transform: translateY(8px); } 100% { transform: translateY(0); } }
    @keyframes fadeOut       { to { opacity: 0; transform: translateY(-20px); } }
  </style>
</head>
<body>
  <div id="alert-container"></div>
  <audio id="chime" src="/sounds/chime.mp3"></audio>
  <script>
    const container = document.getElementById('alert-container');
    const chime = document.getElementById('chime');
    let overlaySettings = {
      displayDuration: ${dur},
      position: '${ov.position || 'bottom-center'}',
      fontFamily: ${JSON.stringify(font)},
      fontSize: ${fontSize},
    };

    function applyPosition(pos) {
      const styles = {
        'top-left':      'top: 20px; left: 20px; align-items: flex-start;',
        'top-center':    'top: 20px; left: 50%; transform: translateX(-50%);',
        'top-right':     'top: 20px; right: 20px; align-items: flex-end;',
        'middle-left':   'top: 50%; left: 20px; transform: translateY(-50%); align-items: flex-start;',
        'center':        'top: 50%; left: 50%; transform: translate(-50%, -50%);',
        'middle-right':  'top: 50%; right: 20px; transform: translateY(-50%); align-items: flex-end;',
        'bottom-left':   'bottom: 20px; left: 20px; align-items: flex-start;',
        'bottom-center': 'bottom: 20px; left: 50%; transform: translateX(-50%);',
        'bottom-right':  'bottom: 20px; right: 20px; align-items: flex-end;',
      };
      const s = styles[pos] || styles['bottom-center'];
      container.style.cssText = 'position: fixed; display: flex; flex-direction: column; gap: 10px; ' + s;
    }

    // ページ読み込み時に位置を適用（CSSとの競合を避けるためJSで一元管理）
    applyPosition(overlaySettings.position);

    const ws = new WebSocket('ws://' + location.host);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'alert') showAlert(data);
      if (data.type === 'settings-update') {
        overlaySettings = { ...overlaySettings, ...data.overlay };
        document.body.style.fontFamily = overlaySettings.fontFamily;
        document.body.style.fontSize = overlaySettings.fontSize + 'px';
        applyPosition(overlaySettings.position);
      }
    };

    function showAlert(data) {
      // アラートと一緒に位置情報が来た場合は即時反映
      if (data.position) applyPosition(data.position);

      const dur = overlaySettings.displayDuration || 5000;
      const fadeDelay = (dur - 500) / 1000;
      const removeDelay = dur + 500;

      const div = document.createElement('div');
      div.className = 'alert';

      const animMap = {
        'slide-up':   \`slideUpAnim   0.3s ease-out forwards, fadeOut 0.5s ease-in \${fadeDelay}s forwards\`,
        'slide-down': \`slideDownAnim 0.3s ease-out forwards, fadeOut 0.5s ease-in \${fadeDelay}s forwards\`,
        'fade-in':    \`fadeInAnim    0.5s ease-out forwards, fadeOut 0.5s ease-in \${fadeDelay}s forwards\`,
        'zoom-in':    \`zoomInAnim    0.3s ease-out forwards, fadeOut 0.5s ease-in \${fadeDelay}s forwards\`,
        'bounce':     \`bounceAnim    0.7s ease-out forwards, fadeOut 0.5s ease-in \${fadeDelay}s forwards\`,
      };
      div.style.animation = animMap[data.animation] || animMap['slide-up'];

      if (data.image) {
        const img = document.createElement('img');
        img.src = '/custom/' + data.image;
        img.className = 'img-' + (data.imageSize || 'md');
        div.appendChild(img);
      }

      const text = document.createElement('span');
      text.textContent = data.message;
      div.appendChild(text);
      container.appendChild(div);

      if (data.soundType !== 'none') {
        let audio;
        if (data.soundType === 'custom' && data.soundFile) {
          audio = new Audio('/custom/' + data.soundFile);
        } else {
          audio = chime;
        }
        audio.volume = Math.max(0, Math.min(1, (data.volume ?? 70) / 100));
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }

      setTimeout(() => div.remove(), removeDelay);
    }
  </script>
</body>
</html>`;
}

function startHttpServer(port) {
  const assetsPath = path.join(__dirname, '..', '..', 'assets');

  httpServer = http.createServer((req, res) => {
    if (req.url === '/overlay' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getOverlayHtml());
    } else if (req.url === '/sounds/chime.mp3') {
      const soundPath = path.join(assetsPath, 'sounds', 'chime.mp3');
      if (fs.existsSync(soundPath)) {
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        fs.createReadStream(soundPath).pipe(res);
      } else {
        res.writeHead(404);
        res.end();
      }
    } else if (req.url.startsWith('/custom/')) {
      const filePath = path.join(assetsPath, decodeURIComponent(req.url.slice(1)));
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.mp3': 'audio/mpeg' };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end();
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const wss = new WebSocket.Server({ server: httpServer });
  wss.on('connection', (ws) => {
    overlayClients.push(ws);
    ws.on('close', () => {
      overlayClients = overlayClients.filter(c => c !== ws);
    });
  });

  httpServer.listen(port, () => {
    log(`HTTP server listening on port ${port}`);
  });
}

function broadcastToOverlay(data) {
  const message = JSON.stringify(data);
  overlayClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

async function subscribeToEvent(type, condition) {
  const body = JSON.stringify({
    type,
    version: type === 'channel.follow' ? '2' : '1',
    condition,
    transport: { method: 'websocket', session_id: sessionId },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.twitch.tv',
      path: '/helix/eventsub/subscriptions',
      method: 'POST',
      headers: {
        'Client-Id': CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 202) {
          log(`Subscribed to ${type}`);
          resolve(true);
        } else {
          log(`Failed to subscribe to ${type}: ${data}`);
          resolve(false);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchChannelInfo(userId) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.twitch.tv',
      path: `/helix/channels?broadcaster_id=${userId}`,
      method: 'GET',
      headers: {
        'Client-Id': CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.data?.[0] || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function fetchUserProfile(userId) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.twitch.tv',
      path: `/helix/users?id=${userId}`,
      method: 'GET',
      headers: {
        'Client-Id': CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.data?.[0] || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function ensureTmiConnected() {
  if (tmiClient) return;
  tmiClient = new tmi.Client({
    options: { debug: false },
    identity: {
      username: broadcasterName,
      password: `oauth:${accessToken}`,
    },
    channels: [broadcasterName],
  });
  try {
    await tmiClient.connect();
    log(`TMI connected as ${broadcasterName}`);
  } catch (err) {
    log(`TMI connect failed: ${err.message}`);
    tmiClient = null;
  }
}

async function sendRaidChat(template, event, channelInfo, userProfile, doShoutout) {
  if (!template || !template.trim()) return;
  if (!broadcasterName) return;

  const userName = event.from_broadcaster_user_name || 'Someone';
  const userLogin = event.from_broadcaster_user_login || userName;
  const game    = channelInfo?.game_name || '不明';
  const title   = channelInfo?.title || '';
  const profile = userProfile?.description || '';

  const message = template
    .replace(/\{user\}/g,    userName)
    .replace(/\{viewers\}/g, String(event.viewers || '0'))
    .replace(/\{game\}/g,    game)
    .replace(/\{title\}/g,   title)
    .replace(/\{profile\}/g, profile);

  await ensureTmiConnected();
  if (!tmiClient) return;

  try {
    await tmiClient.say(broadcasterName, message);
    log(`Raid chat sent: ${message}`);

    if (doShoutout && userLogin) {
      await tmiClient.say(broadcasterName, `/shoutout ${userLogin}`);
      log(`Shoutout sent: /shoutout ${userLogin}`);
    }
  } catch (err) {
    log(`Raid chat failed: ${err.message}`);
  }
}

function connectToEventSub() {
  twitchWs = new WebSocket(EVENTSUB_URL);

  twitchWs.on('open', () => {
    log('Connected to EventSub');
  });

  twitchWs.on('message', async (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.metadata.message_type === 'session_welcome') {
      sessionId = msg.payload.session.id;
      log(`Session ID: ${sessionId}`);

      const condition = { broadcaster_user_id: broadcasterId };
      await subscribeToEvent('channel.follow', { ...condition, moderator_user_id: broadcasterId });
      await subscribeToEvent('channel.subscribe', condition);
      await subscribeToEvent('channel.subscription.gift', condition);
      await subscribeToEvent('channel.raid', { to_broadcaster_user_id: broadcasterId });
      await subscribeToEvent('channel.cheer', condition);
      await subscribeToEvent('channel.channel_points_custom_reward_redemption.add', condition);

      sendStatus('connected');
    }

    if (msg.metadata.message_type === 'notification') {
      const eventType = EVENT_TYPES[msg.metadata.subscription_type];
      if (eventType && settings.alerts[eventType]?.enabled) {
        const event = msg.payload.event;
        const alertConfig = settings.alerts[eventType];

        let message = alertConfig.message
          .replace('{user}', event.user_name || event.from_broadcaster_user_name || 'Someone')
          .replace('{viewers}', event.viewers || '')
          .replace('{amount}', event.bits || '');

        broadcastToOverlay({
          type: 'alert',
          message,
          soundType: alertConfig.soundType || 'default',
          soundFile: alertConfig.soundFile || '',
          volume: alertConfig.volume ?? 70,
          image: alertConfig.image ? path.basename(alertConfig.image) : null,
          imageSize: alertConfig.imageSize || 'md',
          animation: alertConfig.animation || 'slide-up',
          position: settings?.overlay?.position || 'bottom-center',
        });

        sendEvent(eventType, { message, user: event.user_name });

        // レイド時：チャンネル情報・プロフィールを取得してお礼チャットを投稿
        if (eventType === 'raid' && settings.raidChat?.enabled) {
          Promise.all([
            fetchChannelInfo(event.from_broadcaster_user_id),
            fetchUserProfile(event.from_broadcaster_user_id),
          ]).then(([channelInfo, userProfile]) => {
            sendRaidChat(
              settings.raidChat.messageTemplate,
              event,
              channelInfo,
              userProfile,
              settings.raidChat.shoutout,
            );
          });
        }
      }
    }

    if (msg.metadata.message_type === 'session_reconnect') {
      log('Reconnecting to EventSub...');
      twitchWs.close();
      connectToEventSub();
    }
  });

  twitchWs.on('close', () => {
    log('Disconnected from EventSub');
    sendStatus('disconnected');
  });

  twitchWs.on('error', (err) => {
    log(`EventSub error: ${err.message}`);
  });
}

function start(config) {
  accessToken = config.accessToken;
  broadcasterId = config.broadcasterId;
  broadcasterName = config.broadcasterName;
  settings = config.settings;

  startHttpServer(settings.overlay.port);
  connectToEventSub();
}

function stop() {
  if (twitchWs) {
    twitchWs.close();
    twitchWs = null;
  }
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
  if (tmiClient) {
    tmiClient.disconnect();
    tmiClient = null;
  }
  overlayClients = [];
  sendStatus('stopped');
}

const FAKE_EVENTS = {
  follow:        { user_name: 'test_user' },
  subscribe:     { user_name: 'test_user' },
  raid:          { from_broadcaster_user_name: 'test_channel', from_broadcaster_user_login: 'test_channel', from_broadcaster_user_id: '0', viewers: 10 },
  bits:          { user_name: 'test_user', bits: 100 },
  channelPoints: { user_name: 'test_user' },
};

const FAKE_CHANNEL_INFO  = { game_name: 'テストゲーム', title: 'テスト配信タイトル' };
const FAKE_USER_PROFILE  = { description: 'ゲーム実況メインの配信者' };

function handleTestAlert(key) {
  const alertConfig = settings?.alerts?.[key];
  if (!alertConfig) return;

  const event = FAKE_EVENTS[key];
  if (!event) return;

  const message = (alertConfig.message || '')
    .replace('{user}', event.user_name || event.from_broadcaster_user_name || 'test_user')
    .replace('{viewers}', event.viewers || '10')
    .replace('{amount}', event.bits || '100');

  broadcastToOverlay({
    type: 'alert',
    message,
    soundType: alertConfig.soundType || 'default',
    soundFile: alertConfig.soundFile || '',
    volume: alertConfig.volume ?? 70,
    image: alertConfig.image ? path.basename(alertConfig.image) : null,
    imageSize: alertConfig.imageSize || 'md',
    animation: alertConfig.animation || 'slide-up',
    position: settings?.overlay?.position || 'bottom-center',
  });

  // レイドのお礼チャットテスト
  if (key === 'raid' && settings.raidChat?.enabled) {
    sendRaidChat(
      settings.raidChat.messageTemplate,
      event,
      FAKE_CHANNEL_INFO,
      FAKE_USER_PROFILE,
      settings.raidChat.shoutout,
    );
  }

  log(`Test alert fired: ${key}`);
}

process.on('message', (msg) => {
  if (msg.type === 'start') {
    start(msg.config);
  } else if (msg.type === 'stop') {
    stop();
  } else if (msg.type === 'update-settings') {
    settings = msg.settings;
    broadcastToOverlay({ type: 'settings-update', overlay: settings.overlay });
  } else if (msg.type === 'test-alert') {
    handleTestAlert(msg.key);
  }
});

process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}`);
});
