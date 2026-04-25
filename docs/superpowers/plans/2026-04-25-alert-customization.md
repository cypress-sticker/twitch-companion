# アラートカスタマイズ実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アラートイベントごとに画像・効果音（音量スライダー＋テスト再生）・メッセージ・アニメーションを個別設定できるモーダルUIを実装する

**Architecture:** ホーム画面の各アラート行に「設定⚙」ボタンを追加し、クリックで1つのモーダルをイベントに応じて動的に表示。設定はsettings.jsonに保存し、オーバーレイ（alert-server.js）側も新フィールドに対応。画像・効果音ファイルはmain.jsでIPC経由にてassets/custom/にコピー後、HTTPサーバーが配信する。

**Tech Stack:** Electron IPC, HTML5 Audio API, CSS animations, dialog.showOpenDialog, Node.js fs.copyFileSync

---

## ファイル構成

```
修正ファイル:
├── src/config/settings.js       # DEFAULT_SETTINGSにsoundType/soundFile/volume/imageSize/animationを追加
├── src/utils/ipc-channels.js    # ALERT_SELECT_IMAGE / ALERT_SELECT_SOUND チャンネルを追加
├── src/servers/alert-server.js  # getOverlayHtml()を更新: 5種アニメーション/3サイズ/音量対応
├── main.js                      # fs追加、ファイル選択IPCハンドラ追加
├── preload.js                   # selectAlertImage / selectAlertSound を公開
├── renderer/index.html          # アラート設定モーダルHTML + 各行に「設定⚙」ボタン追加
├── renderer/styles.css          # モーダル・サイズボタン・アニメーションボタンのスタイル追加
└── renderer/app.js              # モーダルのopen/close/save/preview/testPlay ロジック追加
```

---

## Task 1: 設定スキーマ拡張 + IPCチャンネル追加

**Files:**
- Modify: `src/config/settings.js`
- Modify: `src/utils/ipc-channels.js`

### 変更概要

各アラートタイプに以下フィールドを追加する：
- `soundType`: `'default'` | `'custom'` | `'none'`（既存の`sound`フィールドを置き換え）
- `soundFile`: `''`（カスタム効果音のファイル名、assets/custom/以下）
- `volume`: `70`（0〜100の整数）
- `imageSize`: `'md'`（`'sm'` | `'md'` | `'lg'`）
- `animation`: `'slide-up'`（`'slide-up'` | `'slide-down'` | `'fade-in'` | `'zoom-in'` | `'bounce'`）

- [ ] **Step 1: settings.js の DEFAULT_SETTINGS を更新**

`src/config/settings.js` の `DEFAULT_SETTINGS.alerts` を以下に書き換える:

```javascript
alerts: {
  follow:        { enabled: true,  message: '{user} さんがフォローしました！', soundType: 'default', soundFile: '', volume: 70, image: '', imageSize: 'md', animation: 'slide-up' },
  subscribe:     { enabled: true,  message: '{user} さんがサブスクしました！', soundType: 'default', soundFile: '', volume: 70, image: '', imageSize: 'md', animation: 'slide-up' },
  raid:          { enabled: false, message: '{user} さんからレイド！ {viewers}人', soundType: 'default', soundFile: '', volume: 70, image: '', imageSize: 'md', animation: 'slide-up' },
  bits:          { enabled: false, message: '{user} さんから {amount} Bits！', soundType: 'default', soundFile: '', volume: 70, image: '', imageSize: 'md', animation: 'slide-up' },
  channelPoints: { enabled: false, message: '{user} さんがポイント交換！', soundType: 'default', soundFile: '', volume: 70, image: '', imageSize: 'md', animation: 'slide-up' },
},
```

また `overlay` からグローバル `animation` フィールドを削除（個別設定に移行）:
```javascript
overlay: {
  port: 3001,
  displayDuration: 5000,
},
```

- [ ] **Step 2: loadSettings() のディープマージを更新**

`loadSettings()` 内の `alerts` マージ部分を更新（新フィールドがデフォルト値で埋まるよう）。既存の `sound` フィールドが保存されている場合は `soundType: 'default'` として扱う（後方互換）:

