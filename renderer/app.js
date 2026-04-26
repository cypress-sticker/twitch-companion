// renderer/app.js
const stepLabels = ['認証', '機能選択', 'アラート', '定期コメント', '完了'];
const totalSteps = 5;
let currentStep = 1;
let settings = null;
let authenticated = false;

const MAX_COMMENTS = 10;

// ─── Modal Resize ────────────────────────────────────────────────────────────

// サイズを記憶（開くたびに引き継がれ、位置は毎回中央にリセット）
let modalSize = { w: 520, h: null };

function centerModal() {
  const modal = document.querySelector('.modal-content');
  if (!modal) return;
  if (!modalSize.h) modalSize.h = Math.round(window.innerHeight * 0.75);
  const w = Math.min(modalSize.w, window.innerWidth - 32);
  const h = Math.min(modalSize.h, window.innerHeight * 0.92);
  modal.style.width  = w + 'px';
  modal.style.height = h + 'px';
  modal.style.left   = Math.max(8, (window.innerWidth  - w) / 2) + 'px';
  modal.style.top    = Math.max(8, (window.innerHeight - h) / 2) + 'px';
}

function initModalResize() {
  const modal = document.querySelector('.modal-content');
  if (!modal) return;
  const MIN_W = 400, MIN_H = 440;
  let resizing = false, dir = '';
  let startX, startY, startW, startH, startLeft, startTop;

  modal.querySelectorAll('.rh').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      dir = handle.dataset.dir;
      startX = e.clientX;
      startY = e.clientY;
      startW = modal.offsetWidth;
      startH = modal.offsetHeight;
      startLeft = parseInt(modal.style.left) || 0;
      startTop  = parseInt(modal.style.top)  || 0;
    });
  });

  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let newW = startW, newH = startH, newLeft = startLeft, newTop = startTop;

    if (dir.includes('e')) newW = Math.max(MIN_W, startW + dx);
    if (dir.includes('w')) { newW = Math.max(MIN_W, startW - dx); newLeft = startLeft + (startW - newW); }
    if (dir.includes('s')) newH = Math.max(MIN_H, startH + dy);
    if (dir.includes('n')) { newH = Math.max(MIN_H, startH - dy); newTop = startTop + (startH - newH); }

    // ビューポート外にはみ出さないようにクランプ
    const margin = 8;
    if (dir.includes('e') && newLeft + newW > window.innerWidth - margin) {
      newW = Math.max(MIN_W, window.innerWidth - margin - newLeft);
    }
    if (dir.includes('s') && newTop + newH > window.innerHeight - margin) {
      newH = Math.max(MIN_H, window.innerHeight - margin - newTop);
    }
    if (dir.includes('w') && newLeft < margin) {
      newLeft = margin;
      newW = Math.max(MIN_W, startLeft + startW - newLeft);
    }
    if (dir.includes('n') && newTop < margin) {
      newTop = margin;
      newH = Math.max(MIN_H, startTop + startH - newTop);
    }

    modal.style.width  = newW + 'px';
    modal.style.height = newH + 'px';
    modal.style.left   = newLeft + 'px';
    modal.style.top    = newTop  + 'px';
    modalSize = { w: newW, h: newH };  // サイズのみ記憶
  });

  document.addEventListener('mouseup', () => { resizing = false; });
}

// ─── Theme ──────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-mode', isLight);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = isLight ? '☀️ ライト' : '🌙 ダーク';
}

async function toggleTheme() {
  if (!settings) return;
  const next = document.body.classList.contains('light-mode') ? 'dark' : 'light';
  applyTheme(next);
  settings.theme = next;
  await window.api.saveSettings({ theme: next });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  settings = await window.api.loadSettings();

  // テーマを最初に適用（ちらつき防止）
  applyTheme(settings.theme || 'dark');

  // モーダルリサイズ初期化
  initModalResize();

  // 共通設定UI初期化
  loadCommonSettingsUI();

  window.api.onAuthStatus((data) => {
    authenticated = data.authenticated;
    if (authenticated) {
      const usernameEl = document.getElementById('username');
      if (usernameEl) usernameEl.textContent = data.username;
    }
    updateUI();
  });

  window.api.onLoginSuccess((data) => {
    authenticated = true;
    const usernameEl = document.getElementById('username');
    if (usernameEl) usernameEl.textContent = data.username;
    updateUI();
    nextStep();
  });

  window.api.onLoginError((msg) => {
    alert('ログインエラー: ' + msg);
  });

  renderWizard();
  updateUI();
});

