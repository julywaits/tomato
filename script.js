'use strict';

/**
 * CONFIGURATION & STATE
 */
const MODES = {
    deep: { id: 'deep', label: '深度工作', mins: 25, color: 'var(--color-deep)', icon: '🧠', short: '深度' },
    break: { id: 'break', label: '娱乐休息', mins: 5, color: 'var(--color-break)', icon: '☕', short: '休息' },
    chore: { id: 'chore', label: '琐事时间', mins: 2, color: 'var(--color-chore)', icon: '✓', short: '琐事' },
    fitness: { id: 'fitness', label: '健身时间', mins: 40, color: 'var(--color-fitness)', icon: '💪', short: '健身' }
};

const TARGET_MINUTES = 14 * 60; // 840 mins

const state = {
    currentMode: null,
    timeLeft: 0, // seconds
    totalTime: 0, // seconds
    isRunning: false,
    timerInterval: null,
    startTime: null,
    sessions: []
};

/**
 * DOM ELEMENTS
 */
const els = {
    timerView: document.getElementById('timer-view'),
    timerDisplay: document.getElementById('time-left'),
    timerLabel: document.getElementById('timer-mode-label'),
    btnToggle: document.getElementById('btn-toggle'),
    btnReset: document.getElementById('btn-reset'),
    circle: document.querySelector('.progress-ring__circle'),
    suggestionArea: document.getElementById('suggestion-area'),
    btnNext: document.getElementById('btn-next-mode'),
    btnHome: document.getElementById('btn-back-home'),
    
    // Stats Elements
    statsSummaryGrid: document.getElementById('stats-summary-grid'),
    dailyProgressList: document.getElementById('daily-progress-list'),
    totalTrackedText: document.getElementById('total-tracked-text'),
    sessionTimeline: document.getElementById('session-timeline'),
    emptyState: document.getElementById('empty-state')
};

/**
 * INITIALIZATION
 */
function init() {
    // Setup Circle SVG
    const radius = els.circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    els.circle.style.strokeDasharray = `${circumference} ${circumference}`;
    els.circle.style.strokeDashoffset = circumference;
    state.circumference = circumference;

    // Permissions
    if ('Notification' in window) Notification.requestPermission();

    // Load Data
    loadData();
    renderStats();

    // Event Listeners
    els.btnToggle.addEventListener('click', toggleTimer);
    els.btnReset.addEventListener('click', resetTimer);
    els.btnHome.addEventListener('click', exitTimer);
    els.btnNext.addEventListener('click', () => {
        const next = els.btnNext.dataset.nextMode;
        if(next) app.selectMode(next);
    });

    // Theme Toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
    });

    // Check Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('SW Registered'))
            .catch(e => console.error('SW Fail:', e));
    }
}

/**
 * TIMER LOGIC
 */
const app = {
    selectMode: (modeKey) => {
        const mode = MODES[modeKey];
        state.currentMode = modeKey;
        state.totalTime = mode.mins * 60;
        state.timeLeft = state.totalTime;
        state.isRunning = false;
        
        // Update UI
        document.documentElement.style.setProperty('--theme-color', mode.color);
        els.timerLabel.textContent = mode.label;
        updateTimerDisplay();
        
        // Reset Circle to full
        els.circle.style.strokeDashoffset = 0; 

        els.btnToggle.textContent = '开始';
        els.btnToggle.classList.remove('hidden');
        els.suggestionArea.classList.add('hidden');
        
        // Show Timer View
        els.timerView.classList.remove('hidden');
    }
};

function toggleTimer() {
    if (state.isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    state.isRunning = true;
    state.startTime = new Date();
    els.btnToggle.textContent = '暂停';
    
    state.timerInterval = setInterval(() => {
        state.timeLeft--;
        updateTimerDisplay();
        
        // Update Circle
        // Calculate offset to shrink the ring
        const offset = state.circumference - (state.timeLeft / state.totalTime) * state.circumference;
        els.circle.style.strokeDashoffset = offset;

        if (state.timeLeft <= 0) {
            completeTimer();
        }
    }, 1000);
}

function pauseTimer() {
    state.isRunning = false;
    clearInterval(state.timerInterval);
    els.btnToggle.textContent = '继续';
}

function resetTimer() {
    pauseTimer();
    if(confirm('确定要放弃当前计时吗？')) {
        exitTimer();
    }
}

function exitTimer() {
    pauseTimer();
    els.timerView.classList.add('hidden');
    renderStats(); 
}

function completeTimer() {
    pauseTimer();
    state.timeLeft = 0;
    updateTimerDisplay();
    
    // Sound
    playBeep();
    if (Notification.permission === 'granted') {
        new Notification("计时结束!", { body: `${MODES[state.currentMode].label} 已完成。` });
    }

    // Save Session
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - MODES[state.currentMode].mins * 60000);
    
    saveSession({
        id: Date.now(),
        mode: state.currentMode,
        duration: MODES[state.currentMode].mins,
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        note: ''
    });

    // UI Updates
    els.btnToggle.classList.add('hidden');
    els.suggestionArea.classList.remove('hidden');
    
    suggestNextMode();
    renderStats();
}

