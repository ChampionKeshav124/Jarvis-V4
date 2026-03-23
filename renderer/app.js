// ═══════════════════════════════════════════════════════════════
//  JARVIS V4 — State Machine & Voice recognition
// ═══════════════════════════════════════════════════════════════

const input       = document.getElementById('commandInput');
const sendBtn     = document.getElementById('sendBtn');
const panel       = document.getElementById('responsePanel');
const statusBadge = document.getElementById('statusBadge');
const statusText  = document.getElementById('statusText');
const cpuBar      = document.getElementById('cpuBar');
const ramBar      = document.getElementById('ramBar');
const cpuValue    = document.getElementById('cpuValue');
const ramValue    = document.getElementById('ramValue');
const systemStatus = document.getElementById('systemStatus');
const clockDisplay = document.getElementById('clockDisplay');
const btnVoiceToggle = document.getElementById('btnVoiceToggle');
const voiceLabel = document.getElementById('voiceLabel');
const voiceIcon = document.querySelector('.voice-icon');
const btnAllowMic = document.getElementById('btnAllowMic');
const btnManualWake = document.getElementById('btnManualWake');

// State Manager
const APP_STATE = {
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING'
};

let currentState = APP_STATE.IDLE;
let isVoiceEnabled = true;
let currentAudio = null;
let wakeWords = [];

// Speech Recognition Setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

let rollingTranscript = ""; // Rolling buffer for wake words

if (SpeechRecognition) {
  // We now use the Native Windows Bridge in V4.3
  console.log("Speech Recognition engine bypassed. Using Native Windows Bridge.");
  
  recognition = {
      start: () => console.log("Native listener is running in background."),
      stop: () => {}
  };
}

// ── Audio Visualizer ────────────────────────────────────────

async function initVisualizer() {
  const canvas = document.getElementById('micVisualizer');
  const ctx = canvas.getContext('2d');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    canvas.width = 140;
    canvas.height = 140;

    function draw() {
    requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 60;
    const barCount = 40;
    
    // Calculate Average Volume for Shout Detection
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    let avgVolume = sum / dataArray.length;

    // SHOUT DETECTION: If avgVolume > 80 (approx 85% intensity)
    if (currentState === APP_STATE.IDLE && avgVolume > 80) {
        console.log("SHOUT DETECTED: Vol", avgVolume);
        activateJarvis();
    }

    // Colors based on state
    let accent = '#00d4ff'; // Blue (Idle)
    if (currentState === APP_STATE.LISTENING) accent = '#00ffcc'; // Cyan
    if (currentState === APP_STATE.PROCESSING) accent = '#ffaa00'; // Amber
    if (avgVolume > 85) accent = '#ff3333'; // RED on Peak (Shout)

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 5, 0, Math.PI * 2);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;
      const barHeight = (dataArray[i] / 255) * 40;

      const x1 = centerX + Math.cos(angle) * radius;
      const y1 = centerY + Math.sin(angle) * radius;
      const x2 = centerX + Math.cos(angle) * (radius + barHeight);
      const y2 = centerY + Math.sin(angle) * (radius + barHeight);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
    draw();
  } catch (err) {
    console.warn("Visualizer failed:", err);
    appendMessage('SYSTEM >', 'Microphone hardware not detected or blocked.', 'error');
  }
}

// ── Manual Controls ────────────────────────────────────────

btnAllowMic.addEventListener('click', () => {
  if (recognition) {
    try {
      recognition.start();
      btnAllowMic.style.display = 'none';
      appendMessage('SYSTEM >', 'Microphone initialized.', 'system');
    } catch (e) {
      console.log("Recognition already started or failed:", e);
    }
  }
});

btnManualWake.addEventListener('click', () => {
  if (currentState === APP_STATE.IDLE) activateJarvis();
});

// ── State Transitions ───────────────────────────────────────

function setUIState(state) {
  currentState = state;
  document.body.classList.remove('idle-mode');
  statusBadge.classList.remove('status-badge--idle', 'status-badge--listening', 'processing');

  switch (state) {
    case APP_STATE.IDLE:
      document.body.classList.add('idle-mode');
      statusBadge.classList.add('status-badge--idle');
      statusText.textContent = 'IDLE';
      systemStatus.textContent = 'AWAITING ACTIVATION';
      systemStatus.style.color = '';
      input.disabled = true;
      input.placeholder = "SAY 'JARVIS WAKE UP' TO ACTIVATE...";
      break;
    
    case APP_STATE.LISTENING:
      statusBadge.classList.add('status-badge--listening');
      statusText.textContent = 'LISTENING';
      systemStatus.textContent = 'LISTENING...';
      systemStatus.style.color = '#ff00ff';
      input.disabled = false;
      input.placeholder = "GIVE A COMMAND...";
      input.focus();
      break;

    case APP_STATE.PROCESSING:
      statusBadge.classList.add('processing');
      statusText.textContent = 'PROCESSING';
      systemStatus.textContent = 'PROCESSING...';
      systemStatus.style.color = '#ffaa00';
      input.disabled = true;
      break;
  }
}

async function activateJarvis() {
  if (currentState !== APP_STATE.IDLE) return;
  setUIState(APP_STATE.LISTENING);
  appendMessage('SYSTEM >', 'Wake word detected.', 'system');
  await sendCommand("__system_startup__", true);
}