function updateUI() {
  const banner = document.getElementById('auth-banner');
  const homeContent = document.getElementById('home-content');

  if (!authenticated) {
    banner.style.display = 'block';
    homeContent.classList.add('disabled');
  } else {
    banner.style.display = 'none';
    homeContent.classList.remove('disabled');
  }
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('screen-' + name).classList.add('active');
  document.querySelector(`[data-screen="${name}"]`).classList.add('active');
}

function goToWizardStart() {
  syncHomeToWizard();
  currentStep = authenticated ? 2 : 1;
  showScreen('wizard');
  renderWizard();
}

function syncHomeToWizard() {
  // アラートトグル同期
  ['follow', 'subscribe', 'raid', 'bits', 'points'].forEach(key => {
    const home = document.getElementById('home-' + key);
    const wiz = document.getElementById('wiz-' + key);
    if (home && wiz) {
      wiz.classList.toggle('on', home.classList.contains('on'));
    }
  });

  // 定期コメント同期（ホーム→ウィザード）
  const homeList = document.getElementById('home-comment-list');
  const wizList  = document.getElementById('wiz-comment-list');
  const homeInterval = document.getElementById('interval-input');
  const wizInterval  = document.querySelector('#step-4 input[type="number"]');
  if (homeList && wizList) {
    const inputs = homeList.querySelectorAll('input[type="text"]');
    wizList.innerHTML = '';
    inputs.forEach(input => {
      const row = document.createElement('div');
      row.className = 'comment-row';
      row.innerHTML = `
        <input type="text" class="input" placeholder="メッセージを入力..." value="${input.value.replace(/"/g, '&quot;')}">
        <button class="delete-btn" onclick="removeComment(this)">×</button>
      `;
      wizList.appendChild(row);
    });
  }
  if (homeInterval && wizInterval) wizInterval.value = homeInterval.value;
}

function goToHome() {
  syncAlertsToHome();
  showScreen('home');
}

function renderWizard() {
  const stepper = document.getElementById('stepper');
  stepper.innerHTML = '';

  for (let i = 1; i <= totalSteps; i++) {
    const step = document.createElement('div');
    step.className = 'step' + (i === currentStep ? ' active' : i < currentStep ? ' done' : '');
    const stepNum = i;
    step.innerHTML = `
      <div class="step-circle" onclick="currentStep=${stepNum}; renderWizard();">${i < currentStep ? '✓' : i}</div>
      <div class="step-label">${stepLabels[i-1]}</div>
    `;
    stepper.appendChild(step);

    if (i < totalSteps) {
      const line = document.createElement('div');
      line.className = 'step-line' + (i < currentStep ? ' done' : '');
      stepper.appendChild(line);
    }
  }

  document.querySelectorAll('.wizard-step').forEach((el, idx) => {
    el.style.display = (idx + 1) === currentStep ? 'block' : 'none';
  });
}

function isAlertChecked() {
  return document.getElementById('feature-alert')?.classList.contains('checked') ?? true;
}

function isCommentChecked() {
  return document.getElementById('feature-comment')?.classList.contains('checked') ?? true;
}

function nextStep() {
  if (currentStep < totalSteps) {
    let next = currentStep + 1;
    if (next === 3 && !isAlertChecked()) next++;
    if (next === 4 && !isCommentChecked()) next++;
    currentStep = Math.min(next, totalSteps);
    renderWizard();
  }
}

function prevStep() {
  if (currentStep > 1) {
    let prev = currentStep - 1;
    if (prev === 4 && !isCommentChecked()) prev--;
    if (prev === 3 && !isAlertChecked()) prev--;
    currentStep = Math.max(prev, 1);
    renderWizard();
  }
}

function toggleFeature(el) {
  el.classList.toggle('checked');
}

function startLogin() {
  window.api.startLogin();
}

function logout() {
  if (confirm('ログアウトしますか？')) {
    window.api.logout();
    authenticated = false;
    updateUI();
  }
}

