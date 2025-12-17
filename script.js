'use strict';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://rjpebjpgfuabljxskemm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqcGVianBnZnVhYmxqeHNrZW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NDA1NTksImV4cCI6MjA4MTUxNjU1OX0.UuF6Dxo2JgMvVOvSj1NwS_ZKTho_-EDH9B5T_Px9cXo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MODES = {
    deep: { id: 'deep', label: '深度工作', mins: 25, color: 'var(--color-deep)', class: 'bg-deep' },
    break: { id: 'break', label: '娱乐休息', mins: 5, color: 'var(--color-break)', class: 'bg-break' },
    chore: { id: 'chore', label: '琐事时间', mins: 2, color: 'var(--color-chore)', class: 'bg-chore' },
    fitness: { id: 'fitness', label: '健身时间', mins: 40, color: 'var(--color-fitness)', class: 'bg-fitness' }
};
const TARGET_MINUTES = 840;

const state = {
    currentMode: null,
    timeLeft: 0,
    totalTime: 0,
    isRunning: false,
    timerInterval: null,
    startTime: null,
    sessions: [],
    circumference: 0
};

const els = {
    mainView: document.getElementById('main-view'),
    timerView: document.getElementById('timer-view'),
    timerDisplay: document.getElementById('time-left'),
    timerLabel: document.getElementById('timer-mode-label'),
    btnToggle: document.getElementById('btn-toggle'),
    btnReset: document.getElementById('btn-reset'),
    circle: document.querySelector('.progress-ring__circle'),
    suggestionArea: document.getElementById('suggestion-area'),
    btnNext: document.getElementById('btn-next-mode'),
    btnHome: document.getElementById('btn-back-home'),
    statsStack: document.getElementById('daily-progress-stack'),
    statsSummary: document.getElementById('progress-summary'),
    totalTracked: document.getElementById('total-tracked'),
    sessionTimeline: document.getElementById('session-timeline'),
    statsDate: document.getElementById('stats-date')
};

async function init() {
    const radius = els.circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    els.circle.style.strokeDasharray = `${circumference} ${circumference}`;
    els.circle.style.strokeDashoffset = circumference;
    state.circumference = circumference;

    if ('Notification' in window) Notification.requestPermission();

    loadLocalData();
    await syncFromSupabase();
    renderStats();

    els.btnToggle.addEventListener('click', toggleTimer);
    els.btnReset.addEventListener('click', resetTimer);
    els.btnHome.addEventListener('click', exitTimer);
    els.btnNext.addEventListener('click', () => {
        const next = els.btnNext.dataset.nextMode;
        if (next) app.selectMode(next);
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }
}

function loadLocalData() {
    const stored = localStorage.getItem('pomo_sessions');
    if (stored) state.sessions = JSON.parse(stored);
}

async function syncFromSupabase() {
    try {
        const { data, error } = await supabase
            .from('sessions')
            .select('*')
            .order('start_time', { ascending: false });
        if (error) throw error;
        if (data?.length > 0) {
            state.sessions = data.map(r => ({
                id: r.id,
                mode: r.mode,
                duration: r.duration,
                start: r.start_time,
                end: r.end_time,
                note: r.note || ''
            }));
            localStorage.setItem('pomo_sessions', JSON.stringify(state.sessions));
            renderStats();  // 同步后立即刷新显示
        }
    } catch (e) {
        console.warn('云端加载失败，使用本地数据', e);
    }
}

async function saveSession(session) {
    state.sessions.unshift(session);
    localStorage.setItem('pomo_sessions', JSON.stringify(state.sessions));

    try {
        const { data, error } = await supabase.from('sessions').insert({
            mode: session.mode,
            duration: session.duration,
            start_time: session.start,
            end_time: session.end,
            note: session.note
        });
        if (error) throw error;
        // 插入成功后，用云端返回的 id 替换本地临时 id（可选优化）
        if (data && data[0]) {
            session.id = data[0].id;
            localStorage.setItem('pomo_sessions', JSON.stringify(state.sessions));
        }
    } catch (e) {
        console.warn('云端保存失败，数据保留本地', e);
    }

    renderStats();
}

async function updateSessionNote(id, text) {
    const s = state.sessions.find(x => x.id === id);
    if (s) {
        s.note = text;
        localStorage.setItem('pomo_sessions', JSON.stringify(state.sessions));
    }

    try {
        await supabase.from('sessions').update({ note: text }).eq('id', id);
    } catch (e) {
        console.warn('笔记同步失败', e);
    }
}

const app = {
    selectMode: (key) => {
        const m = MODES[key];
        state.currentMode = key;
        state.totalTime = m.mins * 60;
        state.timeLeft = state.totalTime;
        state.isRunning = false;

        document.documentElement.style.setProperty('--theme-color', m.color);
        els.timerLabel.textContent = m.label;
        updateTimerDisplay();
        els.circle.style.strokeDashoffset = 0;
        els.btnToggle.textContent = '开始';
        els.suggestionArea.classList.add('hidden');
        els.timerView.classList.remove('hidden');
    }
};

function toggleTimer() {
    state.isRunning ? pauseTimer() : startTimer();
}

function startTimer() {
    state.isRunning = true;
    state.startTime = new Date();
    els.btnToggle.textContent = '暂停';

    state.timerInterval = setInterval(() => {
        state.timeLeft--;
        updateTimerDisplay();

        const offset = state.circumference - (state.timeLeft / state.totalTime) * state.circumference;
        els.circle.style.strokeDashoffset = offset;

        if (state.timeLeft <= 0) completeTimer();
    }, 1000);
}

function pauseTimer() {
    state.isRunning = false;
    clearInterval(state.timerInterval);
    els.btnToggle.textContent = '继续';
}

function resetTimer() {
    pauseTimer();
    if (confirm('确定放弃当前计时？')) exitTimer();
}

function exitTimer() {
    pauseTimer();
    els.timerView.classList.add('hidden');
}

function completeTimer() {
    pauseTimer();
    state.timeLeft = 0;
    updateTimerDisplay();
    playBeep();

    if (Notification.permission === 'granted') {
        new Notification('计时完成！', { body: `${MODES[state.currentMode].label} 已结束` });
    }

    const endTime = new Date();
    const startTime = new Date(endTime - MODES[state.currentMode].mins * 60000);

    saveSession({
        id: Date.now(),  // 临时 id
        mode: state.currentMode,
        duration: MODES[state.currentMode].mins,
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        note: ''
    });

    els.btnToggle.classList.add('hidden');
    els.suggestionArea.classList.remove('hidden');
    suggestNextMode();
    renderStats();
}

function updateTimerDisplay() {
    const m = Math.floor(state.timeLeft / 60).toString().padStart(2, '0');
    const s = (state.timeLeft % 60).toString().padStart(2, '0');
    els.timerDisplay.textContent = `${m}:${s}`;
}

function playBeep() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.1;
    o.start();
    setTimeout(() => o.stop(), 500);
}