// ── Actions ─────────────────────────────────────────────────

async function sendCommand(overrideText = null, isActivation = false) {
  const text = overrideText || input.value.trim();
  if (!text) return;

  if (!isActivation) {
    appendMessage('USER >', text, 'user');
    input.value = '';
    setUIState(APP_STATE.PROCESSING);
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  try {
    const result = await window.jarvis.sendCommand({ 
      text: text, 
      voice: isVoiceEnabled 
    });

    if (result.action === 'exit') {
      appendMessage('JARVIS >', result.response, 'system');
      if (result.audio_base64) playAudio(result.audio_base64);
      setTimeout(() => window.jarvis.close(), 2500);
      return;
    }

    if (result.audio_base64) playAudio(result.audio_base64);
    await typeMessage('JARVIS >', result.response || 'System encountered an error.', 'system');

  } catch (err) {
    appendMessage('SYSTEM >', 'AI core communication failed.', 'error');
  }

  if (!isActivation) {
    setTimeout(() => setUIState(APP_STATE.IDLE), 1500);
  } else {
    setUIState(APP_STATE.LISTENING);
  }
}

// ── Components ──────────────────────────────────────────────

function playAudio(base64Data) {
  try {
    const audioSrc = 'data:audio/mpeg;base64,' + base64Data;
    currentAudio = new Audio(audioSrc);
    currentAudio.onplay  = () => document.body.classList.add('speaking-active');
    currentAudio.onended = () => document.body.classList.remove('speaking-active');
    currentAudio.onerror = () => document.body.classList.remove('speaking-active');
    currentAudio.play().catch(e => {
      document.body.classList.remove('speaking-active');
      console.error("Audio blocked:", e);
    });
  } catch (err) { console.error("Audio error:", err); }
}

async function typeMessage(prefix, text, type) {
  const msg = document.createElement('div');
  msg.className = `response-message response-message--${type}`;
  msg.innerHTML = `<span class="response-prefix">${prefix}</span><span class="response-text"></span>`;
  panel.appendChild(msg);
  const textSpan = msg.querySelector('.response-text');

  const chars = text.split('');
  for (let i = 0; i < chars.length; i++) {
    textSpan.textContent += chars[i];
    panel.scrollTop = panel.scrollHeight;
    await new Promise(r => setTimeout(r, 15));
  }
}

function appendMessage(prefix, text, type) {
  const msg = document.createElement('div');
  msg.className = `response-message response-message--${type}`;
  msg.innerHTML = `<span class="response-prefix">${prefix}</span><span class="response-text">${text}</span>`;
  panel.appendChild(msg);
  panel.scrollTop = panel.scrollHeight;
}

// ── System Initialization ─────────────────────────────────────

async function startSystem() {
  console.log("Activating System...");
  const overlay = document.getElementById('activationOverlay');
  if (overlay) overlay.style.display = 'none';

  // Enter IDLE mode first so the UI looks active
  setUIState(APP_STATE.IDLE);
  
  appendMessage('SYSTEM >', 'Neural link established. Systems online.', 'system');

  // Load mic features in background so they don't block the UI
  try {
    initVisualizer();
    if (recognition) {
        recognition.start();
        appendMessage('SYSTEM >', 'Voice Monitoring Active.', 'system');
    }
  } catch (err) {
    console.error("Mic init fail:", err);
    appendMessage('SYSTEM >', 'Voice hardware unavailable.', 'error');
  }
}

// ── Lifecycle ───────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  const config = await window.jarvis.getConfig();
  wakeWords = config.wakeWords;
  console.log("V4 Initialized. Monitoring for:", wakeWords);
  
  // Manual activation listener
  window.jarvis.onWakeJarvis(() => {
    console.log("Global Wake Triggered");
    if (currentState === APP_STATE.IDLE) activateJarvis();
  });

  // Stats & Clock
  initStatsAndClock();
});

function initStatsAndClock() {
  setInterval(async () => {
    try {
      const stats = await window.jarvis.getSystemStats();
      cpuBar.style.width = stats.cpu + '%';
      cpuValue.textContent = stats.cpu + '%';
      ramBar.style.width = stats.ram + '%';
      ramValue.textContent = stats.ram + '%';
    } catch {}
  }, 3000);

  setInterval(() => {
    clockDisplay.textContent = new Date().toLocaleTimeString();
  }, 1000);
}

// Controls
const safeAddListener = (id, event, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
};

safeAddListener('btnMinimize', 'click', () => window.jarvis.minimize());
safeAddListener('btnMaximize', 'click', () => window.jarvis.maximize());
safeAddListener('btnClose', 'click', () => window.jarvis.close());
safeAddListener('sendBtn', 'click', () => sendCommand());
safeAddListener('btnActivateSystem', 'click', startSystem);
safeAddListener('btnManualWake', 'click', () => { if (currentState === APP_STATE.IDLE) activateJarvis(); });
safeAddListener('btnAllowMic', 'click', () => recognition && recognition.start());

input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCommand(); });

btnVoiceToggle.addEventListener('click', () => {
  isVoiceEnabled = !isVoiceEnabled;
  voiceLabel.textContent = isVoiceEnabled ? 'VOICE ON' : 'VOICE OFF';
  voiceIcon.textContent = isVoiceEnabled ? '🔊' : '🔇';
  if (!isVoiceEnabled && currentAudio) currentAudio.pause();
});