function syncAlertsToHome() {
  ['follow', 'subscribe', 'raid', 'bits', 'points'].forEach(key => {
    const wiz = document.getElementById('wiz-' + key);
    const home = document.getElementById('home-' + key);
    if (wiz && home) {
      home.classList.toggle('on', wiz.classList.contains('on'));
    }
  });

  // Sync periodic comment interval from wizard to home
  const wizInterval = document.querySelector('#step-4 input[type="number"]');
  const homeInterval = document.getElementById('interval-input');
  if (wizInterval && homeInterval) {
    homeInterval.value = wizInterval.value;
  }

  // Sync periodic comment messages from wizard to home
  const wizList = document.getElementById('wiz-comment-list');
  const homeList = document.getElementById('home-comment-list');
  if (wizList && homeList) {
    const wizInputs = wizList.querySelectorAll('input[type="text"]');
    if (wizInputs.length > 0) {
      homeList.innerHTML = '';
      wizInputs.forEach(input => {
        const row = document.createElement('div');
        row.className = 'comment-row';
        row.innerHTML = `
          <input type="text" class="input" placeholder="メッセージを入力..." value="${input.value.replace(/"/g, '&quot;')}">
          <button class="delete-btn" onclick="removeComment(this)">×</button>
        `;
        homeList.appendChild(row);
      });
    }
  }
}

// ─── Home Tabs ───────────────────────────────────────────────────────────────

function switchHomeTab(tab) {
  document.querySelectorAll('.home-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.home-tab-content').forEach(el => {
    el.style.display = el.id === 'home-tab-' + tab ? '' : 'none';
  });
}

// ─── Common Settings ─────────────────────────────────────────────────────────

function loadCommonSettingsUI() {
  if (!settings?.overlay) return;
  const ov = settings.overlay;

  // 位置グリッド
  document.querySelectorAll('.pos-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pos === (ov.position || 'bottom-center'));
  });

  // 表示時間
  const dur = Math.round((ov.displayDuration || 5000) / 1000);
  const durSlider = document.getElementById('duration-slider');
  if (durSlider) { durSlider.value = dur; document.getElementById('duration-display').textContent = dur + '秒'; }

  // フォント
  const fontSel = document.getElementById('font-select');
  if (fontSel) fontSel.value = ov.fontFamily || "'Yu Gothic UI', 'Yu Gothic', sans-serif";

  // フォントサイズ
  const sizeSlider = document.getElementById('fontsize-slider');
  if (sizeSlider) { sizeSlider.value = ov.fontSize || 18; document.getElementById('fontsize-display').textContent = (ov.fontSize || 18) + 'px'; }
}

