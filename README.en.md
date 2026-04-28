# Coretan (コアたん)

**The all-in-one companion app for Twitch streamers**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-lightgrey.svg)](https://github.com/cypress_sticker/twitch-companion/releases)
[![Version](https://img.shields.io/badge/Version-0.1.1-green.svg)](https://github.com/cypress_sticker/twitch-companion/releases)

[日本語 README](README.md)

Coretan is a free desktop app for Twitch streamers. Display real-time alerts in OBS for follows, subs, raids, and more — while auto-posting scheduled messages to your chat. Everything you need, in one place.

> ⚠️ **Windows only** at this time.

---

## Features

### Alert Notifications
Display follow, sub, raid, Bits, and channel point alerts in your OBS overlay in real time.

- 5 animation styles (slide, fade, bounce, and more)
- Customizable image, sound effect, volume, and size per alert type
- Flexible message editor with tag-based chips (`{user}`, `{viewers}`, etc.)

### Scheduled Comments
Auto-post up to 5 messages to chat on a timer. Set the interval from 1 to 120 minutes.

### Raid Auto-Reply
When a raid arrives, automatically post a welcome message to chat — optionally including the raiding streamer's info.

### OBS Overlay
Just add `http://localhost:3001/overlay` as a browser source in OBS. No extra setup needed.

### More
- Dark / Light mode
- 7 font options
- Customizable overlay position and display duration

---

## Download

Grab the latest `.exe` or `.zip` from [Releases](https://github.com/cypress_sticker/twitch-companion/releases).

> **About the Windows warning on first launch**  
> Windows may show a "Windows protected your PC" dialog. Click "More info" → "Run anyway" to proceed. This appears because the app is not code-signed — it is not a virus.

---

## Usage

1. Run the installer (`.exe`) and launch the app
2. Click **"Login with Twitch"** and authorize
3. Configure your alerts and scheduled comments, then click **"Save"**
4. In OBS, add `http://localhost:3001/overlay` as a browser source

---

## Development Setup

### Requirements
- [Node.js](https://nodejs.org/) 18+
- A Twitch Developer Application (create one at [dev.twitch.tv/console](https://dev.twitch.tv/console))

### Steps

```bash
git clone https://github.com/cypress_sticker/twitch-companion.git
cd twitch-companion
npm install
```

Copy `.env.example` to `.env` and fill in your Twitch Client ID:

```bash
cp .env.example .env
# Edit .env and set TWITCH_CLIENT_ID
```

In the Twitch Developer Console, set the following:
- **OAuth Redirect URL**: `http://localhost:3000`

```bash
npm start
```

### Build

```bash
npm run build
```

Output goes to `release/` — an installer (`.exe`) and a portable archive (`.zip`).

---

## Architecture

```
main.js                  ← Electron main process
preload.js               ← IPC bridge (context bridge)
renderer/                ← Front-end (HTML / CSS / JS)
src/
  auth/oauth.js          ← Twitch OAuth (Implicit Flow)
  config/settings.js     ← Settings persistence (userData/settings.json)
  servers/
    alert-server.js      ← EventSub WebSocket + HTTP overlay server
    bot-server.js        ← Scheduled comments (tmi.js)
  utils/ipc-channels.js  ← IPC channel constants
assets/                  ← Icons and default sound effects
```

---

## Contributing

Bug reports, feature requests, and pull requests are all welcome!  
See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## License

[MIT](LICENSE) © cypress_sticker