```javascript
const mergeAlert = (def, saved) => ({
  ...def,
  ...(saved || {}),
  // 旧フォーマット後方互換: sound フィールドがあって soundType がない場合
  soundType: (saved?.soundType) || (saved?.sound === 'default' ? 'default' : saved?.sound ? 'custom' : 'default'),
});

return {
  ...DEFAULT_SETTINGS,
  ...saved,
  auth: { ...DEFAULT_SETTINGS.auth, ...(saved.auth || {}) },
  alerts: {
    follow:        mergeAlert(DEFAULT_SETTINGS.alerts.follow,        saved.alerts?.follow),
    subscribe:     mergeAlert(DEFAULT_SETTINGS.alerts.subscribe,     saved.alerts?.subscribe),
    raid:          mergeAlert(DEFAULT_SETTINGS.alerts.raid,          saved.alerts?.raid),
    bits:          mergeAlert(DEFAULT_SETTINGS.alerts.bits,          saved.alerts?.bits),
    channelPoints: mergeAlert(DEFAULT_SETTINGS.alerts.channelPoints, saved.alerts?.channelPoints),
  },
  periodicComments: { ...DEFAULT_SETTINGS.periodicComments, ...(saved.periodicComments || {}) },
  overlay: { ...DEFAULT_SETTINGS.overlay, ...(saved.overlay || {}) },
};
```

- [ ] **Step 3: ipc-channels.js にチャンネルを追加**

`src/utils/ipc-channels.js` の末尾（`OVERLAY_SHOW_ALERT` の後）に追加:

```javascript
// Asset File Selection
ALERT_SELECT_IMAGE: 'alert:select-image',
ALERT_SELECT_SOUND: 'alert:select-sound',
```

- [ ] **Step 4: コミット**

```bash
git add src/config/settings.js src/utils/ipc-channels.js
git commit -m "feat: extend alert settings schema with soundType/volume/imageSize/animation"
```

---

## Task 2: main.js + preload.js 拡張（ファイル選択IPC）

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

### 変更概要

ユーザーが画像・効果音ファイルを選択したとき、main.jsでダイアログを開き、選択ファイルを `assets/custom/` にコピーしてファイル名を返す。

- [ ] **Step 1: main.js に fs を追加**

`main.js` 先頭の require ブロックに追加:

```javascript
const fs = require('fs');
```

- [ ] **Step 2: main.js にファイル選択IPCハンドラを追加**

`main.js` の既存IPCハンドラ群（`ipcMain.handle(IPC.OVERLAY_URL, ...)` の後）に追記:

```javascript
ipcMain.handle(IPC.ALERT_SELECT_IMAGE, async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '画像を選択',
    filters: [{ name: '画像ファイル', extensions: ['png', 'jpg', 'jpeg', 'gif'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const srcPath = result.filePaths[0];
  const destDir = path.join(__dirname, 'assets', 'custom');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const filename = path.basename(srcPath);
  const destPath = path.join(destDir, filename);
  fs.copyFileSync(srcPath, destPath);
  return filename;
});

ipcMain.handle(IPC.ALERT_SELECT_SOUND, async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '効果音を選択',
    filters: [{ name: '音声ファイル', extensions: ['mp3', 'wav', 'ogg'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const srcPath = result.filePaths[0];
  const destDir = path.join(__dirname, 'assets', 'custom');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const filename = path.basename(srcPath);
  const destPath = path.join(destDir, filename);
  fs.copyFileSync(srcPath, destPath);
  return filename;
});
```

- [ ] **Step 3: preload.js にメソッドを追加**

`preload.js` の `getOverlayUrl` の後に追加:

```javascript
selectAlertImage: () => ipcRenderer.invoke(IPC.ALERT_SELECT_IMAGE),
selectAlertSound: () => ipcRenderer.invoke(IPC.ALERT_SELECT_SOUND),
```

- [ ] **Step 4: コミット**

```bash
git add main.js preload.js
git commit -m "feat: add IPC handlers for image/sound file selection"
```

---

## Task 3: オーバーレイ更新（5種アニメーション・3サイズ・音量対応）

**Files:**
- Modify: `src/servers/alert-server.js`

### 変更概要

`getOverlayHtml()` のCSS/JSを更新し、イベントごとの `animation`・`imageSize`・`volume`・`soundType`・`soundFile` フィールドに対応する。

- [ ] **Step 1: getOverlayHtml() の CSS を更新**