function suggestNextMode() {
    let next = 'break';
    if (state.currentMode === 'deep') next = 'break';
    else if (state.currentMode === 'break') next = 'deep';
    else if (state.currentMode === 'fitness') next = 'break';

    els.btnNext.textContent = `开始 ${MODES[next].label}`;
    els.btnNext.dataset.nextMode = next;
}

function renderStats() {
    const today = new Date().toLocaleDateString();
    let todayMins = 0;
    const breakdown = { deep: 0, break: 0, chore: 0, fitness: 0 };

    state.sessions.forEach(s => {
        if (new Date(s.start).toLocaleDateString() === today) {
            todayMins += s.duration;
            breakdown[s.mode] += s.duration;
        }
    });

    els.statsStack.innerHTML = '';
    const scale = Math.max(TARGET_MINUTES, todayMins);
    Object.keys(breakdown).forEach(k => {
        if (breakdown[k] > 0) {
            const pct = (breakdown[k] / scale) * 100;
            const bar = document.createElement('div');
            bar.className = `progress-segment bg-${k}`;
            bar.style.width = `${pct}%`;
            if (todayMins > TARGET_MINUTES) bar.classList.add('over-limit');
            els.statsStack.appendChild(bar);
        }
    });

    const pct = ((todayMins / TARGET_MINUTES) * 100).toFixed(1);
    els.totalTracked.textContent = `${todayMins}m / 840m`;
    els.statsSummary.textContent = `今日已追踪 ${todayMins} 分钟 (占 14 小时的 ${pct}%)`;

    els.sessionTimeline.innerHTML = '';
    state.sessions.forEach(s => {
        const card = document.createElement('div');
        card.className = `session-card border-${s.mode}`;

        const date = new Date(s.start).toLocaleDateString('zh-CN');
        const startT = new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endT = new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let html = `
            <div class="session-header">
                <strong>${MODES[s.mode].label} • ${date}</strong>
                <span>${startT} - ${endT}</span>
            </div>
        `;
        if (s.duration >= 20) {
            html += `<textarea class="session-note" placeholder="这个时段做了什么..." onblur="updateSessionNote(${s.id}, this.value)">${s.note || ''}</textarea>`;
        }
        card.innerHTML = html;
        els.sessionTimeline.appendChild(card);
    });
}

window.app = app;
window.updateSessionNote = updateSessionNote;

init();
