// src/servers/bot-server.js
const tmi = require('tmi.js');

let client = null;
let settings = null;
let broadcasterName = null;
let messageIndex = 0;
let intervalTimer = null;

function log(msg) {
  process.send({ type: 'log', message: msg });
}

function sendStatus(status) {
  process.send({ type: 'status', status });
}

function sendNextMessage() {
  if (!settings.periodicComments.enabled) return;
  if (settings.periodicComments.messages.length === 0) return;

  const message = settings.periodicComments.messages[messageIndex];
  if (message && message.trim()) {
    client.say(broadcasterName, message).then(() => {
      log(`Sent: ${message}`);
    }).catch((err) => {
      log(`Failed to send: ${err.message}`);
    });
  }

  messageIndex = (messageIndex + 1) % settings.periodicComments.messages.length;
}

function startInterval() {
  stopInterval();
  if (!settings.periodicComments.enabled) return;
  if (settings.periodicComments.messages.length === 0) return;

  const intervalMs = settings.periodicComments.intervalMinutes * 60 * 1000;
  intervalTimer = setInterval(sendNextMessage, intervalMs);
  log(`Periodic comments started: every ${settings.periodicComments.intervalMinutes} minutes`);
}

function stopInterval() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
}

async function start(config) {
  settings = config.settings;
  broadcasterName = config.broadcasterName;

  client = new tmi.Client({
    options: { debug: false },
    identity: {
      username: broadcasterName,
      password: `oauth:${config.accessToken}`,
    },
    channels: [broadcasterName],
  });

  try {
    await client.connect();
    log(`Connected to chat as ${broadcasterName}`);
    sendStatus('connected');
    startInterval();
  } catch (err) {
    log(`Failed to connect: ${err.message}`);
    sendStatus('error');
  }
}

function stop() {
  stopInterval();
  if (client) {
    client.disconnect();
    client = null;
  }
  sendStatus('stopped');
}

process.on('message', (msg) => {
  if (msg.type === 'start') {
    start(msg.config);
  } else if (msg.type === 'stop') {
    stop();
  } else if (msg.type === 'update-settings') {
    settings = msg.settings;
    startInterval();
  } else if (msg.type === 'send-message') {
    if (client && msg.message) {
      client.say(broadcasterName, msg.message).catch((err) => {
        log(`Failed to send: ${err.message}`);
      });
    }
  }
});

process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}`);
});