`alert-server.js` の `getOverlayHtml()` 内のCSS `<style>` ブロックを以下に置き換える:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: transparent; font-family: 'Segoe UI', sans-serif; overflow: hidden; }
#alert-container {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}
.alert {
  background: rgba(24, 24, 27, 0.95);
  border: 2px solid #9147ff;
  border-radius: 12px;
  padding: 16px 24px;
  color: #fff;
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.alert img.img-sm { width: 32px;  height: 32px;  border-radius: 6px; }
.alert img.img-md { width: 48px;  height: 48px;  border-radius: 8px; }
.alert img.img-lg { width: 72px;  height: 72px;  border-radius: 10px; }

/* アニメーション: 入場 */
.alert.slide-up   { animation: slideUpAnim   0.3s ease-out forwards, fadeOut 0.5s ease-in 4.5s forwards; }
.alert.slide-down { animation: slideDownAnim 0.3s ease-out forwards, fadeOut 0.5s ease-in 4.5s forwards; }
.alert.fade-in    { animation: fadeInAnim    0.5s ease-out forwards, fadeOut 0.5s ease-in 4.5s forwards; }
.alert.zoom-in    { animation: zoomInAnim    0.3s ease-out forwards, fadeOut 0.5s ease-in 4.5s forwards; }
.alert.bounce     { animation: bounceAnim    0.7s ease-out forwards, fadeOut 0.5s ease-in 4.5s forwards; }

@keyframes slideUpAnim   { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes slideDownAnim { from { transform: translateY(-100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes fadeInAnim    { from { opacity: 0; } to { opacity: 1; } }
@keyframes zoomInAnim    { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes bounceAnim    { 0% { transform: translateY(100px); opacity: 0; } 60% { transform: translateY(-15px); opacity: 1; } 80% { transform: translateY(8px); } 100% { transform: translateY(0); } }
@keyframes fadeOut       { to { opacity: 0; transform: translateY(-20px); } }
```

- [ ] **Step 2: getOverlayHtml() の JS showAlert() を更新**

`<script>` ブロックの `showAlert(data)` 関数を以下に置き換える:

```javascript
function showAlert(data) {
  const div = document.createElement('div');
  div.className = 'alert ' + (data.animation || 'slide-up');

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

  // 効果音
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

  setTimeout(() => div.remove(), 5500);
}
```

- [ ] **Step 3: notification ハンドラで新フィールドを送信するよう更新**

`alert-server.js` の `connectToEventSub()` 内、notification 処理の `broadcastToOverlay()` 呼び出しを更新:

```javascript
broadcastToOverlay({
  type: 'alert',
  message,
  soundType: alertConfig.soundType || 'default',
  soundFile: alertConfig.soundFile || '',
  volume: alertConfig.volume ?? 70,
  image: alertConfig.image ? path.basename(alertConfig.image) : null,
  imageSize: alertConfig.imageSize || 'md',
  animation: alertConfig.animation || 'slide-up',
});
```

- [ ] **Step 4: コミット**

```bash
git add src/servers/alert-server.js
git commit -m "feat: overlay supports 5 animations, 3 image sizes, per-event volume"
```

---

## Task 4: UI — モーダル・スタイル・ロジック

**Files:**
- Modify: `renderer/index.html`
- Modify: `renderer/styles.css`
- Modify: `renderer/app.js`

### 変更概要

ホームのアラート行に「設定⚙」ボタンを追加。クリックで共通モーダルを動的に表示。モーダルにプレビュー・画像・効果音・アニメーション・メッセージの各設定セクションを配置。

---

- [ ] **Step 1: renderer/styles.css にモーダルスタイルを追加**

`styles.css` の末尾に以下を追加:

```css
/* ───── Modal ───── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: #18181b;
  border: 1px solid #2a2a2e;
  border-radius: 16px;
  width: 520px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 18px;
  font-weight: 600;
}
.modal-close {
  background: transparent;
  border: none;
  color: #adadb8;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
}
.modal-close:hover { color: #fff; }
.modal-section { display: flex; flex-direction: column; gap: 8px; }
.modal-section-label {
  font-size: 12px;
  font-weight: 600;
  color: #adadb8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 4px;
}

/* Preview */
.modal-preview-area {
  background: #0e0e10;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  min-height: 80px;
}
.alert-preview {
  background: rgba(24, 24, 27, 0.95);
  border: 2px solid #9147ff;
  border-radius: 12px;
  padding: 12px 20px;
  color: #fff;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.alert-preview img.img-sm { width: 32px; height: 32px; border-radius: 6px; }
.alert-preview img.img-md { width: 48px; height: 48px; border-radius: 8px; }
.alert-preview img.img-lg { width: 72px; height: 72px; border-radius: 10px; }

/* アニメーションプレビュー用 */
@keyframes previewSlideUp   { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes previewSlideDown { from { transform: translateY(-30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes previewFadeIn    { from { opacity: 0; } to { opacity: 1; } }
@keyframes previewZoomIn    { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes previewBounce    { 0% { transform: translateY(30px); opacity: 0; } 60% { transform: translateY(-8px); opacity: 1; } 80% { transform: translateY(4px); } 100% { transform: translateY(0); } }

.alert-preview.anim-slide-up   { animation: previewSlideUp   0.4s ease-out forwards; }
.alert-preview.anim-slide-down { animation: previewSlideDown 0.4s ease-out forwards; }
.alert-preview.anim-fade-in    { animation: previewFadeIn    0.5s ease-out forwards; }
.alert-preview.anim-zoom-in    { animation: previewZoomIn    0.4s ease-out forwards; }
.alert-preview.anim-bounce     { animation: previewBounce    0.6s ease-out forwards; }

/* Size Selector */
.size-selector { display: flex; gap: 4px; }
.size-btn {
  background: #2a2a2e;
  border: 1px solid #3a3a3e;
  color: #adadb8;
  width: 36px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
.size-btn.active, .size-btn:hover { background: #9147ff; border-color: #9147ff; color: #fff; }

/* Animation Selector */
.anim-selector { display: flex; flex-wrap: wrap; gap: 6px; }
.anim-btn {
  background: #2a2a2e;
  border: 1px solid #3a3a3e;
  color: #adadb8;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.anim-btn.active, .anim-btn:hover { background: #9147ff; border-color: #9147ff; color: #fff; }

/* Radio */
.radio-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.radio-label { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
.radio-label input { accent-color: #9147ff; cursor: pointer; }

/* Volume Row */
.volume-row { display: flex; align-items: center; gap: 10px; }
.volume-row input[type="range"] { flex: 1; accent-color: #9147ff; }
.volume-value { font-size: 12px; min-width: 36px; color: #adadb8; }

/* Alert row 設定ボタン */
.alert-settings-btn {
  background: transparent;
  border: 1px solid #3a3a3e;
  color: #adadb8;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.alert-settings-btn:hover { border-color: #9147ff; color: #9147ff; }

/* Variable hint */
.var-hint { font-size: 11px; color: #6a6a6e; margin-top: 2px; }
```

- [ ] **Step 2: renderer/index.html — ホームのアラート行に「設定⚙」ボタンを追加**

ホーム画面の5つの `alert-row` を以下の形式に書き換える（各行に `alert-settings-btn` を追加）:

```html
<div class="alert-row">
  <div id="home-follow" class="toggle on" onclick="toggleAlert(this)"></div>
  <div class="alert-name">フォロー通知</div>
  <button class="alert-settings-btn" onclick="openAlertModal('follow')">設定 ⚙</button>
</div>
<div class="alert-row">
  <div id="home-subscribe" class="toggle on" onclick="toggleAlert(this)"></div>
  <div class="alert-name">サブスク通知</div>
  <button class="alert-settings-btn" onclick="openAlertModal('subscribe')">設定 ⚙</button>
</div>
<div class="alert-row">
  <div id="home-raid" class="toggle" onclick="toggleAlert(this)"></div>
  <div class="alert-name">レイド通知</div>
  <button class="alert-settings-btn" onclick="openAlertModal('raid')">設定 ⚙</button>
</div>
<div class="alert-row">
  <div id="home-bits" class="toggle" onclick="toggleAlert(this)"></div>
  <div class="alert-name">ビッツ通知</div>
  <button class="alert-settings-btn" onclick="openAlertModal('bits')">設定 ⚙</button>
</div>
<div class="alert-row">
  <div id="home-points" class="toggle" onclick="toggleAlert(this)"></div>
  <div class="alert-name">チャンネルポイント</div>
  <button class="alert-settings-btn" onclick="openAlertModal('channelPoints')">設定 ⚙</button>
</div>
```

- [ ] **Step 3: renderer/index.html — モーダルHTMLを追加**

`</body>` タグの直前、インライン `<style>` ブロックの前に以下のモーダルHTMLを挿入する:

```html
<!-- ─── Alert Settings Modal ─── -->
<div id="alert-modal" class="modal-overlay" style="display:none;" onclick="onModalOverlayClick(event)">
  <div class="modal-content">

    <!-- Header -->
    <div class="modal-header">
      <span id="modal-alert-title">フォロー通知の設定</span>
      <div style="display:flex; align-items:center; gap:12px;">
        <div id="modal-enabled-toggle" class="toggle on" onclick="toggleAlert(this); updateModalPreview();"></div>
        <button class="modal-close" onclick="closeAlertModal()">×</button>
      </div>
    </div>

    <!-- Preview -->
    <div class="modal-preview-area">
      <div id="modal-preview" class="alert-preview">
        <img id="preview-img" class="img-md" style="display:none;" alt="">
        <span id="preview-text">🎉 cypress_sticker さんがフォローしました！</span>
      </div>
      <button class="btn btn-secondary" onclick="previewAlertAnimation()" style="font-size:12px; padding:6px 16px;">▶ アニメーション確認</button>
    </div>

    <!-- 画像 -->
    <div class="modal-section">
      <div class="modal-section-label">画像</div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-secondary" onclick="selectModalImage()" style="font-size:12px; padding:8px 14px;">ファイルを選択</button>
        <span id="modal-image-name" style="font-size:12px; color:#adadb8; flex:1;">選択なし</span>
        <button id="modal-image-clear" class="alert-settings-btn" onclick="clearModalImage()" style="display:none;">✕ 削除</button>
      </div>
      <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
        <span style="font-size:12px; color:#adadb8;">サイズ：</span>
        <div class="size-selector">
          <button class="size-btn" data-size="sm" onclick="setModalImageSize('sm')">S</button>
          <button class="size-btn active" data-size="md" onclick="setModalImageSize('md')">M</button>
          <button class="size-btn" data-size="lg" onclick="setModalImageSize('lg')">L</button>
        </div>
      </div>
    </div>

    <!-- 効果音 -->
    <div class="modal-section">
      <div class="modal-section-label">効果音</div>
      <div class="radio-row">
        <label class="radio-label"><input type="radio" name="sound-type" value="default" onchange="onSoundTypeChange()"> デフォルト</label>
        <label class="radio-label"><input type="radio" name="sound-type" value="custom" onchange="onSoundTypeChange()"> カスタム</label>
        <label class="radio-label"><input type="radio" name="sound-type" value="none" onchange="onSoundTypeChange()"> なし</label>
      </div>
      <div id="custom-sound-row" style="display:none; align-items:center; gap:8px; margin-top:4px;">
        <button class="btn btn-secondary" onclick="selectModalSound()" style="font-size:12px; padding:8px 14px;">ファイルを選択</button>
        <span id="modal-sound-name" style="font-size:12px; color:#adadb8; flex:1;">選択なし</span>
      </div>
      <div id="volume-row" class="volume-row" style="margin-top:4px;">
        <span style="font-size:16px;">🔈</span>
        <input type="range" id="volume-slider" min="0" max="100" value="70" oninput="onVolumeChange(this.value)">
        <span id="volume-display" class="volume-value">70%</span>
        <button class="btn btn-secondary" onclick="testPlaySound()" style="font-size:12px; padding:6px 14px;">▶ テスト再生</button>
      </div>
    </div>

    <!-- アニメーション -->
    <div class="modal-section">
      <div class="modal-section-label">アニメーション</div>
      <div class="anim-selector">
        <button class="anim-btn active" data-anim="slide-up"   onclick="setModalAnimation('slide-up')">スライドアップ</button>
        <button class="anim-btn"        data-anim="slide-down" onclick="setModalAnimation('slide-down')">スライドダウン</button>
        <button class="anim-btn"        data-anim="fade-in"    onclick="setModalAnimation('fade-in')">フェードイン</button>
        <button class="anim-btn"        data-anim="zoom-in"    onclick="setModalAnimation('zoom-in')">ズームイン</button>
        <button class="anim-btn"        data-anim="bounce"     onclick="setModalAnimation('bounce')">バウンス</button>
      </div>
    </div>

    <!-- メッセージ -->
    <div class="modal-section">
      <div class="modal-section-label">メッセージ</div>
      <input type="text" id="modal-message" class="input" oninput="updateModalPreview()">
      <div class="var-hint">{user} = ユーザー名　{viewers} = 人数（レイド用）　{amount} = ビッツ数</div>
    </div>

    <!-- Footer -->
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeAlertModal()">キャンセル</button>
      <button class="btn btn-primary" onclick="saveAlertSettings()">保存</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: renderer/app.js — モーダルロジックを追加**

`app.js` の末尾（`confirmReset()` の後）に以下を追加:

```javascript
// ─── Alert Settings Modal ───────────────────────────────

const ALERT_LABELS = {
  follow:        'フォロー通知',
  subscribe:     'サブスク通知',
  raid:          'レイド通知',
  bits:          'ビッツ通知',
  channelPoints: 'チャンネルポイント通知',
};

const ALERT_KEY_TO_HOME_ID = {
  follow: 'follow', subscribe: 'subscribe', raid: 'raid', bits: 'bits', channelPoints: 'points',
};

let currentEditingAlert = null;

function openAlertModal(alertKey) {
  if (!settings) return;
  currentEditingAlert = alertKey;
  const s = settings.alerts[alertKey];

  document.getElementById('modal-alert-title').textContent = ALERT_LABELS[alertKey] + 'の設定';

  // ON/OFF
  document.getElementById('modal-enabled-toggle').classList.toggle('on', s.enabled);

  // 画像
  const imageName = s.image || '';
  document.getElementById('modal-image-name').textContent = imageName || '選択なし';
  document.getElementById('modal-image-clear').style.display = imageName ? 'block' : 'none';
  setModalImageSize(s.imageSize || 'md');

  // 効果音
  const soundType = s.soundType || 'default';
  const radioEl = document.querySelector(`input[name="sound-type"][value="${soundType}"]`);
  if (radioEl) radioEl.checked = true;
  document.getElementById('modal-sound-name').textContent = s.soundFile || '選択なし';
  document.getElementById('custom-sound-row').style.display = soundType === 'custom' ? 'flex' : 'none';
  document.getElementById('volume-row').style.display = soundType === 'none' ? 'none' : 'flex';
  const vol = s.volume ?? 70;
  document.getElementById('volume-slider').value = vol;
  document.getElementById('volume-display').textContent = vol + '%';

  // アニメーション
  setModalAnimation(s.animation || 'slide-up');

  // メッセージ
  document.getElementById('modal-message').value = s.message;

  updateModalPreview();
  document.getElementById('alert-modal').style.display = 'flex';
}

function closeAlertModal() {
  document.getElementById('alert-modal').style.display = 'none';
  currentEditingAlert = null;
}

function onModalOverlayClick(event) {
  if (event.target === document.getElementById('alert-modal')) closeAlertModal();
}

async function saveAlertSettings() {
  if (!currentEditingAlert || !settings) return;

  const soundType = document.querySelector('input[name="sound-type"]:checked')?.value || 'default';
  const activeSizeBtn  = document.querySelector('.size-btn.active');
  const activeAnimBtn  = document.querySelector('.anim-btn.active');
  const imageNameEl    = document.getElementById('modal-image-name');
  const soundNameEl    = document.getElementById('modal-sound-name');
  const imageName      = imageNameEl.textContent === '選択なし' ? '' : imageNameEl.textContent;
  const soundFile      = soundType === 'custom' ? (soundNameEl.textContent === '選択なし' ? '' : soundNameEl.textContent) : '';

  const updated = {
    enabled:   document.getElementById('modal-enabled-toggle').classList.contains('on'),
    message:   document.getElementById('modal-message').value,
    soundType,
    soundFile,
    volume:    parseInt(document.getElementById('volume-slider').value),
    image:     imageName,
    imageSize: activeSizeBtn ? activeSizeBtn.dataset.size : 'md',
    animation: activeAnimBtn ? activeAnimBtn.dataset.anim : 'slide-up',
  };

  settings.alerts[currentEditingAlert] = { ...settings.alerts[currentEditingAlert], ...updated };

  // ホームのトグルと同期
  const homeId = ALERT_KEY_TO_HOME_ID[currentEditingAlert];
  const homeToggle = document.getElementById('home-' + homeId);
  if (homeToggle) homeToggle.classList.toggle('on', updated.enabled);

  await window.api.saveSettings(settings);
  closeAlertModal();
}

function updateModalPreview() {
  const msgEl = document.getElementById('modal-message');
  const message = (msgEl ? msgEl.value : '') || '';
  const previewText = message
    .replace('{user}', 'cypress_sticker')
    .replace('{viewers}', '10')
    .replace('{amount}', '100');
  document.getElementById('preview-text').textContent = previewText || '（メッセージなし）';

  const imageName = document.getElementById('modal-image-name')?.textContent;
  const previewImg = document.getElementById('preview-img');
  const port = settings?.overlay?.port || 3001;
  if (imageName && imageName !== '選択なし') {
    previewImg.src = `http://localhost:${port}/custom/${imageName}`;
    previewImg.style.display = 'block';
  } else {
    previewImg.style.display = 'none';
  }

  // 画像サイズクラスを更新
  const activeSizeBtn = document.querySelector('.size-btn.active');
  if (activeSizeBtn && previewImg) {
    previewImg.className = 'img-' + activeSizeBtn.dataset.size;
  }
}

function previewAlertAnimation() {
  const preview = document.getElementById('modal-preview');
  const activeAnimBtn = document.querySelector('.anim-btn.active');
  const animName = activeAnimBtn ? activeAnimBtn.dataset.anim : 'slide-up';

  // アニメーションクラスをいったん除去してリフロー → 再付与
  preview.classList.remove('anim-slide-up', 'anim-slide-down', 'anim-fade-in', 'anim-zoom-in', 'anim-bounce');
  void preview.offsetWidth; // force reflow
  preview.classList.add('anim-' + animName);
  setTimeout(() => preview.classList.remove('anim-' + animName), 800);
}

function testPlaySound() {
  const soundType = document.querySelector('input[name="sound-type"]:checked')?.value;
  if (soundType === 'none') return;

  const port = settings?.overlay?.port || 3001;
  const volume = parseInt(document.getElementById('volume-slider').value) / 100;
  let src;

  if (soundType === 'custom') {
    const soundName = document.getElementById('modal-sound-name').textContent;
    if (!soundName || soundName === '選択なし') return;
    src = `http://localhost:${port}/custom/${soundName}`;
  } else {
    src = `http://localhost:${port}/sounds/chime.mp3`;
  }

  const audio = new Audio(src);
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.play().catch(() => {});
}

async function selectModalImage() {
  const filename = await window.api.selectAlertImage();
  if (!filename) return;
  document.getElementById('modal-image-name').textContent = filename;
  document.getElementById('modal-image-clear').style.display = 'block';
  updateModalPreview();
}

function clearModalImage() {
  document.getElementById('modal-image-name').textContent = '選択なし';
  document.getElementById('modal-image-clear').style.display = 'none';
  updateModalPreview();
}

async function selectModalSound() {
  const filename = await window.api.selectAlertSound();
  if (!filename) return;
  document.getElementById('modal-sound-name').textContent = filename;
}

function onSoundTypeChange() {
  const soundType = document.querySelector('input[name="sound-type"]:checked')?.value;
  document.getElementById('custom-sound-row').style.display = soundType === 'custom' ? 'flex' : 'none';
  document.getElementById('volume-row').style.display     = soundType === 'none' ? 'none' : 'flex';
}

function onVolumeChange(value) {
  document.getElementById('volume-display').textContent = value + '%';
}

function setModalImageSize(size) {
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.size === size);
  });
  updateModalPreview();
}

function setModalAnimation(anim) {
  document.querySelectorAll('.anim-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.anim === anim);
  });
}
```

- [ ] **Step 5: コミット**

```bash
git add renderer/index.html renderer/styles.css renderer/app.js
git commit -m "feat: alert settings modal with image/sound/animation/preview"
```

---

## 完了条件

1. ホームの各アラート行に「設定 ⚙」ボタンが表示される
2. ボタンをクリックするとモーダルが開き、そのイベントの設定が正しく読み込まれる
3. 画像を選択するとassets/custom/にコピーされ、プレビューに表示される（アラートサーバー起動中）
4. 効果音の「テスト再生」を押すと設定した音量で音が鳴る
5. 「アニメーション確認」でモーダル内プレビューがアニメーションする
6. 「保存」でsettings.jsonに書き込まれ、ホームのトグル状態と同期する
7. オーバーレイ（localhost:3001/overlay）が各イベントの画像・音・アニメーション設定を反映して表示する