function setPosition(btn) {
  document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function onDurationChange(val) {
  document.getElementById('duration-display').textContent = val + '秒';
}

function onFontsizeChange(val) {
  document.getElementById('fontsize-display').textContent = val + 'px';
}

async function saveCommonSettings() {
  if (!settings) return;
  const activePos = document.querySelector('.pos-btn.active');
  const newOverlay = {
    ...settings.overlay,
    position: activePos ? activePos.dataset.pos : 'bottom-center',
    displayDuration: parseInt(document.getElementById('duration-slider').value) * 1000,
    fontFamily: document.getElementById('font-select').value,
    fontSize: parseInt(document.getElementById('fontsize-slider').value),
  };
  settings.overlay = newOverlay;
  await window.api.saveSettings({ overlay: newOverlay });
}

function toggleAlert(el) {
  el.classList.toggle('on');
}

async function testAlert(key) {
  await window.api.testAlert(key);
}

function addComment(listId) {
  const list = document.getElementById(listId);
  if (list.children.length >= MAX_COMMENTS) return;

  const row = document.createElement('div');
  row.className = 'comment-row';
  row.innerHTML = `
    <input type="text" class="input" placeholder="メッセージを入力...">
    <button class="delete-btn" onclick="removeComment(this)">×</button>
  `;
  list.appendChild(row);
}

function removeComment(btn) {
  btn.parentElement.remove();
}

async function savePeriodicComments() {
  if (!settings) return;
  const messages = Array.from(document.querySelectorAll('#home-comment-list .input'))
    .map(el => el.value).filter(v => v.trim());
  const intervalMinutes = parseInt(document.getElementById('interval-input')?.value) || 30;
  const newPeriodic = { enabled: true, intervalMinutes, messages };
  settings.periodicComments = newPeriodic;
  await window.api.saveSettings({ periodicComments: newPeriodic });
  // bot-server が未起動なら起動を依頼
  if (messages.length > 0) window.api.startBotServer();
}

async function saveSettings() {
  if (!settings) return;
  const newSettings = {
    alerts: {
      follow:        { enabled: document.getElementById('home-follow')?.classList.contains('on') ?? false, message: settings.alerts.follow.message, sound: 'default', image: '' },
      subscribe:     { enabled: document.getElementById('home-subscribe')?.classList.contains('on') ?? false, message: settings.alerts.subscribe.message, sound: 'default', image: '' },
      raid:          { enabled: document.getElementById('home-raid')?.classList.contains('on') ?? false, message: settings.alerts.raid.message, sound: 'default', image: '' },
      bits:          { enabled: document.getElementById('home-bits')?.classList.contains('on') ?? false, message: settings.alerts.bits.message, sound: 'default', image: '' },
      channelPoints: { enabled: document.getElementById('home-points')?.classList.contains('on') ?? false, message: settings.alerts.channelPoints.message, sound: 'default', image: '' },
    },
    periodicComments: {
      enabled: true,
      intervalMinutes: parseInt(document.getElementById('interval-input')?.value) || 30,
      messages: Array.from(document.querySelectorAll('#home-comment-list .input')).map(el => el.value).filter(v => v.trim()),
    },
  };

  await window.api.saveSettings(newSettings);
  settings = { ...settings, ...newSettings };
}

async function copyOverlayUrl() {
  const url = await window.api.getOverlayUrl();
  try {
    await navigator.clipboard.writeText(url);
    alert('URLをコピーしました');
  } catch {
    alert('コピーに失敗しました。手動でURLをコピーしてください。');
  }
}

async function exportSettings() {
  const result = await window.api.exportSettings();
  if (result.ok) {
    alert('設定をエクスポートしました');
  }
}

async function importSettings() {
  const result = await window.api.importSettings();
  if (result.ok) {
    settings = result.settings;
    alert('設定をインポートしました');
    location.reload();
  } else if (result.error) {
    alert('インポートエラー: ' + result.error);
  }
}

async function confirmReset() {
  if (confirm('かんたん設定をやり直しますか？\n保存されていない設定がリセットされます。')) {
    settings = await window.api.resetSettings();

    // トグルをデフォルト状態にリセット（follow/subscribe: ON、それ以外: OFF）
    const alertDefaults = { follow: true, subscribe: true, raid: false, bits: false, points: false };
    ['follow', 'subscribe', 'raid', 'bits', 'points'].forEach(key => {
      ['wiz-', 'home-'].forEach(prefix => {
        const el = document.getElementById(prefix + key);
        if (el) el.classList.toggle('on', alertDefaults[key]);
      });
    });

    // コメント入力欄をクリア
    ['wiz-comment-list', 'home-comment-list'].forEach(listId => {
      const list = document.getElementById(listId);
      if (list) list.querySelectorAll('input[type="text"]').forEach(el => el.value = '');
    });

    // 投稿間隔をデフォルトに戻す
    const intervalInput = document.getElementById('interval-input');
    if (intervalInput) intervalInput.value = '30';

    currentStep = authenticated ? 2 : 1;
    showScreen('wizard');
    renderWizard();
  }
}

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

  // ON/OFF — ホームのトグルDOM状態を優先（settings未保存の場合に対応）
  const homeId = ALERT_KEY_TO_HOME_ID[alertKey];
  const homeToggle = document.getElementById('home-' + homeId);
  const isEnabled = homeToggle ? homeToggle.classList.contains('on') : s.enabled;
  document.getElementById('modal-enabled-toggle').classList.toggle('on', isEnabled);

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

  // チャット投稿セクション（レイドのみ表示）
  const raidChatSection = document.getElementById('modal-raid-chat-section');
  if (raidChatSection) {
    raidChatSection.style.display = alertKey === 'raid' ? 'flex' : 'none';
    document.getElementById('modal-chat-message').value = s.chatMessage || '';
  }

  updateModalPreview();
  centerModal();  // 毎回中央に配置（サイズは前回を引き継ぐ）
  document.getElementById('alert-modal').style.display = 'block';
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
    ...(currentEditingAlert === 'raid' && {
      chatMessage: document.getElementById('modal-chat-message').value,
    }),
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
    previewImg.src = `http://localhost:${port}/custom/${encodeURIComponent(imageName)}`;
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