function updateTimerDisplay() {
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    els.timerDisplay.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function playBeep() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880; 
    gain.gain.value = 0.1;
    osc.start();
    setTimeout(() => {
        osc.stop();
        ctx.close();
    }, 500);
}

function suggestNextMode() {
    let next = 'break';
    if (state.currentMode === 'deep') next = 'break';
    else if (state.currentMode === 'break') next = 'deep';
    else if (state.currentMode === 'chore') next = 'deep';
    else if (state.currentMode === 'fitness') next = 'break';

    els.btnNext.textContent = `开始: ${MODES[next].label}`;
    els.btnNext.dataset.nextMode = next;
}

/**
 * DATA & STATS
 */
function loadData() {
    const todayStr = new Date().toLocaleDateString();
    const lastDate = localStorage.getItem('pomo_last_date');
    
    if (lastDate !== todayStr) {
        state.sessions = [];
        localStorage.setItem('pomo_last_date', todayStr);
        localStorage.setItem('pomo_sessions', JSON.stringify([]));
    } else {
        const stored = localStorage.getItem('pomo_sessions');
        state.sessions = stored ? JSON.parse(stored) : [];
    }
}

function saveSession(session) {
    state.sessions.push(session);
    localStorage.setItem('pomo_sessions', JSON.stringify(state.sessions));
}

function updateSessionNote(id, text) {
    const idx = state.sessions.findIndex(s => s.id === id);
    if (idx !== -1) {
        state.sessions[idx].note = text;
        localStorage.setItem('pomo_sessions', JSON.stringify(state.sessions));
    }
}

function renderStats() {
    // Aggregates
    let totalMins = 0;
    const breakdown = {
        deep: { count: 0, mins: 0 },
        break: { count: 0, mins: 0 },
        chore: { count: 0, mins: 0 },
        fitness: { count: 0, mins: 0 }
    };
    
    state.sessions.forEach(s => {
        totalMins += s.duration;
        if(breakdown[s.mode]) {
            breakdown[s.mode].count++;
            breakdown[s.mode].mins += s.duration;
        }
    });

    // 1. Render Summary Grid (Counts)
    els.statsSummaryGrid.innerHTML = '';
    Object.keys(breakdown).forEach(key => {
        const mode = MODES[key];
        const data = breakdown[key];
        const div = document.createElement('div');
        div.className = 'summary-item';
        div.innerHTML = `
            <span class="summary-icon text-${key}">${mode.icon}</span>
            <span class="summary-count">${data.count}</span>
            <span class="summary-label">${mode.short}</span>
        `;
        els.statsSummaryGrid.appendChild(div);
    });

    // 2. Render Daily Progress List (Detailed Bars)
    els.totalTrackedText.textContent = `${totalMins} / ${TARGET_MINUTES} 分钟`;
    els.dailyProgressList.innerHTML = '';

    Object.keys(breakdown).forEach(key => {
        const mode = MODES[key];
        const mins = breakdown[key].mins;
        const pct = ((mins / TARGET_MINUTES) * 100).toFixed(1);
        const width = Math.min(100, (mins / TARGET_MINUTES) * 100);

        const row = document.createElement('div');
        row.className = 'progress-row';
        row.innerHTML = `
            <div class="row-header">
                <span class="row-label">${mode.label}</span>
                <span class="row-stats">${mins} 分钟 / ${pct}%</span>
            </div>
            <div class="progress-track">
                <div class="progress-fill bg-${key}" style="width: ${width}%"></div>
            </div>
        `;
        els.dailyProgressList.appendChild(row);
    });

    // 3. Toggle Empty State vs Timeline
    if (state.sessions.length === 0) {
        els.emptyState.classList.remove('hidden');
        els.sessionTimeline.classList.add('hidden');
    } else {
        els.emptyState.classList.add('hidden');
        els.sessionTimeline.classList.remove('hidden');
        renderTimeline();
    }
}

function renderTimeline() {
    els.sessionTimeline.innerHTML = '';
    [...state.sessions].reverse().forEach(s => {
        const div = document.createElement('div');
        div.className = 'session-card';
        div.style.borderLeft = `4px solid ${MODES[s.mode].color}`;
        
        const startStr = new Date(s.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let html = `
            <div class="session-top">
                <strong class="text-${s.mode}">${MODES[s.mode].label}</strong>
                <span class="session-time">${startStr} (+${s.duration}m)</span>
            </div>
        `;

        if (s.duration >= 20) {
            html += `<input type="text" class="session-note" placeholder="做了什么？" value="${s.note || ''}" onblur="updateSessionNote(${s.id}, this.value)">`;
        }
        
        div.innerHTML = html;
        els.sessionTimeline.appendChild(div);
    });
}

// Global exposure
window.app = app;
window.updateSessionNote = updateSessionNote;

// Run
init();