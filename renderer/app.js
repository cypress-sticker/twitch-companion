// renderer/app.js
const stepLabels = ['認証', '機能選択', 'アラート', '定期コメント', '完了'];
const totalSteps = 5;
let currentStep = 1;
let settings = null;
let authenticated = false;

const MAX_COMMENTS = 10;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  settings = await window.api.loadSettings();

  window.api.onAuthStatus((data) => {
    authenticated = data.authenticated;
    if (authenticated) {
      document.getElementById('username').textContent = data.username;
    }
    updateUI();
  });

  window.api.onLoginSuccess((data) => {
    authenticated = true;
    document.getElementById('username').textContent = data.username;
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
  currentStep = 1;
  showScreen('wizard');
  renderWizard();
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
}

function toggleAlert(el) {
  el.classList.toggle('on');
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

async function saveSettings() {
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
  navigator.clipboard.writeText(url);
  alert('URLをコピーしました');
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

function confirmReset() {
  if (confirm('かんたん設定をやり直しますか？\n保存されていない設定がリセットされます。')) {
    window.api.resetSettings();
    currentStep = 1;
    showScreen('wizard');
    renderWizard();
  }
}
